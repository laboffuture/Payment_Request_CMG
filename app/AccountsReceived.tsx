"use client";

/* Accounts Receivable.

   Named "Accounts received" when it was first stood up, which described the opposite
   movement of money - a receipt already collected, rather than an amount still owed to
   the company. The label is the accounting term now; the file and module key keep the
   original spelling because renaming them buys nothing a reader can see.

   Four modules, one tab each: Job Notification, Planning & Procurement, Completion and
   Billing, Debt Collection. Job Notification's flow is: a job is notified, it is created
   in CRM, a sales order is cut against it, and audit verifies the three agree. lib/receivable-stages.ts holds the stages and
   who may act at each; this screen only shows what that model already decided, so a
   button never appears for a role the server would refuse. */

import{useMemo,useState}from"react";
import{ArrowLeft,ArrowRight,Building2,CheckCircle2,ClipboardList,FileCheck2,HandCoins,Megaphone,Plus,RotateCcw,Search,ShieldCheck,X}from"lucide-react";
import{receivablesApi}from"./audit-api";
import type{Receivable}from"./audit-api";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import{ACTION_LABEL,RETURNABLE_TO,STAGES,isVerified,mayAct,stageIndex}from"../lib/receivable-stages";
import type{Stage}from"../lib/receivable-stages";

type Props={role:string;companies?:{id:string;name:string}[];flash?:(m:string)=>void};

const money=(n:number,c:string)=>n?`${c} ${n.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—";
const when=(iso:string)=>iso?new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—";

/* The four modules of Accounts Receivable, in the order a job moves through them. Each
   has a flow of its own. Job Notification carries the register that existed before the
   split; the other three are placeholders until their flows are defined. */
const MODULES=[
  {id:"job",label:"Job Notification",icon:Megaphone,
    blurb:"A job is notified, created in CRM, a sales order is cut against it, and audit verifies the three agree."},
  {id:"planning",label:"Planning & Procurement",icon:ClipboardList,
    blurb:"Planning the job and procuring what it needs."},
  {id:"billing",label:"Completion and Billing",icon:FileCheck2,
    blurb:"Confirming the work is complete and billing the customer for it."},
  {id:"collection",label:"Debt Collection",icon:HandCoins,
    blurb:"Following up and collecting what the customer owes."}] as const;
type ModuleId=typeof MODULES[number]["id"];
const MODULE_KEY="ar-module";

export default function AccountsReceived(props:Props){
  /* The module last opened is remembered on this device only - a convenience, so it is
     read and written defensively and the screen works without it. */
  const[mod,setMod]=useState<ModuleId>(()=>{
    try{const v=localStorage.getItem(MODULE_KEY);return MODULES.some(m=>m.id===v)?v as ModuleId:"job"}
    catch{return"job"}});
  const pick=(id:ModuleId)=>{setMod(id);try{localStorage.setItem(MODULE_KEY,id)}catch{}};
  const current=MODULES.find(m=>m.id===mod)||MODULES[0];
  return <div className="page recv">
    <div className="intro"><div><small>ACCOUNTS</small><h2>Accounts Receivable</h2>
      <p>From the job notification through to collecting what is owed, in four modules.</p></div></div>
    <nav className="recv-modules" aria-label="Accounts Receivable modules">
      {MODULES.map((m,i)=><button key={m.id} className={m.id===mod?"on":""} aria-current={m.id===mod?"page":undefined}
        onClick={e=>{pick(m.id);e.currentTarget.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"})}}><m.icon/><span><i>{i+1}</i>{m.label}</span></button>)}
    </nav>
    {mod==="job"?<JobNotification {...props}/>:<ComingModule label={current.label} blurb={current.blurb} Icon={current.icon}/>}
  </div>}

/* A module whose flow has not been defined yet. Says so plainly rather than showing an
   empty register that looks broken. */
function ComingModule({label,blurb,Icon}:{label:string;blurb:string;Icon:typeof Megaphone}){
  return <section className="panel recv-coming"><Icon/><h3>{label}</h3><p>{blurb}</p>
    <span>The flow for this module is being set up and will appear here.</span></section>}

function JobNotification({role,companies=[],flash}:Props){
  const[stage,setStage]=useState<string>("All stages"),[q,setQ]=useState(""),
    [open,setOpen]=useState<Receivable|null>(null),[form,setForm]=useState(false),
    /* Bumped after every write. The register is the server's copy, so a move is
       followed by a re-read rather than by patching the row in two places. */
    [version,setVersion]=useState(0);
  const reload=()=>setVersion(v=>v+1);
  const{data,loading,error}=useAsync(()=>receivablesApi.load({limit:200}),[version]);
  const rows=useMemo(()=>data?.receivables||[],[data]);

  /* Filtering here rather than on the server: the register is small, and a stage
     click that does not go to the network keeps the counts and the list in step. */
  const shown=useMemo(()=>rows.filter(r=>
    (stage==="All stages"||r.stage===stage)&&
    (!q.trim()||[r.ref,r.customer,r.crmJobNo,r.soNo,r.description]
      .join(" ").toLowerCase().includes(q.trim().toLowerCase()))),[rows,stage,q]);
  const counts=useMemo(()=>{
    const c:Record<string,number>={};
    STAGES.forEach(s=>c[s]=0);
    rows.forEach(r=>c[r.stage]=(c[r.stage]||0)+1);
    return c},[rows]);

  const canRaise=mayAct("Job Notification",[role]);
  const save=(r:Receivable)=>{setOpen(r);reload()};

  return <div className="recv-module">
    <div className="recv-subhead"><p>{MODULES[0].blurb}</p>
      {canRaise&&<button className="primary" onClick={()=>setForm(true)}><Plus/>New job notification</button>}</div>

    {/* The flow itself, as a row of stages. Clicking one filters the list, so the
        pipeline doubles as the navigation rather than being a picture beside it. */}
    <div className="recv-flow">
      {STAGES.map((s,i)=><button key={s} className={stage===s?"recv-stage on":"recv-stage"}
        onClick={()=>setStage(stage===s?"All stages":s)}>
        <b>{counts[s]||0}</b><span>{s}</span>
        {i<STAGES.length-1&&<ArrowRight className="recv-arrow"/>}</button>)}
    </div>

    <section className="panel">
      <header className="recv-head">
        <h3>{stage==="All stages"?"All entries":stage}<i>{shown.length}</i></h3>
        <label className="recv-search"><Search/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Reference, customer, CRM job or SO number"/>
          {q&&<button onClick={()=>setQ("")} aria-label="Clear search"><X/></button>}</label>
        {stage!=="All stages"&&<button className="ghost" onClick={()=>setStage("All stages")}>Show all stages</button>}
      </header>

      {error?<ErrorBlock message={error} retry={reload}/>
      :loading?<Loading label="Loading the register"/>
      :!rows.length?<Empty label={canRaise
        ?"Nothing raised yet. Raise the first job notification when a job comes in."
        :"Nothing raised yet. Accounts raise a job notification when a job comes in."}/>
      :!shown.length?<Empty label="No entry matches that."/>
      :<div className="recv-rows">
        {/* Column names, on the same grid as the rows beneath, so each figure is read
            against a heading rather than guessed at. */}
        <div className="recv-cols" aria-hidden="true"><span>Reference</span><span>Description</span>
          <span>CRM job / SO</span><span className="num">Amount</span><span className="num">Status</span></div>
        {shown.map(r=>
        <button key={r.id} className="recv-row" onClick={()=>setOpen(r)}>
          <div className="recv-ref"><b>{r.ref}</b><small>{r.customer}</small></div>
          <div className="recv-desc">{r.description||"—"}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}</div>
          <div className="recv-nums"><span><i>CRM</i>{r.crmJobNo||"Pending"}</span>
            <span><i>SO</i>{r.soNo||"Pending"}</span></div>
          <div className="recv-amt">{money(r.amount,r.currency)}</div>
          <div className={`recv-tag s${stageIndex(r.stage)}`}>
            {isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
        </button>)}</div>}
    </section>

    {open&&<Detail row={open} role={role} companies={companies} close={()=>setOpen(null)}
      saved={(r,msg)=>{save(r);flash?.(msg)}} reload={reload}/>}
    {form&&<NewEntry companies={companies} close={()=>setForm(false)}
      added={r=>{setForm(false);reload();flash?.(`${r.ref} raised`)}}/>}
  </div>}

/* One entry, and the single action its stage allows. The form the action needs is
   part of the same panel: recording the CRM job and moving to the sales order stage
   are one step for the person doing it, so they are one step here too. */
function Detail({row,role,companies,close,saved,reload}:{row:Receivable;role:string;
  companies:{id:string;name:string}[];close:()=>void;saved:(r:Receivable,msg:string)=>void;reload:()=>void}){
  const[fields,setFields]=useState<Partial<Receivable>>({});
  const[note,setNote]=useState(""),[back,setBack]=useState<string>("");
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const at=row.stage as Stage,mine=mayAct(at,[role]),done=isVerified(at);
  const set=(k:keyof Receivable,v:string|number)=>setFields(f=>({...f,[k]:v}));
  const company=companies.find(c=>c.id===row.companyId)?.name||row.companyId||"—";

  const run=async(fn:()=>Promise<Receivable>,msg:string)=>{
    setBusy(true);setErr("");
    try{saved(await fn(),msg)}
    catch(e){const m=e instanceof Error?e.message:"That did not go through";setErr(m);
      /* A stale row is the one failure the screen can fix by itself: reload so the
         person sees where the entry actually is instead of pressing again. */
      if(m.includes("Somebody else moved"))reload()}
    finally{setBusy(false)}};

  return <div className="recv-drawer" role="dialog" aria-label={`${row.ref} details`}>
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside>
      <header><div><small>{row.ref}</small><h3>{row.customer}</h3></div>
        <button onClick={close} aria-label="Close"><X/></button></header>

      <div className={`recv-tag s${stageIndex(row.stage)} big`}>
        {done&&<CheckCircle2/>}{row.stage}</div>
      {row.returnNote&&<p className="recv-back-note"><RotateCcw/><span>
        <b>Sent back by audit:</b> {row.returnNote}</span></p>}

      <dl className="recv-facts">
        <div><dt>Company</dt><dd><Building2/>{company}</dd></div>
        <div><dt>Department</dt><dd>{row.department||"—"}</dd></div>
        <div><dt>Notified on</dt><dd>{when(row.notifiedOn)}</dd></div>
        <div><dt>Job</dt><dd>{row.description||"—"}</dd></div>
        <div><dt>CRM job</dt><dd>{row.crmJobNo||"Not created yet"}{row.crmOwner&&` · ${row.crmOwner}`}</dd></div>
        <div><dt>Sales order</dt><dd>{row.soNo||"Not raised yet"}</dd></div>
        <div><dt>Amount</dt><dd>{money(row.amount,row.currency)}</dd></div>
        {!!row.submittedAt&&<div><dt>Sent for audit</dt><dd>{when(row.submittedAt)}</dd></div>}
        {done&&<div><dt>Verified</dt><dd><ShieldCheck/>{row.verifiedBy} · {when(row.verifiedAt)}</dd></div>}
        {done&&!!row.remarks&&<div><dt>Audit remarks</dt><dd>{row.remarks}</dd></div>}
      </dl>

      {err&&<p className="recv-error">{err}</p>}

      {done?<p className="recv-empty">Verified. Nothing further is expected on this entry.</p>
      :!mine?<p className="recv-empty">This entry is with {at==="Audit Verification"?"audit":"accounts"}.
        Your role cannot act on it at this stage.</p>
      :<div className="recv-act">
        {at==="Job Notification"&&<>
          <label>CRM job number<input autoFocus value={String(fields.crmJobNo??"")}
            onChange={e=>set("crmJobNo",e.target.value)} placeholder="e.g. CRM-2026-0481"/></label>
          <label>CRM job owner<input value={String(fields.crmOwner??"")}
            onChange={e=>set("crmOwner",e.target.value)} placeholder="Defaults to you"/></label></>}
        {at==="CRM JOB Creation"&&<>
          <label>Sales order number<input autoFocus value={String(fields.soNo??"")}
            onChange={e=>set("soNo",e.target.value)} placeholder="e.g. SO-2026-1187"/></label>
          <div className="recv-two">
            <label>Amount<input type="number" min="0" step="0.01" value={String(fields.amount??"")}
              onChange={e=>set("amount",e.target.value)}/></label>
            <label>Currency<input value={String(fields.currency??row.currency)}
              onChange={e=>set("currency",e.target.value)}/></label></div></>}
        {at==="Sales Order"&&<p className="recv-hint">The job, the CRM entry and the sales
          order go to audit together. Audit can send it back to any of the three stages.</p>}
        {at==="Audit Verification"&&<label>Audit remarks<textarea rows={2} value={String(fields.remarks??"")}
          onChange={e=>set("remarks",e.target.value)} placeholder="Optional"/></label>}

        <button className="primary" disabled={busy}
          onClick={()=>run(()=>receivablesApi.advance(row.id,fields),
            `${row.ref}: ${ACTION_LABEL[at].toLowerCase()} done`)}>
          {busy?"Saving…":ACTION_LABEL[at]}<ArrowRight/></button>

        {at==="Audit Verification"&&<div className="recv-return">
          <b><ArrowLeft/>Send back for correction</b>
          <select value={back} onChange={e=>setBack(e.target.value)}>
            <option value="">Choose the stage to send it back to…</option>
            {RETURNABLE_TO.map(s=><option key={s} value={s}>{s}</option>)}</select>
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}
            placeholder="What needs correcting? Accounts see this on the entry."/>
          <button className="ghost danger" disabled={busy||!back||!note.trim()}
            onClick={()=>run(()=>receivablesApi.sendBack(row.id,back,note.trim()),
              `${row.ref} sent back to ${back}`)}>Send back</button></div>}
      </div>}
    </aside></div>}

/* The job notification. Only the things known when a job is first heard about:
   everything else is recorded by the stage that owns it. */
function NewEntry({companies,close,added}:{companies:{id:string;name:string}[];
  close:()=>void;added:(r:Receivable)=>void}){
  const[customer,setCustomer]=useState(""),[companyId,setCompanyId]=useState(companies[0]?.id||"");
  const[department,setDepartment]=useState(""),[description,setDescription]=useState("");
  const[notifiedOn,setNotifiedOn]=useState(new Date().toISOString().slice(0,10));
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{added(await receivablesApi.create({customer:customer.trim(),companyId,department:department.trim(),
      description:description.trim(),notifiedOn}))}
    catch(x){setErr(x instanceof Error?x.message:"Could not raise it");setBusy(false)}};

  return <div className="recv-drawer" role="dialog" aria-label="New job notification">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>ACCOUNTS RECEIVABLE</small><h3>New job notification</h3></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act" onSubmit={submit}>
        <label>Customer<input autoFocus required value={customer} onChange={e=>setCustomer(e.target.value)}/></label>
        <div className="recv-two">
          <label>Company<select value={companyId} onChange={e=>setCompanyId(e.target.value)}>
            <option value="">—</option>
            {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Department<input value={department} onChange={e=>setDepartment(e.target.value)}/></label></div>
        <label>Notified on<input type="date" value={notifiedOn} onChange={e=>setNotifiedOn(e.target.value)}/></label>
        <label>Job description<textarea rows={3} required value={description}
          onChange={e=>setDescription(e.target.value)} placeholder="What the job is, as notified"/></label>
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?"Raising…":"Raise job notification"}</button>
      </form></aside></div>}
