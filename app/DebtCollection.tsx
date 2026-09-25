"use client";

/* Accounts Receivable, module 4: Debt Collection.

   The invoices whose due date has passed unpaid, each a case. Accounts log every call,
   email, status and payment against a case until the payments cover the invoice, then
   send it to audit, who verify the collection. The flow lives in
   lib/collection-stages.ts; the server checks every entry again. */

import{useMemo,useState}from"react";
import{ArrowRight,CheckCircle2,Mail,Phone,Plus,RotateCcw,Search,ShieldCheck,Wallet,X,MessageSquareText}from"lucide-react";
import{collectionApi}from"./audit-api";
import type{Collection}from"./audit-api";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import Attachments from"./Attachments";
import{ACCOUNTS_ROLES,STAGES,STATUSES,STEP_LABEL,isCollected,isVerified,mayLog,mayVerify,stageIndex}from"../lib/collection-stages";
import{stamp}from"../lib/stamp";

type Props={role:string;flash?:(m:string)=>void};

const money=(n:number,c:string)=>`${c} ${(n||0).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const day=(v:string)=>v?new Date(v.length===10?`${v}T00:00:00`:v).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—";

export default function DebtCollection({role,flash}:Props){
  const[stage,setStage]=useState("All stages"),[q,setQ]=useState(""),[open,setOpen]=useState<Collection|null>(null),
    [adding,setAdding]=useState(false),[version,setVersion]=useState(0);
  const reload=()=>setVersion(v=>v+1);
  const{data,loading,error}=useAsync(()=>collectionApi.load(),[version]);
  // Taken once when the screen opens; how overdue a case is does not need to tick while it is open.
  const[todayMs]=useState(()=>new Date(new Date().toISOString().slice(0,10)).getTime());
  const late=(due:string)=>Math.max(0,Math.round((todayMs-new Date(due).getTime())/86400000));
  const cases=useMemo(()=>data||[],[data]);
  const counts=useMemo(()=>{const c:Record<string,number>={};cases.forEach(r=>c[r.stage]=(c[r.stage]||0)+1);return c},[cases]);
  const shown=useMemo(()=>cases.filter(r=>(stage==="All stages"||r.stage===stage)&&
    (!q.trim()||[r.ref,r.customer,r.invoiceNo,r.jobRef,r.status].join(" ").toLowerCase().includes(q.trim().toLowerCase()))),[cases,stage,q]);
  /* Per currency: invoices are raised in AED, INR and others, and one total across them
     would add rupees to dirhams. */
  const outstanding=useMemo(()=>{const by:Record<string,number>={};
    cases.filter(r=>!isVerified(r.stage)).forEach(r=>by[r.currency]=(by[r.currency]||0)+r.invoiceAmount-r.amountReceived);
    return Object.entries(by).filter(([,n])=>n>0.005).map(([c,n])=>money(n,c)).join(" · ")},[cases]);
  const accounts=ACCOUNTS_ROLES.includes(role);

  return <div className="recv-module">
    <div className="recv-subhead"><p>Invoices past their due date and not yet collected. Log each call, email and payment
      until the invoice is collected, then send it for audit verification.
      {!!outstanding&&<b className="dc-outstanding"> Outstanding: {outstanding}</b>}</p>
      {accounts&&<button className="primary" onClick={()=>setAdding(true)}><Plus/>Add missed invoice</button>}</div>

    <div className="recv-flow">
      {STAGES.map((s,i)=><button key={s} className={stage===s?"recv-stage on":"recv-stage"}
        onClick={()=>setStage(stage===s?"All stages":s)}>
        <b>{counts[s]||0}</b><span>{STEP_LABEL[s]}</span>
        {i<STAGES.length-1&&<ArrowRight className="recv-arrow"/>}</button>)}
    </div>

    <section className="panel">
      <header className="recv-head">
        <h3>{stage==="All stages"?"All cases":STEP_LABEL[stage as keyof typeof STEP_LABEL]}<i>{shown.length}</i></h3>
        <label className="recv-search"><Search/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Reference, customer, invoice or status"/>
          {q&&<button onClick={()=>setQ("")} aria-label="Clear search"><X/></button>}</label>
        {stage!=="All stages"&&<button className="ghost" onClick={()=>setStage("All stages")}>Show all stages</button>}
      </header>
      {error?<ErrorBlock message={error} retry={reload}/>
      :loading?<Loading label="Loading debt collection"/>
      :!cases.length?<Empty label="No missed invoices. An invoice verified in Completion and Billing appears here once its due date passes unpaid."/>
      :!shown.length?<Empty label="No case matches that."/>
      :<div className="recv-rows">
        <div className="recv-cols" aria-hidden="true"><span>Reference</span><span>Invoice</span>
          <span>Latest</span><span className="num">Received / invoiced</span><span className="num">Stage</span></div>
        {shown.map(r=><button key={r.id} className="recv-row" onClick={()=>setOpen(r)}>
          <div className="recv-ref"><b>{r.ref}</b><small>{r.customer}</small></div>
          <div className="recv-desc">{r.invoiceNo} · due {day(r.dueDate)}
            {!isVerified(r.stage)&&<i className="dc-late">{late(r.dueDate)} days overdue</i>}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}</div>
          <div className="recv-nums"><span>{r.status}{r.status==="Promised to pay"&&r.promisedDate?` · ${day(r.promisedDate)}`:""}</span>
            <span>{r.followUps?`${r.followUps} follow-up${r.followUps===1?"":"s"} · last ${day(r.lastFollowUpAt)}`:"Not followed up yet"}</span></div>
          <div className="recv-amt">{money(r.amountReceived,r.currency)}<small>of {money(r.invoiceAmount,r.currency)}</small></div>
          <div className={`recv-tag d${stageIndex(r.stage)}`}>{isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
        </button>)}</div>}
    </section>

    {open&&<CaseDetail row={open} role={role} late={late} close={()=>setOpen(null)} reload={reload}
      saved={(r,msg)=>{setOpen(r);reload();flash?.(msg)}}/>}
    {adding&&<AddInvoice close={()=>setAdding(false)}
      added={r=>{setAdding(false);reload();setOpen(r);flash?.(`${r.ref} added for invoice ${r.invoiceNo}`)}}/>}
  </div>}

const KINDS=[{id:"Call",icon:Phone},{id:"Email",icon:Mail},{id:"Status",icon:MessageSquareText},{id:"Payment",icon:Wallet}] as const;

/* One case: its facts, what can be logged now, and everything logged so far. */
function CaseDetail({row,role,late,close,saved,reload}:{row:Collection;role:string;late:(d:string)=>number;
  close:()=>void;saved:(r:Collection,msg:string)=>void;reload:()=>void}){
  const[kind,setKind]=useState<typeof KINDS[number]["id"]>("Call");
  const[f,setF]=useState<Record<string,string>>({});
  const[credit,setCredit]=useState(String(row.creditDays));
  const[busy,setBusy]=useState(false),[err,setErr]=useState(""),[remarks,setRemarks]=useState(""),[note,setNote]=useState("");
  const[seen,setSeen]=useState(0);
  const events=useAsync(()=>collectionApi.events(row.id),[row.id,row.updatedAt,seen]);
  const canLog=mayLog(row.stage,[role]),canVerify=mayVerify(row.stage,[role]),done=isVerified(row.stage);
  const collected=isCollected(row.amountReceived,row.invoiceAmount);
  const pct=row.invoiceAmount?Math.min(100,Math.round(row.amountReceived/row.invoiceAmount*100)):0;
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));

  const run=async(fn:()=>Promise<Collection>,msg:string,after?:()=>void)=>{
    setBusy(true);setErr("");
    try{const r=await fn();after?.();setSeen(n=>n+1);saved(r,msg)}
    catch(e){const m=e instanceof Error?e.message:"That did not go through";setErr(m);if(m.includes("Somebody else moved"))reload()}
    finally{setBusy(false)}};

  return <div className="recv-drawer" role="dialog" aria-label={`${row.ref} details`}>
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside>
      <header><div><small>{row.ref} · invoice {row.invoiceNo}</small><h3>{row.customer}</h3></div>
        <button onClick={close} aria-label="Close"><X/></button></header>
      <div className={`recv-tag d${stageIndex(row.stage)} big`}>{done&&<CheckCircle2/>}{row.stage} · {row.status}</div>
      {row.returnNote&&<p className="recv-back-note"><RotateCcw/><span><b>Sent back by audit:</b> {row.returnNote}</span></p>}

      <div className="dc-progress" aria-label={`${pct}% collected`}><i style={{width:`${pct}%`}}/></div>
      <p className="dc-progress-label"><b>{money(row.amountReceived,row.currency)}</b> received of {money(row.invoiceAmount,row.currency)}
        {!collected&&<> · <b>{money(row.invoiceAmount-row.amountReceived,row.currency)}</b> outstanding</>}</p>

      <dl className="recv-facts">
        <div><dt>Invoice</dt><dd>{row.invoiceNo} · {day(row.invoiceDate)}</dd></div>
        <div><dt>Due</dt><dd>{day(row.dueDate)}{!done&&` · ${late(row.dueDate)} days overdue`}</dd></div>
        {!!row.jobRef&&<div><dt>Job</dt><dd>{row.jobRef}{row.pmName?` · PM ${row.pmName}`:""}</dd></div>}
        {row.status==="Promised to pay"&&!!row.promisedDate&&<div><dt>Promised for</dt><dd>{day(row.promisedDate)}</dd></div>}
        {!!row.collectorName&&<div><dt>Followed up by</dt><dd>{row.collectorName}</dd></div>}
        {done&&<div><dt>Verified</dt><dd><ShieldCheck/>{row.verifiedBy} · {day(row.verifiedAt)}{row.remarks?` · ${row.remarks}`:""}</dd></div>}
      </dl>

      {err&&<p className="recv-error">{err}</p>}

      {canLog&&<div className="recv-act">
        <div className="dc-kinds" role="tablist">{KINDS.map(k=><button key={k.id} role="tab" aria-selected={kind===k.id}
          className={kind===k.id?"on":""} onClick={()=>{setKind(k.id);setErr("")}}><k.icon/>{k.id==="Status"?"Status update":k.id==="Call"?"Follow-up call":k.id==="Email"?"Follow-up email":"Payment"}</button>)}</div>
        {(kind==="Call"||kind==="Email")&&<label>{kind==="Call"?"Who did you speak to?":"Who was it sent to?"}
          <input value={f.contact||""} onChange={e=>set("contact",e.target.value)} placeholder={kind==="Call"?"Name and number":"Name and email address"}/></label>}
        {kind==="Status"&&<div className="recv-two">
          <label>Customer&apos;s position<select value={f.status||""} onChange={e=>set("status",e.target.value)}>
            <option value="">Choose…</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
          {f.status==="Promised to pay"&&<label>Promised for<input type="date" value={f.promisedDate||""} onChange={e=>set("promisedDate",e.target.value)}/></label>}</div>}
        {kind==="Payment"&&<label>Amount received ({row.currency})<input type="number" min="0" step="0.01" value={f.amount||""}
          onChange={e=>set("amount",e.target.value)} placeholder={`Up to ${(row.invoiceAmount-row.amountReceived).toFixed(2)}`}/></label>}
        <label>{kind==="Payment"?"Reference":"Notes"}<textarea rows={2} value={f.notes||""} onChange={e=>set("notes",e.target.value)}
          placeholder={kind==="Call"?"What was said, what was agreed":kind==="Email"?"What was sent":kind==="Status"?"What the customer said":"Bank reference, cheque number (optional)"}/></label>
        <button className="primary" disabled={busy} onClick={()=>run(()=>collectionApi.log(row.id,{kind,...f}),
          `${row.ref}: ${kind.toLowerCase()} recorded`,()=>setF({}))}>{busy?"Saving…":`Record ${kind==="Status"?"status":kind.toLowerCase()}`}</button>
        {collected&&<button className="primary dc-submit" disabled={busy}
          onClick={()=>run(()=>collectionApi.move(row.id,"submit"),`${row.ref} sent for audit verification`)}>
          Collected — send for audit verification<ArrowRight/></button>}
        <div className="dc-terms"><label>Credit days<input type="number" min="0" max="365" value={credit} onChange={e=>setCredit(e.target.value)}/></label>
          <button className="ghost" disabled={busy||credit===String(row.creditDays)}
            onClick={()=>run(()=>collectionApi.terms(row.id,Number(credit)),`${row.ref}: due date moved`)}>Update due date</button></div>
      </div>}

      {canVerify&&<div className="recv-act">
        <label>Audit remarks<textarea rows={2} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional"/></label>
        <button className="primary" disabled={busy} onClick={()=>run(()=>collectionApi.move(row.id,"verify",{remarks}),`${row.ref}: collection verified`)}>
          Verify collection<ArrowRight/></button>
        <div className="recv-return"><b><RotateCcw/>Send back to Status Update</b>
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="What needs correcting?"/>
          <button className="ghost danger" disabled={busy||!note.trim()}
            onClick={()=>run(()=>collectionApi.move(row.id,"return",{note}),`${row.ref} sent back`)}>Send back</button></div>
      </div>}
      {!canLog&&!canVerify&&!done&&<p className="recv-empty">This case is with {row.stage==="Audit Verification"?"audit":"accounts"}. Your role cannot act on it now.</p>}
      {done&&<p className="recv-empty">Collected and verified. Nothing further is expected on this case.</p>}

      <section className="dc-log"><h4>History</h4>
        {events.loading?<p className="recv-empty">Loading…</p>
        :!(events.data||[]).length?<p className="recv-empty">Nothing logged yet.</p>
        :<ol>{[...(events.data||[])].reverse().map(e=><li key={e.id} className={`k-${e.kind.toLowerCase()}`}>
          <b>{e.kind==="Status"?`Status: ${e.status}${e.promisedDate?` (promised ${day(e.promisedDate)})`:""}`
            :e.kind==="Payment"?`Payment of ${money(e.amount,row.currency)}`:`Follow-up ${e.kind.toLowerCase()}${e.contact?` · ${e.contact}`:""}`}</b>
          {!!e.notes&&<span>{e.notes}</span>}
          <small>{e.byName} · {stamp(e.at)}</small></li>)}</ol>}
      </section>

      <Attachments entityType="collection" entityId={row.id} flash={()=>{}}/>
    </aside></div>}

/* An invoice missed before the portal existed, or raised outside it. */
function AddInvoice({close,added}:{close:()=>void;added:(r:Collection)=>void}){
  const[f,setF]=useState<Record<string,string>>({currency:"AED",creditDays:"30"});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{added(await collectionApi.add(f))}catch(x){setErr(x instanceof Error?x.message:"Could not add it");setBusy(false)}};
  return <div className="recv-drawer" role="dialog" aria-label="Add missed invoice">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>DEBT COLLECTION</small><h3>Add missed invoice</h3></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act" onSubmit={submit}>
        <label>Customer<input autoFocus required value={f.customer||""} onChange={e=>set("customer",e.target.value)}/></label>
        <div className="recv-two">
          <label>Invoice number<input required value={f.invoiceNo||""} onChange={e=>set("invoiceNo",e.target.value)}/></label>
          <label>Invoice date<input type="date" required value={f.invoiceDate||""} onChange={e=>set("invoiceDate",e.target.value)}/></label></div>
        <div className="recv-two">
          <label>Amount<input type="number" min="0" step="0.01" required value={f.invoiceAmount||""} onChange={e=>set("invoiceAmount",e.target.value)}/></label>
          <label>Currency<input value={f.currency||""} onChange={e=>set("currency",e.target.value)}/></label></div>
        <div className="recv-two">
          <label>Credit days<input type="number" min="0" max="365" value={f.creditDays||""} onChange={e=>set("creditDays",e.target.value)}/></label>
          <label>Job reference<input value={f.jobRef||""} onChange={e=>set("jobRef",e.target.value)} placeholder="Optional"/></label></div>
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?"Adding…":"Add missed invoice"}</button>
      </form></aside></div>}
