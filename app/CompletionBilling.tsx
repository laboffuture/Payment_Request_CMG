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
import Attachments,{asDataUrl}from"./Attachments";
import FilePicker from"./FilePicker";
import{ACCOUNTS_ROLES,ACTION_LABEL,BILLING_ROLES,BILLING_STATUSES,CC_CERTIFICATIONS,COLLECTION_STATUSES,FLOW,INVOICE_TYPES,
  JOB_STATUSES,MANAGEMENT_APPROVALS,MANAGEMENT_ROLES,RETURNABLE_FROM,invoiceFigures,isVerified,mayAct,stageIndex}
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
    (!q.trim()||[r.ref,r.jobRef,r.jobCode,r.projectName,r.customer,r.pmName,r.invoiceNo].join(" ").toLowerCase().includes(q.trim().toLowerCase()))),
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
          <div className="recv-desc">{r.jobCode||r.jobRef} · requested {day(r.requestedAt)}
            {!!r.jobStatus&&<small className="cb-statuses">{r.jobStatus} · {r.billingStatus} · {r.collectionStatus}</small>}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}</div>
          <div className="recv-nums"><span><i>PM</i>{r.pmUpdatedAt?`${r.percentComplete}%`:"Awaited"}</span>
            <span><i>CERT</i>{r.certifiedAt?`${r.certifiedPercent}%`:"—"}</span></div>
          <div className="recv-amt">{r.invoiceNo?money(r.invoiceAmount,r.currency):"—"}</div>
          <div className={`recv-tag c${stageIndex(r.stage)}`}>{isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
        </button>)}</div>}
    </section>}

    {open&&<CycleDetail row={open} job={jobs.find(j=>j.id===open.billingJobId)} role={role} userEmail={userEmail} totals={totals} close={()=>setOpen(null)} reload={reload}
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
        <div className="recv-ref"><b>{j.jobCode||j.jobRef}</b><small>{j.customer}</small></div>
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
function CycleDetail({row,job,role,userEmail,totals,close,saved,reload}:{row:Cycle;job?:BillingJob;role:string;userEmail:string;totals:Totals;
  close:()=>void;saved:(r:Cycle,msg:string)=>void;reload:()=>void}){
  const[f,setF]=useState<Record<string,string>>({});
  const[note,setNote]=useState(""),[back,setBack]=useState("");
  const[busy,setBusy]=useState(false),[err,setErr]=useState(""),[form,setForm]=useState(false);
  const at=row.stage as Stage,done=isVerified(at);
  const mine=mayAct(at,[role],same(row.pmEmail,userEmail));
  /* Maker-checker: who updated or certified this cycle cannot approve it. */
  const madeIt=same(row.updatedByEmail,userEmail)||same(row.certifiedByEmail,userEmail);
  const cc=f.ccCertification??"",approval=f.managementApproval??"";
  /* Management's decision on the invoice, taken at Raise Invoice. */
  const decider=at==="Raise Invoice"&&row.invoiceApproval==="Pending"&&MANAGEMENT_ROLES.includes(role);
  const preparedIt=same(row.invoicedByEmail,userEmail);
  const[invoiceForm,setInvoiceForm]=useState(false),[verdict,setVerdict]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const val=(k:keyof Cycle,fallback="")=>f[k]??(row[k]?String(row[k]):fallback);
  const certified=Number(val("certifiedPercent",String(row.percentComplete||"")))||0;
  const workValue=row.contractValue*certified/100;
  const returnable=at==="Audit Verification"?RETURNABLE_FROM[at]||[]:[];

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
        {!!row.jobCode&&<div><dt>Job code</dt><dd>{row.jobCode}</dd></div>}
        {!!row.projectName&&<div><dt>Project</dt><dd>{row.projectName}</dd></div>}
        <div><dt>Project manager</dt><dd><UserRound/>{row.pmName||"—"}</dd></div>
        <div><dt>Contract value</dt><dd>{money(row.contractValue,row.currency)}</dd></div>
        {!!(row.startDate||row.expectedCompletion)&&<div><dt>Schedule</dt><dd>{day(row.startDate)} → {day(row.expectedCompletion)}</dd></div>}
        {!!row.jobStatus&&<div><dt>Job status</dt><dd>{row.jobStatus}</dd></div>}
        {!!row.billingStatus&&<div><dt>Billing status</dt><dd>{row.billingStatus}</dd></div>}
        {!!row.collectionStatus&&<div><dt>Collection status</dt><dd>{row.collectionStatus}</dd></div>}
        {!!row.completionRequestDate&&<div><dt>Completion request</dt><dd>{day(row.completionRequestDate)}</dd></div>}
        {!!row.actualCompletionDate&&<div><dt>Actual completion</dt><dd>{day(row.actualCompletionDate)}</dd></div>}
        {!!row.pendingWork&&<div><dt>Pending work</dt><dd>{row.pendingWork}</dd></div>}
        {!!row.delayReason&&<div><dt>Reason for delay</dt><dd>{row.delayReason}</dd></div>}
        <div><dt>Requested</dt><dd>{stamp(row.requestedAt)}{row.requestedBy&&row.requestedBy!=="schedule"?` · ${row.requestedBy}`:" · weekly schedule"}</dd></div>
        {!!row.pmUpdatedAt&&<div><dt>Completion</dt><dd>{row.percentComplete}% · {row.updatedBy} · {day(row.pmUpdatedAt)}</dd></div>}
        {!!row.completionNotes&&<div><dt>Completion notes</dt><dd>{row.completionNotes}</dd></div>}
        {!!row.ccCertification&&<div><dt>Cost control</dt><dd><ShieldCheck/>{row.ccCertification==="Not certified"?"Not certified"
          :`${row.ccCertification} · ${row.certifiedPercent}%`} · {row.certifiedBy} · {day(row.certifiedAt)}</dd></div>}
        {!!row.ccCertification&&!!row.certificationNotes&&<div><dt>Certification notes</dt><dd>{row.certificationNotes}</dd></div>}
        {!!row.managementApproval&&<div><dt>Management</dt><dd>{row.managementApproval} · {row.approvedBy} · {day(row.approvedAt)}{row.approvalNotes?` · ${row.approvalNotes}`:""}</dd></div>}
        {!!row.invoiceNo&&<div><dt>Invoice</dt><dd>{row.invoiceNo} · {row.invoiceType||"Invoice"} · {day(row.invoiceDate)}</dd></div>}
        {!!row.invoiceNo&&!!row.currentBilling&&<div><dt>Billing</dt><dd>Current {money(row.currentBilling,row.currency)} ·
          cumulative {money(row.cumulativeBilling,row.currency)}</dd></div>}
        {!!row.invoiceNo&&<div><dt>Net invoice value</dt><dd>{money(row.invoiceAmount,row.currency)}
          {!!(row.advanceAdjustment||row.retentionAmount||row.taxAmount)&&` (advance −${(row.advanceAdjustment||0).toLocaleString()}, retention −${(row.retentionAmount||0).toLocaleString()}, tax +${(row.taxAmount||0).toLocaleString()})`}</dd></div>}
        {!!row.invoiceApproval&&<div><dt>Invoice approval</dt><dd>{row.invoiceApproval==="Pending"?"Awaiting management"
          :`${row.invoiceApproval} · ${row.invoiceApprovedBy} · ${day(row.invoiceApprovedAt)}`}{row.invoiceApprovalNote?` · ${row.invoiceApprovalNote}`:""}</dd></div>}
        {done&&<div><dt>Verified</dt><dd><ShieldCheck/>{row.verifiedBy} · {day(row.verifiedAt)}{row.remarks?` · ${row.remarks}`:""}</dd></div>}
      </dl>

      {err&&<p className="recv-error">{err}</p>}

      {done?<p className="recv-empty">Verified. Nothing further is expected on this cycle.</p>
      :decider&&(!mine||!ACCOUNTS_ROLES.includes(role)||!preparedIt)?<div className="recv-act">
        {preparedIt&&<p className="recv-back-note"><ShieldCheck/><span>You prepared this invoice, so someone else in management
          must approve it (maker-checker). You can still reject it.</span></p>}
        <label>Management approval<select autoFocus value={verdict} onChange={e=>setVerdict(e.target.value)}
          title="Management authorisation - maker-checker control">
          <option value="">Select approval</option>{MANAGEMENT_APPROVALS.map(a=><option key={a} disabled={a==="Approved"&&preparedIt}>{a}</option>)}</select></label>
        {verdict==="Rejected"&&<label>Reason for rejecting<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}
          placeholder="Accounts see this"/></label>}
        <button className="primary" disabled={busy||!verdict||(verdict==="Rejected"&&!note.trim())}
          onClick={()=>run(()=>completionApi.decideInvoice(row.id,verdict,note.trim()),`${row.invoiceNo}: invoice ${verdict.toLowerCase()}`)}>
          {busy?"Saving…":verdict==="Rejected"?"Reject invoice":"Approve invoice"}{verdict==="Rejected"?<ArrowLeft/>:<ArrowRight/>}</button>
      </div>
      :!mine?<p className="recv-empty">{at==="Raise Invoice"&&row.invoiceApproval==="Pending"
        ?"The invoice is waiting for management approval."
        :`This cycle is with ${owner[at]}. Your role cannot act on it at this stage.`}</p>
      :<div className="recv-act">
        {at==="Project Manager Update"&&<p className="recv-hint">Fill in the completion &amp; billing form: the completion,
          the billing, collection and job statuses, the dates, pending work and any reason for delay. Attach site photos or a
          progress report below.</p>}
        {at==="Cost Control Certification"&&<>
          <label>Cost control certification<select autoFocus value={cc} onChange={e=>set("ccCertification",e.target.value)}>
            <option value="">Select certification</option>{CC_CERTIFICATIONS.map(c=><option key={c}>{c}</option>)}</select></label>
          {cc==="Certified"&&<><label>Certified completion (%)<input type="number" min="0" max="100" step="1"
            value={f.certifiedPercent??String(row.certifiedPercent||row.percentComplete||"")}
            onChange={e=>set("certifiedPercent",e.target.value)}/></label>
          <p className="recv-hint">Value of work to date at {certified}%: <b>{money(workValue,row.currency)}</b></p></>}
          {!!cc&&<label>{cc==="Certified"?"Certification notes":"Why it is not certified"}<textarea rows={2}
            value={cc==="Certified"?val("certificationNotes"):note} placeholder={cc==="Certified"?"Optional":"The project manager sees this"}
            onChange={e=>cc==="Certified"?set("certificationNotes",e.target.value):setNote(e.target.value)}/></label>}</>}
        {at==="Management Approval"&&<>
          {madeIt&&<p className="recv-back-note"><ShieldCheck/><span>You updated or certified this completion, so someone else
            in management must approve it (maker-checker). You can still reject it.</span></p>}
          <label>Management approval<select autoFocus value={approval} onChange={e=>set("managementApproval",e.target.value)}
            title="Management authorisation - maker-checker control">
            <option value="">Select approval</option>{MANAGEMENT_APPROVALS.map(a=><option key={a} disabled={a==="Approved"&&madeIt}>{a}</option>)}</select></label>
          {approval==="Approved"&&<label>Approval notes<textarea rows={2} value={val("approvalNotes")}
            onChange={e=>set("approvalNotes",e.target.value)} placeholder="Optional"/></label>}
          {approval==="Rejected"&&<>
            <label>Send it back to<select value={back} onChange={e=>setBack(e.target.value)}>
              <option value="">Choose the stage…</option>
              {(RETURNABLE_FROM[at]||[]).map(s=><option key={s} value={s}>{s}</option>)}</select></label>
            <label>Reason for rejecting<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}
              placeholder="What needs correcting?"/></label></>}</>}
        {at==="Raise Invoice"&&<p className="recv-hint">{row.invoiceApproval==="Pending"
          ?"The invoice waits for management approval. You can still correct it; it stays with management."
          :row.invoiceApproval==="Rejected"?"Management rejected the invoice. Correct it and submit it again."
          :"Prepare the invoice: the billing, deductions and tax, with supporting documents. Management approves it before it goes to audit."}</p>}
        {at==="Audit Verification"&&<label>Audit remarks<textarea rows={2} value={val("remarks")}
          onChange={e=>set("remarks",e.target.value)} placeholder="Optional"/></label>}

        {at==="Raise Invoice"
        ?<button className="primary" disabled={busy} onClick={()=>setInvoiceForm(true)}>
          {row.invoiceApproval==="Pending"?"Correct the invoice":row.invoiceApproval==="Rejected"?"Correct and resubmit the invoice":"Open invoice form"}<ArrowRight/></button>
        :at==="Cost Control Certification"&&cc==="Not certified"
        ?<button className="primary" disabled={busy||!note.trim()}
          onClick={()=>run(()=>completionApi.sendBack(row.id,"Project Manager Update",note.trim()),`${row.ref}: not certified, sent back to the project manager`)}>
          {busy?"Saving…":"Send back as not certified"}<ArrowLeft/></button>
        :at==="Management Approval"&&approval==="Rejected"
        ?<button className="primary" disabled={busy||!back||!note.trim()}
          onClick={()=>run(()=>completionApi.sendBack(row.id,back,note.trim()),`${row.ref}: rejected, sent back to ${back}`)}>
          {busy?"Saving…":"Reject and send back"}<ArrowLeft/></button>
        :<button className="primary" disabled={busy||(at==="Cost Control Certification"&&!cc)||(at==="Management Approval"&&!approval)}
          onClick={()=>{if(at==="Project Manager Update"){setForm(true);return}
          const fields:Record<string,string>={...f};
          if(at==="Cost Control Certification"&&fields.certifiedPercent===undefined)fields.certifiedPercent=String(row.certifiedPercent||row.percentComplete||"");
          run(()=>completionApi.advance(row.id,fields),`${row.ref}: ${ACTION_LABEL[at].toLowerCase()} done`)}}>
          {busy?"Saving…":at==="Project Manager Update"?"Open completion & billing form":ACTION_LABEL[at]}<ArrowRight/></button>}

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
    </aside>
    {invoiceForm&&<InvoiceForm row={row} job={job} invoiced={totals[row.billingJobId]?.invoiced||0} close={()=>setInvoiceForm(false)}
      saved={r=>{setInvoiceForm(false);saved(r,`${r.invoiceNo}: submitted for management approval`)}}/>}
    {form&&<CompletionForm row={row} close={()=>setForm(false)}
      saved={r=>{setForm(false);saved(r,`${r.ref}: completion update submitted`)}}/>}</div>}

const lbl=(text:string,required=false)=><span className="recv-lbl">{text}{required&&<i className="recv-req" aria-hidden="true">*</i>}</span>;

/* Completion & Billing, in the order of its field specification. The job code, client,
   project manager, contract value and dates come from the job and are shown, not
   entered; the statuses start from the job's last update. */
function CompletionForm({row,close,saved}:{row:Cycle;close:()=>void;saved:(r:Cycle)=>void}){
  const[f,setF]=useState<Record<string,string>>({percentComplete:row.percentComplete?String(row.percentComplete):"",
    billingStatus:row.billingStatus||"Not billed",collectionStatus:row.collectionStatus||"Not due",jobStatus:row.jobStatus||"In progress",
    completionRequestDate:row.completionRequestDate||row.requestedAt.slice(0,10),actualCompletionDate:row.actualCompletionDate,
    pendingWork:row.pendingWork,delayReason:row.delayReason});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const pick=(k:string,label:string,list:readonly string[],title?:string)=><label>{lbl(label,true)}
    <select required value={f[k]} onChange={e=>set(k,e.target.value)} title={title}>{list.map(o=><option key={o}>{o}</option>)}</select></label>;
  const late=!!row.expectedCompletion&&new Date().toISOString().slice(0,10)>row.expectedCompletion&&f.jobStatus!=="Completed";
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{saved(await completionApi.advance(row.id,f))}
    catch(x){setErr(x instanceof Error?x.message:"Could not submit the update");setBusy(false)}};
  const auto=(label:string,value:string)=><label>{lbl(label,true)}<input readOnly className="recv-auto" value={value||"—"}/></label>;
  const autoOpt=(label:string,value:string)=><label>{lbl(label)}<input readOnly className="recv-auto" value={value||"—"}/></label>;

  return <div className="recv-drawer wide recv-over" role="dialog" aria-label="Completion and billing">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>COMPLETION &amp; BILLING · {row.ref}</small><h3>{row.projectName||row.customer}</h3>
        <p className="recv-form-sub">Requested {day(row.requestedAt)}. The job&apos;s details come from the job; update the rest and submit.</p></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        <div className="recv-two">{auto("Job code",row.jobCode||row.jobRef)}{auto("Client",row.customer)}</div>
        <div className="recv-two">{auto("Project manager",row.pmName)}{auto("Contract value",money(row.contractValue,row.currency))}</div>
        <div className="recv-two">{autoOpt("Start date",row.startDate?day(row.startDate):"")}{autoOpt("Expected completion",row.expectedCompletion?day(row.expectedCompletion):"")}</div>
        <div className="recv-two">
          <label>{lbl("% completion",true)}<input type="number" required autoFocus min="0" max="100" step="1" value={f.percentComplete}
            onChange={e=>set("percentComplete",e.target.value)}/></label>
          {pick("billingStatus","Billing status",BILLING_STATUSES,"For monitoring progress and ageing")}</div>
        <div className="recv-two">{pick("collectionStatus","Collection status",COLLECTION_STATUSES,"For monitoring progress and ageing")}
          {pick("jobStatus","Job status",JOB_STATUSES,"For monitoring progress and ageing")}</div>
        <div className="recv-two">
          <label>{lbl("Completion request date")}<input type="date" value={f.completionRequestDate} onChange={e=>set("completionRequestDate",e.target.value)}/></label>
          <label>{lbl("Actual completion date")}<input type="date" value={f.actualCompletionDate} onChange={e=>set("actualCompletionDate",e.target.value)}/></label></div>
        <label>{lbl("Pending work")}<textarea rows={3} value={f.pendingWork} onChange={e=>set("pendingWork",e.target.value)}/></label>
        <label>{lbl("Reason for delay")}<textarea rows={3} value={f.delayReason} onChange={e=>set("delayReason",e.target.value)}
          placeholder={late?"The expected completion date has passed - say why":""}/></label>
        <div className="recv-two">
          {auto("Cost control certification","Given by cost control after you submit")}
          {auto("Management approval","Given by management after certification")}</div>
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?"Submitting…":"Submit completion update"}<ArrowRight/></button>
      </form>
    </aside></div>}


/* Invoice Raising, in the order of its field specification. The invoice number is issued
   by the server; the job's details are shown, not entered; cumulative billing and the net
   invoice value are worked out as the figures are typed, and again on the server. */
function InvoiceForm({row,job,invoiced,close,saved}:{row:Cycle;job?:BillingJob;invoiced:number;close:()=>void;saved:(r:Cycle)=>void}){
  const n=(v:number)=>v?String(v):"";
  /* Billed before this invoice: the job's total, less this invoice if it was raised already. */
  const before=Math.max(0,invoiced-(row.invoiceNo?row.currentBilling||0:0));
  const due=Math.max(0,Math.round((row.contractValue*(row.certifiedPercent||0)/100-before)*100)/100);
  const[f,setF]=useState<Record<string,string>>({invoiceType:row.invoiceType||"Progress bill",
    previousBilling:row.invoiceNo?n(row.previousBilling):n(before),currentBilling:row.invoiceNo?n(row.currentBilling):n(due),
    advanceAdjustment:n(row.advanceAdjustment),retentionAmount:n(row.retentionAmount),taxAmount:n(row.taxAmount),
    invoiceDate:row.invoiceDate||new Date().toISOString().slice(0,10),currency:row.currency||"AED",
    billingStatus:row.billingStatus==="Not billed"||!row.billingStatus?"Partly billed":row.billingStatus,
    collectionStatus:row.collectionStatus==="Not due"||!row.collectionStatus?"Pending":row.collectionStatus});
  const[files,setFiles]=useState<File[]>([]);
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const c=f.currency||"AED";
  const amount=(k:string)=>Number(f[k])||0;
  const calc=invoiceFigures({previousBilling:amount("previousBilling"),currentBilling:amount("currentBilling"),
    advanceAdjustment:amount("advanceAdjustment"),retentionAmount:amount("retentionAmount"),taxAmount:amount("taxAmount")});
  const pctOf=(p?:number)=>p?Math.round(amount("currentBilling")*p)/100:0;
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{
      const r=await completionApi.invoice(row.id,f);
      const failed:string[]=[];
      for(const file of files){
        try{const res=await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({entityType:"completion",entityId:row.id,kind:"Invoice",fileName:file.name,
            note:`Supporting document · ${r.invoiceNo}`,dataUrl:await asDataUrl(file)})});
          if(!res.ok)failed.push(file.name)}catch{failed.push(file.name)}}
      if(failed.length)alert(`The invoice was submitted, but these files did not upload: ${failed.join(", ")}. Add them from the cycle.`);
      saved(r)}
    catch(x){setErr(x instanceof Error?x.message:"Could not submit the invoice");setBusy(false)}};
  const auto=(label:string,value:string)=><label>{lbl(label,true)}<input readOnly className="recv-auto" value={value||"—"}/></label>;
  const money2=(v:number)=>money(v,c);
  const amt=(k:string,label:string,required=false,hint?:string)=><label>{lbl(label,required)}
    <input type="number" required={required} min={required?"0.01":"0"} step="0.01" value={f[k]} onChange={e=>set(k,e.target.value)}
      placeholder={hint}/></label>;

  return <div className="recv-drawer wide recv-over" role="dialog" aria-label="Invoice raising">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>INVOICE RAISING · {row.ref}</small><h3>{row.invoiceNo||"New invoice"}</h3>
        <p className="recv-form-sub">Certified {row.certifiedPercent}% of {money(row.contractValue,row.currency)}. Management approves the
          invoice before it goes to audit.</p></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        <div className="recv-two">{auto("Invoice no.",row.invoiceNo||"Issued on submit")}{auto("Job code",row.jobCode||row.jobRef)}</div>
        <div className="recv-two">{auto("Client",row.customer)}{auto("Project",row.projectName)}</div>
        <div className="recv-two">{auto("Contract value",money(row.contractValue,row.currency))}
          <label>{lbl("Invoice type",true)}<select required value={f.invoiceType} onChange={e=>set("invoiceType",e.target.value)}>
            {INVOICE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label></div>
        <div className="recv-two">{amt("previousBilling","Previous billing",false,"Billed before this invoice")}
          {amt("currentBilling","Current billing",true,due?`Certified value not yet billed: ${due.toFixed(2)}`:undefined)}</div>
        <div className="recv-two">
          <label>{lbl("Cumulative billing",true)}<input readOnly className="recv-auto" value={money2(calc.cumulativeBilling)}
            title="Previous billing + current billing"/></label>
          {amt("advanceAdjustment","Advance adjustment",false,job?.advancePercent?`${job.advancePercent}% advance: ${pctOf(job.advancePercent).toFixed(2)}`:undefined)}</div>
        <div className="recv-two">
          {amt("retentionAmount","Retention",false,job?.retentionPercent?`${job.retentionPercent}% retention: ${pctOf(job.retentionPercent).toFixed(2)}`:undefined)}
          {amt("taxAmount","GST / tax")}</div>
        <div className="recv-two">
          <label>{lbl("Net invoice value",true)}<input readOnly className={`recv-auto${calc.net<=0?" cb-neg":""}`} value={money2(calc.net)}
            title="Current billing − advance adjustment − retention + GST / tax"/></label>
          <label>{lbl("Management approval",true)}<input readOnly className="recv-auto" title="Management authorisation - maker-checker control"
            value={row.invoiceApproval==="Rejected"?"Rejected - resubmit for approval":"Given by management after you submit"}/></label></div>
        <div className="recv-two">
          <label>{lbl("Invoice date",true)}<input type="date" required value={f.invoiceDate} onChange={e=>set("invoiceDate",e.target.value)}/></label>
          <label>{lbl("Currency",true)}<input required value={f.currency} onChange={e=>set("currency",e.target.value.toUpperCase())}/></label></div>
        <div className="recv-two">
          <label>{lbl("Billing status",true)}<select required value={f.billingStatus} onChange={e=>set("billingStatus",e.target.value)}>
            {BILLING_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>{lbl("Collection status",true)}<select required value={f.collectionStatus} onChange={e=>set("collectionStatus",e.target.value)}>
            {COLLECTION_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label></div>
        <FilePicker files={files} onChange={setFiles} label="Supporting documents (optional)"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"/>
        {row.invoiceApproval==="Rejected"&&!!row.invoiceApprovalNote&&<p className="recv-back-note"><RotateCcw/><span><b>Rejected:</b> {row.invoiceApprovalNote}</span></p>}
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy||calc.net<=0}>{busy?"Submitting…":"Submit for management approval"}<ArrowRight/></button>
      </form>
    </aside></div>}
