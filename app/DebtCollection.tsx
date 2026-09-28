"use client";

/* Accounts Receivable, module 4: Debt Collection.

   The invoices whose due date has passed unpaid, each a case. Accounts log every call,
   email, status and payment against a case until the payments cover the invoice, then
   send it to audit, who verify the collection. The flow lives in
   lib/collection-stages.ts; the server checks every entry again. */

import{useMemo,useState}from"react";
import{ArrowRight,CheckCircle2,Plus,RotateCcw,Search,ShieldCheck,X}from"lucide-react";
import{collectionApi,planningApi}from"./audit-api";
import type{Collection,OpenInvoice}from"./audit-api";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import Attachments from"./Attachments";
import{ACCOUNTS_ROLES,COLLECTION_STATUSES,FOLLOW_UP_METHODS,STAGES,STEP_LABEL,isCollected,isVerified,mayLog,mayVerify,stageIndex}from"../lib/collection-stages";
import{stamp}from"../lib/stamp";

type Props={role:string;userEmail?:string;flash?:(m:string)=>void};

const money=(n:number,c:string)=>`${c} ${(n||0).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const day=(v:string)=>v?new Date(v.length===10?`${v}T00:00:00`:v).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—";

export default function DebtCollection({role,userEmail="",flash}:Props){
  const[stage,setStage]=useState("All stages"),[q,setQ]=useState(""),[open,setOpen]=useState<Collection|null>(null),
    [adding,setAdding]=useState(false),[version,setVersion]=useState(0);
  const reload=()=>setVersion(v=>v+1);
  const{data,loading,error}=useAsync(()=>collectionApi.load(),[version]);
  // Taken once when the screen opens; how overdue a case is does not need to tick while it is open.
  const[todayMs]=useState(()=>new Date(new Date().toISOString().slice(0,10)).getTime());
  const late=(due:string)=>Math.max(0,Math.round((todayMs-new Date(due).getTime())/86400000));
  /* Ageing: days since the invoice date. */
  const ageing=(invoiceDate:string)=>invoiceDate?Math.max(0,Math.round((todayMs-new Date(invoiceDate).getTime())/86400000)):0;
  const todayIso=new Date(todayMs).toISOString().slice(0,10);
  const cases=useMemo(()=>data||[],[data]);
  const counts=useMemo(()=>{const c:Record<string,number>={};cases.forEach(r=>c[r.stage]=(c[r.stage]||0)+1);return c},[cases]);
  const shown=useMemo(()=>cases.filter(r=>(stage==="All stages"||r.stage===stage)&&
    (!q.trim()||[r.ref,r.customer,r.invoiceNo,r.jobRef,r.jobCode,r.projectName,r.status,r.responsibleName].join(" ").toLowerCase().includes(q.trim().toLowerCase()))),[cases,stage,q]);
  /* Per currency: invoices are raised in AED, INR and others, and one total across them
     would add rupees to dirhams. */
  const outstanding=useMemo(()=>{const by:Record<string,number>={};
    cases.filter(r=>!isVerified(r.stage)).forEach(r=>by[r.currency]=(by[r.currency]||0)+r.invoiceAmount-r.amountReceived);
    return Object.entries(by).filter(([,n])=>n>0.005).map(([c,n])=>money(n,c)).join(" · ")},[cases]);
  const accounts=ACCOUNTS_ROLES.includes(role);

  return <div className="recv-module">
    <div className="recv-subhead"><p>Invoices to collect: past their due date, or added from Completion and Billing. Record each
      follow-up and amount collected until the invoice is collected, then send it for audit verification.
      {!!outstanding&&<b className="dc-outstanding"> Outstanding: {outstanding}</b>}</p>
      {accounts&&<button className="primary" onClick={()=>setAdding(true)}><Plus/>Add invoice</button>}</div>

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
          <div className="recv-desc">{r.jobCode?`${r.jobCode} · `:""}{r.invoiceNo} · due {day(r.dueDate)}
            {!isVerified(r.stage)&&<i className={late(r.dueDate)?"dc-late":"dc-next"}>{ageing(r.invoiceDate)} days ageing{late(r.dueDate)?` · ${late(r.dueDate)} overdue`:""}</i>}
            {!isVerified(r.stage)&&!!r.nextFollowUpDate&&<i className={r.nextFollowUpDate<todayIso?"dc-late":"dc-next"}>
              Next follow-up {day(r.nextFollowUpDate)}{r.nextFollowUpDate<todayIso?" (missed)":""}</i>}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}</div>
          <div className="recv-nums"><span>{r.status}{r.status==="Promised to pay"&&r.promisedDate?` · ${day(r.promisedDate)}`:""}</span>
            <span>{r.responsibleName||"No one responsible yet"}{r.followUps?` · ${r.followUps} follow-up${r.followUps===1?"":"s"}`:""}</span></div>
          <div className="recv-amt">{money(r.amountReceived,r.currency)}<small>of {money(r.invoiceAmount,r.currency)}</small></div>
          <div className={`recv-tag d${stageIndex(r.stage)}`}>{isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
        </button>)}</div>}
    </section>

    {open&&<CaseDetail row={open} role={role} userEmail={userEmail} late={late} ageing={ageing} close={()=>setOpen(null)} reload={reload}
      saved={(r,msg)=>{setOpen(r);reload();flash?.(msg)}}/>}
    {adding&&<AddInvoice close={()=>setAdding(false)}
      added={r=>{setAdding(false);reload();setOpen(r);flash?.(`${r.ref} added for invoice ${r.invoiceNo}`)}}/>}
  </div>}

/* One case: its facts, the Debt Collection form, and everything recorded so far. */
function CaseDetail({row,role,userEmail,late,ageing,close,saved,reload}:{row:Collection;role:string;userEmail:string;
  late:(d:string)=>number;ageing:(d:string)=>number;close:()=>void;saved:(r:Collection,msg:string)=>void;reload:()=>void}){
  const[credit,setCredit]=useState(String(row.creditDays));
  const[busy,setBusy]=useState(false),[err,setErr]=useState(""),[remarks,setRemarks]=useState(""),[note,setNote]=useState("");
  const[form,setForm]=useState(false),[seen,setSeen]=useState(0);
  const events=useAsync(()=>collectionApi.events(row.id),[row.id,row.updatedAt,seen]);
  const canLog=mayLog(row.stage,[role]),canVerify=mayVerify(row.stage,[role]),done=isVerified(row.stage);
  const collected=isCollected(row.amountReceived,row.invoiceAmount);
  const pct=row.invoiceAmount?Math.min(100,Math.round(row.amountReceived/row.invoiceAmount*100)):0;

  const run=async(fn:()=>Promise<Collection>,msg:string)=>{
    setBusy(true);setErr("");
    try{const r=await fn();setSeen(n=>n+1);saved(r,msg)}
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
      <p className="dc-progress-label"><b>{money(row.amountReceived,row.currency)}</b> collected of {money(row.invoiceAmount,row.currency)}
        {!collected&&<> · balance <b>{money(row.invoiceAmount-row.amountReceived,row.currency)}</b></>}</p>

      <dl className="recv-facts">
        {!!row.jobCode&&<div><dt>Job code</dt><dd>{row.jobCode}</dd></div>}
        {!!row.projectName&&<div><dt>Project</dt><dd>{row.projectName}</dd></div>}
        <div><dt>Invoice</dt><dd>{row.invoiceNo} · {day(row.invoiceDate)} · {money(row.invoiceAmount,row.currency)}</dd></div>
        <div><dt>Due</dt><dd>{day(row.dueDate)}{!done&&late(row.dueDate)?` · ${late(row.dueDate)} days overdue`:""}</dd></div>
        {!!row.paymentTerms&&<div><dt>Payment terms</dt><dd>{row.paymentTerms}</dd></div>}
        {!done&&<div><dt>Ageing</dt><dd>{ageing(row.invoiceDate)} days</dd></div>}
        {!!row.responsibleName&&<div><dt>Responsible</dt><dd>{row.responsibleName}</dd></div>}
        {!!row.lastFollowUpDate&&<div><dt>Last follow-up</dt><dd>{day(row.lastFollowUpDate)}{row.followUpMethod?` · ${row.followUpMethod}`:""}</dd></div>}
        {!!row.nextFollowUpDate&&!done&&<div><dt>Next follow-up</dt><dd>{day(row.nextFollowUpDate)}</dd></div>}
        {!!row.promisedDate&&!done&&<div><dt>Expected collection</dt><dd>{day(row.promisedDate)}</dd></div>}
        {!!row.customerResponse&&<div><dt>Customer response</dt><dd>{row.customerResponse}</dd></div>}
        {!!row.collectionRemarks&&<div><dt>Remarks</dt><dd>{row.collectionRemarks}</dd></div>}
        {done&&<div><dt>Verified</dt><dd><ShieldCheck/>{row.verifiedBy} · {day(row.verifiedAt)}{row.remarks?` · ${row.remarks}`:""}</dd></div>}
      </dl>

      {err&&<p className="recv-error">{err}</p>}

      {canLog&&<div className="recv-act">
        <button className="primary" disabled={busy} onClick={()=>setForm(true)}>Open debt collection form<ArrowRight/></button>
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
        :!(events.data||[]).length?<p className="recv-empty">Nothing recorded yet.</p>
        :<ol>{[...(events.data||[])].reverse().map(e=><li key={e.id} className={`k-${e.kind.toLowerCase()}`}>
          <b>{e.kind==="Update"?[e.method?`${e.method} follow-up${e.followUpDate?` on ${day(e.followUpDate)}`:""}`:"Update",e.status,
              e.amount?`${money(e.amount,row.currency)} collected`:""].filter(Boolean).join(" · ")
            :e.kind==="Status"?`Status: ${e.status}${e.promisedDate?` (promised ${day(e.promisedDate)})`:""}`
            :e.kind==="Payment"?`Payment of ${money(e.amount,row.currency)}`:`Follow-up ${e.kind.toLowerCase()}${e.contact?` · ${e.contact}`:""}`}</b>
          {!!e.notes&&<span>{e.notes}</span>}
          {e.kind==="Update"&&!!e.promisedDate&&<span>Expected collection {day(e.promisedDate)}</span>}
          {!!e.nextFollowUpDate&&<span>Next follow-up {day(e.nextFollowUpDate)}</span>}
          {!!e.remarks&&<span>Remarks: {e.remarks}</span>}
          <small>{e.byName} · {stamp(e.at)}</small></li>)}</ol>}
      </section>

      <Attachments entityType="collection" entityId={row.id} flash={()=>{}}/>
    </aside>
    {form&&<CollectionForm row={row} userEmail={userEmail} ageing={ageing(row.invoiceDate)} close={()=>setForm(false)}
      saved={r=>{setForm(false);setSeen(n=>n+1);saved(r,`${r.ref}: collection update recorded`)}}/>}</div>}

const lbl=(text:string,required=false)=><span className="recv-lbl">{text}{required&&<i className="recv-req" aria-hidden="true">*</i>}</span>;

/* Debt Collection, in the order of its field specification. The invoice's details come
   from Completion and Billing; balance and ageing are worked out; each submission is one
   update in the case's history. */
function CollectionForm({row,userEmail,ageing,close,saved}:{row:Collection;userEmail:string;ageing:number;
  close:()=>void;saved:(r:Collection)=>void}){
  const today=new Date().toISOString().slice(0,10);
  const[f,setF]=useState<Record<string,string>>({amount:"",lastFollowUpDate:today,followUpMethod:"",
    nextFollowUpDate:"",responsibleEmail:row.responsibleEmail||userEmail,customerResponse:"",
    expectedCollectionDate:row.promisedDate||"",status:(COLLECTION_STATUSES as readonly string[]).includes(row.status)?row.status:"Contacted",remarks:""});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const people=useAsync(()=>planningApi.people(),[]);
  const balance=Math.max(0,Math.round((row.invoiceAmount-row.amountReceived-(Number(f.amount)||0))*100)/100);
  const auto=(label:string,value:string,required=true)=><label>{lbl(label,required)}<input readOnly className="recv-auto" value={value||"—"}/></label>;
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{saved(await collectionApi.update(row.id,f))}
    catch(x){setErr(x instanceof Error?x.message:"Could not record the update");setBusy(false)}};

  return <div className="recv-drawer wide recv-over" role="dialog" aria-label="Debt collection">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>DEBT COLLECTION · {row.ref}</small><h3>{row.invoiceNo} · {row.customer}</h3>
        <p className="recv-form-sub">The invoice&apos;s details come from Completion and Billing. Record this follow-up and submit.</p></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        <div className="recv-two">{auto("Job code",row.jobCode||row.jobRef)}{auto("Client",row.customer)}</div>
        <div className="recv-two">{auto("Project",row.projectName)}{auto("Invoice number",row.invoiceNo)}</div>
        <div className="recv-two">{auto("Invoice date",day(row.invoiceDate))}{auto("Invoice amount",money(row.invoiceAmount,row.currency))}</div>
        <div className="recv-two">{auto("Due date",day(row.dueDate))}{auto("Payment terms",row.paymentTerms||`${row.creditDays} days credit`,false)}</div>
        <div className="recv-two">
          <label>{lbl("Amount collected")}<input type="number" min="0" step="0.01" value={f.amount} onChange={e=>set("amount",e.target.value)}
            placeholder={`Received now · ${money(row.amountReceived,row.currency)} so far`}/></label>
          <label>{lbl("Balance",true)}<input readOnly className="recv-auto" value={money(balance,row.currency)}
            title="Invoice amount − everything collected"/></label></div>
        <div className="recv-two">
          <label>{lbl("Ageing days",true)}<input readOnly className="recv-auto" value={`${ageing} days since the invoice date`}/></label>
          <label>{lbl("Last follow-up date")}<input type="date" max={today} value={f.lastFollowUpDate} onChange={e=>set("lastFollowUpDate",e.target.value)}/></label></div>
        <div className="recv-two">
          <label>{lbl("Follow-up method")}<select value={f.followUpMethod} onChange={e=>set("followUpMethod",e.target.value)}>
            <option value="">No follow-up this time</option>{FOLLOW_UP_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
          <label>{lbl("Next follow-up date")}<input type="date" min={f.lastFollowUpDate||undefined} value={f.nextFollowUpDate}
            onChange={e=>set("nextFollowUpDate",e.target.value)}/></label></div>
        <div className="recv-two">
          <label>{lbl("Responsible person",true)}<select required value={f.responsibleEmail} onChange={e=>set("responsibleEmail",e.target.value)}>
            <option value="">{people.loading?"Loading people…":"Select a person"}</option>
            {(people.data||[]).map(p=><option key={p.email} value={p.email}>{p.name?`${p.name} · ${p.email}`:p.email}</option>)}</select></label>
          <label>{lbl("Expected collection date",f.status==="Promised to pay")}<input type="date" required={f.status==="Promised to pay"}
            value={f.expectedCollectionDate} onChange={e=>set("expectedCollectionDate",e.target.value)}/></label></div>
        <label>{lbl("Customer response")}<textarea rows={3} value={f.customerResponse} onChange={e=>set("customerResponse",e.target.value)}
          placeholder="What the customer said"/></label>
        <label>{lbl("Collection status",true)}<select required value={f.status} onChange={e=>set("status",e.target.value)}
          title="For monitoring progress and ageing">{COLLECTION_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
        {balance<=0.01&&<p className="recv-hint">This collects the invoice in full; the status becomes Paid in full.</p>}
        <label>{lbl("Remarks")}<textarea rows={2} value={f.remarks} onChange={e=>set("remarks",e.target.value)}/></label>
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?"Saving…":"Record update"}<ArrowRight/></button>
      </form>
    </aside></div>}

/* An invoice to collect: one raised in Completion and Billing, chosen from the list, or
   one raised before the portal or outside it, entered by hand. */
function AddInvoice({close,added}:{close:()=>void;added:(r:Collection)=>void}){
  const invoices=useAsync(()=>collectionApi.invoices(),[]);
  const[pick,setPick]=useState(""),[f,setF]=useState<Record<string,string>>({currency:"AED",creditDays:"30"});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const inv:OpenInvoice|undefined=(invoices.data||[]).find(i=>i.id===pick);
  const manual=pick==="manual";
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{added(await collectionApi.add(manual?f:{completionId:pick}))}catch(x){setErr(x instanceof Error?x.message:"Could not add it");setBusy(false)}};
  const auto=(label:string,value:string)=><label>{lbl(label,true)}<input readOnly className="recv-auto" value={value||"—"}/></label>;
  return <div className="recv-drawer" role="dialog" aria-label="Add invoice">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>DEBT COLLECTION</small><h3>Add invoice</h3></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        <label>{lbl("Invoice number",true)}<select autoFocus required value={pick} onChange={e=>setPick(e.target.value)}>
          <option value="">{invoices.loading?"Loading invoices…":"Select an invoice"}</option>
          {(invoices.data||[]).map(i=><option key={i.id} value={i.id}>{i.invoiceNo} · {i.jobCode||i.jobRef} · {i.customer}</option>)}
          <option value="manual">Another invoice (raised outside the portal)…</option></select></label>
        {inv&&<>
          <div className="recv-two">{auto("Job code",inv.jobCode||inv.jobRef)}{auto("Client",inv.customer)}</div>
          <div className="recv-two">{auto("Project",inv.projectName)}{auto("Invoice date",day(inv.invoiceDate))}</div>
          <div className="recv-two">{auto("Invoice amount",money(inv.invoiceAmount,inv.currency))}{auto("Due date",day(inv.dueDate))}</div>
          {!!inv.paymentTerms&&<p className="recv-hint">Payment terms: {inv.paymentTerms}</p>}</>}
        {manual&&<>
          <label>{lbl("Customer",true)}<input required value={f.customer||""} onChange={e=>set("customer",e.target.value)}/></label>
          <div className="recv-two">
            <label>{lbl("Invoice number",true)}<input required value={f.invoiceNo||""} onChange={e=>set("invoiceNo",e.target.value)}/></label>
            <label>{lbl("Invoice date",true)}<input type="date" required value={f.invoiceDate||""} onChange={e=>set("invoiceDate",e.target.value)}/></label></div>
          <div className="recv-two">
            <label>{lbl("Amount",true)}<input type="number" min="0" step="0.01" required value={f.invoiceAmount||""} onChange={e=>set("invoiceAmount",e.target.value)}/></label>
            <label>{lbl("Currency",true)}<input required value={f.currency||""} onChange={e=>set("currency",e.target.value)}/></label></div>
          <div className="recv-two">
            <label>{lbl("Credit days")}<input type="number" min="0" max="365" value={f.creditDays||""} onChange={e=>set("creditDays",e.target.value)}/></label>
            <label>{lbl("Job reference")}<input value={f.jobRef||""} onChange={e=>set("jobRef",e.target.value)} placeholder="Optional"/></label></div></>}
        {!invoices.loading&&!(invoices.data||[]).length&&<p className="recv-hint">No invoice from Completion and Billing is waiting. An invoice
          appears here once management approves it; overdue ones are added automatically.</p>}
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy||!pick}>{busy?"Adding…":"Add invoice"}</button>
      </form></aside></div>}
