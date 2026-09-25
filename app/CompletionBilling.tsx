"use client";

/* Accounts Receivable, module 3: Completion and Billing.

   Two views. The jobs register lists every job whose plan is verified, active or not;
   accounts decide which are active and how often each is asked for its completion. The
   cycles are those requests and what follows each: the project manager's update, cost
   control's certification, management's approval, the invoice and audit. The flow and
   who may act live in lib/completion-stages.ts; the server checks every move again. */

import{useMemo,useState}from"react";
import{ArrowLeft,ArrowRight,CheckCircle2,RotateCcw,Search,Send,ShieldCheck,UserRound,X}from"lucide-react";
import{completionApi}from"./audit-api";
import type{BillingJob,Cycle}from"./audit-api";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import Attachments from"./Attachments";
import{ACCOUNTS_ROLES,ACTION_LABEL,BILLING_ROLES,FLOW,RETURNABLE_FROM,isVerified,mayAct,stageIndex}
  from"../lib/completion-stages";
import type{Stage}from"../lib/completion-stages";
import{stamp}from"../lib/stamp";

type Props={role:string;userEmail?:string;flash?:(m:string)=>void};
type Totals=Record<string,{invoiced:number;certified:number}>;

const money=(n:number,c:string)=>`${c} ${(n||0).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const day=(v:string)=>v?new Date(v).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—";
const same=(a?:string,b?:string)=>!!a&&!!b&&a.trim().toLowerCase()===b.trim().toLowerCase();
const EVERY=[1,3,7,14,30];

export default function CompletionBilling({role,userEmail="",flash}:Props){
  const[view,setView]=useState<"cycles"|"jobs">("cycles");
  const[stage,setStage]=useState("All stages"),[q,setQ]=useState(""),[open,setOpen]=useState<Cycle|null>(null);
  const[version,setVersion]=useState(0);
  const reload=()=>setVersion(v=>v+1);
  const{data,loading,error}=useAsync(()=>completionApi.load(),[version]);
  const jobs=useMemo(()=>data?.jobs||[],[data]);
  const cycles=useMemo(()=>data?.cycles||[],[data]);
  const totals:Totals=data?.totals||{};
  const managerOnly=!BILLING_ROLES.includes(role);
  const accounts=ACCOUNTS_ROLES.includes(role);

  // Taken once when the screen opens; "the last 7 days" does not need to move while it is open.
  const[weekAgo]=useState(()=>Date.now()-7*86400000);
  const counts=useMemo(()=>{const c:Record<string,number>={};
    cycles.forEach(r=>c[r.stage]=(c[r.stage]||0)+1);
    c["List of Jobs"]=jobs.filter(j=>j.active).length;
    c["Request for Project Completion"]=cycles.filter(r=>new Date(r.requestedAt).getTime()>=weekAgo).length;
    return c},[cycles,jobs,weekAgo]);
  const shown=useMemo(()=>cycles.filter(r=>(stage==="All stages"||r.stage===stage)&&
    (!q.trim()||[r.ref,r.jobRef,r.customer,r.pmName,r.invoiceNo].join(" ").toLowerCase().includes(q.trim().toLowerCase()))),
    [cycles,stage,q]);

  return <div className="recv-module">
    <div className="recv-subhead"><p>{managerOnly
      ?"Completion requests for the jobs you manage. Update how far each has been completed when asked."
      :"Each active job is asked for its completion on a schedule, weekly unless changed. The update is certified by cost control, approved by management, invoiced, and verified by audit."}</p>
      <div className="cb-views" role="tablist">
        <button role="tab" aria-selected={view==="cycles"} className={view==="cycles"?"on":""} onClick={()=>setView("cycles")}>Completion cycles</button>
        <button role="tab" aria-selected={view==="jobs"} className={view==="jobs"?"on":""} onClick={()=>setView("jobs")}>List of Jobs</button></div></div>

    <div className="recv-flow cb-flow">
      {FLOW.map((s,i)=><button key={s} className={(view==="jobs"&&s==="List of Jobs")||(view==="cycles"&&stage===s)?"recv-stage on":"recv-stage"}
        title={s==="List of Jobs"?"Active jobs":s==="Request for Project Completion"?"Requests issued in the last 7 days":undefined}
        onClick={()=>{if(s==="List of Jobs")setView("jobs");
          else if(s==="Request for Project Completion"){setView("cycles");setStage("All stages")}
          else{setView("cycles");setStage(stage===s?"All stages":s)}}}>
        <b>{counts[s]||0}</b><span>{s}</span>
        {i<FLOW.length-1&&<ArrowRight className="recv-arrow"/>}</button>)}
    </div>

    {error?<section className="panel"><ErrorBlock message={error} retry={reload}/></section>
    :loading?<section className="panel"><Loading label="Loading completion and billing"/></section>
    :view==="jobs"?<JobsRegister jobs={jobs} totals={totals} accounts={accounts} reload={reload} flash={flash}/>
    :<section className="panel">
      <header className="recv-head">
        <h3>{stage==="All stages"?"All completion cycles":stage}<i>{shown.length}</i></h3>
        <label className="recv-search"><Search/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Reference, job, customer, manager or invoice"/>
          {q&&<button onClick={()=>setQ("")} aria-label="Clear search"><X/></button>}</label>
        {stage!=="All stages"&&<button className="ghost" onClick={()=>setStage("All stages")}>Show all stages</button>}
      </header>
      {!cycles.length?<Empty label={jobs.some(j=>j.active)
        ?"No completion requests yet. Each active job is asked on its schedule, or use Request now on the List of Jobs."
        :managerOnly?"No completion request for your jobs yet.":"No jobs yet. A job appears on the List of Jobs once its plan is verified in Planning & Procurement."}/>
      :!shown.length?<Empty label="No cycle matches that."/>
      :<div className="recv-rows">
        <div className="recv-cols" aria-hidden="true"><span>Reference</span><span>Job</span>
          <span>Completion</span><span className="num">Invoice</span><span className="num">Status</span></div>
        {shown.map(r=><button key={r.id} className="recv-row" onClick={()=>setOpen(r)}>
          <div className="recv-ref"><b>{r.ref}</b><small>{r.customer}</small></div>
          <div className="recv-desc">{r.jobRef} · requested {day(r.requestedAt)}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}</div>
          <div className="recv-nums"><span><i>PM</i>{r.pmUpdatedAt?`${r.percentComplete}%`:"Awaited"}</span>
            <span><i>CERT</i>{r.certifiedAt?`${r.certifiedPercent}%`:"—"}</span></div>
          <div className="recv-amt">{r.invoiceNo?money(r.invoiceAmount,r.currency):"—"}</div>
          <div className={`recv-tag c${stageIndex(r.stage)}`}>{isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
        </button>)}</div>}
    </section>}

    {open&&<CycleDetail row={open} role={role} userEmail={userEmail} totals={totals} close={()=>setOpen(null)} reload={reload}
      saved={(r,msg)=>{setOpen(r);reload();flash?.(msg)}}/>}
  </div>}

/* The jobs register: every job with a verified plan. Accounts switch jobs on and off,
   choose how often each is asked, and can ask one now. */
function JobsRegister({jobs,totals,accounts,reload,flash}:{jobs:BillingJob[];totals:Totals;accounts:boolean;
  reload:()=>void;flash?:(m:string)=>void}){
  const[show,setShow]=useState<"Active"|"Inactive"|"All">("Active"),[busy,setBusy]=useState(""),[err,setErr]=useState("");
  const list=jobs.filter(j=>show==="All"||(show==="Active")===!!j.active);
  const act=async(id:string,fn:()=>Promise<unknown>,msg:string)=>{
    setBusy(id);setErr("");
    try{await fn();flash?.(msg);reload()}
    catch(e){setErr(e instanceof Error?e.message:"That did not go through")}
    finally{setBusy("")}};
  return <section className="panel">
    <header className="recv-head">
      <h3>List of Jobs<i>{list.length}</i></h3>
      <div className="cb-views small">{(["Active","Inactive","All"] as const).map(s=>
        <button key={s} className={show===s?"on":""} onClick={()=>setShow(s)}>
          {s} <b>{s==="All"?jobs.length:jobs.filter(j=>(s==="Active")===!!j.active).length}</b></button>)}</div>
    </header>
    {err&&<p className="recv-error">{err}</p>}
    {!list.length?<Empty label={jobs.length?`No ${show.toLowerCase()} jobs.`
      :"No jobs yet. A job appears here once its plan is verified in Planning & Procurement."}/>
    :<div className="recv-rows">
      <div className="recv-cols cb-job-cols" aria-hidden="true"><span>Job</span><span>Project manager</span>
        <span className="num">Contract / invoiced</span><span>Completion requests</span><span className="num">Status</span></div>
      {list.map(j=><div key={j.id} className="recv-row cb-job-row">
        <div className="recv-ref"><b>{j.jobRef}</b><small>{j.customer}</small></div>
        <div className="recv-nums"><span>{j.pmName||"—"}</span><span>{j.description}</span></div>
        <div className="recv-amt">{money(j.contractValue,j.currency)}
          <small>{money(totals[j.id]?.invoiced||0,j.currency)} invoiced</small></div>
        <div className="cb-schedule">
          {accounts?<label>Every<select value={j.everyDays} disabled={busy===j.id}
              onChange={e=>act(j.id,()=>completionApi.setJob(j.id,{everyDays:Number(e.target.value)}),`${j.jobRef}: asked every ${e.target.value} days`)}>
              {[...new Set([...EVERY,j.everyDays])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{d===7?"7 days (weekly)":`${d} day${d===1?"":"s"}`}</option>)}</select></label>
            :<span>Every {j.everyDays} days</span>}
          <small>{j.active?`Next ${stamp(j.nextRequestAt)}`:"Not requested while inactive"}</small></div>
        <div className="cb-job-status">
          {accounts?<button className={j.active?"cb-toggle on":"cb-toggle"} disabled={busy===j.id} aria-pressed={!!j.active}
              onClick={()=>act(j.id,()=>completionApi.setJob(j.id,{active:!j.active}),`${j.jobRef} is now ${j.active?"inactive":"active"}`)}>
              <i/>{j.active?"Active":"Inactive"}</button>
            :<span className={`recv-tag ${j.active?"c5":"c0"}`}>{j.active?"Active":"Inactive"}</span>}
          {accounts&&!!j.active&&<button className="ghost cb-request" disabled={busy===j.id}
            onClick={()=>act(j.id,()=>completionApi.request(j.id),`${j.jobRef}: completion requested from ${j.pmName||"the project manager"}`)}>
            <Send/>Request now</button>}</div>
      </div>)}</div>}
  </section>}

/* One cycle, and the single action its stage allows. */
function CycleDetail({row,role,userEmail,totals,close,saved,reload}:{row:Cycle;role:string;userEmail:string;totals:Totals;
  close:()=>void;saved:(r:Cycle,msg:string)=>void;reload:()=>void}){
  const[f,setF]=useState<Record<string,string>>({});
  const[note,setNote]=useState(""),[back,setBack]=useState("");
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const at=row.stage as Stage,done=isVerified(at);
  const mine=mayAct(at,[role],same(row.pmEmail,userEmail));
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const val=(k:keyof Cycle,fallback="")=>f[k]??(row[k]?String(row[k]):fallback);
  const certified=Number(val("certifiedPercent",String(row.percentComplete||"")))||0;
  const workValue=row.contractValue*certified/100;
  /* The invoice suggested: the certified value of work to date, less what has already been
     invoiced for the job. Only a suggestion - accounts type what they actually invoice. */
  const suggested=Math.max(0,row.contractValue*(row.certifiedPercent||0)/100-(totals[row.billingJobId]?.invoiced||0));
  const returnable=RETURNABLE_FROM[at]||[];

  const run=async(fn:()=>Promise<Cycle>,msg:string)=>{
    setBusy(true);setErr("");
    try{saved(await fn(),msg)}
    catch(e){const m=e instanceof Error?e.message:"That did not go through";setErr(m);if(m.includes("Somebody else moved"))reload()}
    finally{setBusy(false)}};
  const owner:Record<string,string>={"Project Manager Update":"the project manager","Cost Control Certification":"cost control",
    "Management Approval":"management","Raise Invoice":"accounts","Audit Verification":"audit"};

  return <div className="recv-drawer" role="dialog" aria-label={`${row.ref} details`}>
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside>
      <header><div><small>{row.ref} · {row.jobRef}</small><h3>{row.customer}</h3></div>
        <button onClick={close} aria-label="Close"><X/></button></header>
      <div className={`recv-tag c${stageIndex(row.stage)} big`}>{done&&<CheckCircle2/>}{row.stage}</div>
      {row.returnNote&&<p className="recv-back-note"><RotateCcw/><span><b>Sent back:</b> {row.returnNote}</span></p>}

      <dl className="recv-facts">
        <div><dt>Project manager</dt><dd><UserRound/>{row.pmName||"—"}</dd></div>
        <div><dt>Contract value</dt><dd>{money(row.contractValue,row.currency)}</dd></div>
        <div><dt>Requested</dt><dd>{stamp(row.requestedAt)}{row.requestedBy&&row.requestedBy!=="schedule"?` · ${row.requestedBy}`:" · weekly schedule"}</dd></div>
        {!!row.pmUpdatedAt&&<div><dt>Completion</dt><dd>{row.percentComplete}% · {row.updatedBy} · {day(row.pmUpdatedAt)}</dd></div>}
        {!!row.completionNotes&&<div><dt>Completion notes</dt><dd>{row.completionNotes}</dd></div>}
        {!!row.certifiedAt&&<div><dt>Certified</dt><dd><ShieldCheck/>{row.certifiedPercent}% · {row.certifiedBy} · {day(row.certifiedAt)}</dd></div>}
        {!!row.certificationNotes&&<div><dt>Certification notes</dt><dd>{row.certificationNotes}</dd></div>}
        {!!row.approvedAt&&<div><dt>Approved</dt><dd>{row.approvedBy} · {day(row.approvedAt)}{row.approvalNotes?` · ${row.approvalNotes}`:""}</dd></div>}
        {!!row.invoiceNo&&<div><dt>Invoice</dt><dd>{row.invoiceNo} · {day(row.invoiceDate)} · {money(row.invoiceAmount,row.currency)}</dd></div>}
        {done&&<div><dt>Verified</dt><dd><ShieldCheck/>{row.verifiedBy} · {day(row.verifiedAt)}{row.remarks?` · ${row.remarks}`:""}</dd></div>}
      </dl>

      {err&&<p className="recv-error">{err}</p>}

      {done?<p className="recv-empty">Verified. Nothing further is expected on this cycle.</p>
      :!mine?<p className="recv-empty">This cycle is with {owner[at]}. Your role cannot act on it at this stage.</p>
      :<div className="recv-act">
        {at==="Project Manager Update"&&<>
          <label>Completion to date (%)<input autoFocus type="number" min="0" max="100" step="1" value={val("percentComplete")}
            onChange={e=>set("percentComplete",e.target.value)}/></label>
          <label>Completion notes<textarea rows={3} value={val("completionNotes")} onChange={e=>set("completionNotes",e.target.value)}
            placeholder="What was done this period, what remains, any delays"/></label>
          <p className="recv-hint">Attach site photos or a progress report below.</p></>}
        {at==="Cost Control Certification"&&<>
          <label>Certified completion (%)<input autoFocus type="number" min="0" max="100" step="1"
            value={f.certifiedPercent??String(row.certifiedPercent||row.percentComplete||"")}
            onChange={e=>set("certifiedPercent",e.target.value)}/></label>
          <p className="recv-hint">Value of work to date at {certified}%: <b>{money(workValue,row.currency)}</b></p>
          <label>Certification notes<textarea rows={2} value={val("certificationNotes")} onChange={e=>set("certificationNotes",e.target.value)}
            placeholder="Optional"/></label></>}
        {at==="Management Approval"&&<label>Approval notes<textarea rows={2} value={val("approvalNotes")}
          onChange={e=>set("approvalNotes",e.target.value)} placeholder="Optional"/></label>}
        {at==="Raise Invoice"&&<>
          <div className="recv-two">
            <label>Invoice number<input autoFocus value={val("invoiceNo")} onChange={e=>set("invoiceNo",e.target.value)}/></label>
            <label>Invoice date<input type="date" value={val("invoiceDate",new Date().toISOString().slice(0,10))}
              onChange={e=>set("invoiceDate",e.target.value)}/></label></div>
          <div className="recv-two">
            <label>Invoice amount<input type="number" min="0" step="0.01" value={f.invoiceAmount??(row.invoiceAmount?String(row.invoiceAmount):suggested?suggested.toFixed(2):"")}
              onChange={e=>set("invoiceAmount",e.target.value)}/></label>
            <label>Currency<input value={val("currency")} onChange={e=>set("currency",e.target.value)}/></label></div>
          <p className="recv-hint">Suggested: {row.certifiedPercent}% of {money(row.contractValue,row.currency)}, less {money(totals[row.billingJobId]?.invoiced||0,row.currency)} already invoiced. Attach the invoice below.</p></>}
        {at==="Audit Verification"&&<label>Audit remarks<textarea rows={2} value={val("remarks")}
          onChange={e=>set("remarks",e.target.value)} placeholder="Optional"/></label>}

        <button className="primary" disabled={busy} onClick={()=>{
          const fields:Record<string,string>={...f};
          if(at==="Cost Control Certification"&&fields.certifiedPercent===undefined)fields.certifiedPercent=String(row.certifiedPercent||row.percentComplete||"");
          if(at==="Raise Invoice"){if(fields.invoiceDate===undefined)fields.invoiceDate=row.invoiceDate||new Date().toISOString().slice(0,10);
            if(fields.invoiceAmount===undefined&&!row.invoiceAmount&&suggested)fields.invoiceAmount=suggested.toFixed(2)}
          run(()=>completionApi.advance(row.id,fields),`${row.ref}: ${ACTION_LABEL[at].toLowerCase()} done`)}}>
          {busy?"Saving…":ACTION_LABEL[at]}<ArrowRight/></button>

        {!!returnable.length&&<div className="recv-return">
          <b><ArrowLeft/>Send back for correction</b>
          <select value={back} onChange={e=>setBack(e.target.value)}>
            <option value="">Choose the stage to send it back to…</option>
            {returnable.map(s=><option key={s} value={s}>{s}</option>)}</select>
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="What needs correcting?"/>
          <button className="ghost danger" disabled={busy||!back||!note.trim()}
            onClick={()=>run(()=>completionApi.sendBack(row.id,back,note.trim()),`${row.ref} sent back to ${back}`)}>Send back</button></div>}
      </div>}

      <Attachments entityType="completion" entityId={row.id} flash={()=>{}}/>
    </aside></div>}

