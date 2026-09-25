"use client";

/* Accounts Receivable, module 2: Planning & Procurement.

   A job verified in Job Notification is planned here: accounts assign a project manager,
   the manager schedules the work and details the bill of materials to procure, and audit
   verifies the plan. lib/planning-stages.ts holds the flow and who may act at each stage;
   this screen shows only what that model allows, and the server checks it again. */

import{useMemo,useState}from"react";
import{ArrowLeft,ArrowRight,CheckCircle2,Plus,RotateCcw,Search,ShieldCheck,UserRound,X}from"lucide-react";
import{planningApi}from"./audit-api";
import type{Plan,PlanJob}from"./audit-api";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import Attachments from"./Attachments";
import{ACCOUNTS_ROLES,ACTION_LABEL,RECEIVABLE_ROLES,RETURNABLE_TO,STAGES,isVerified,mayAct,stageIndex}
  from"../lib/planning-stages";
import type{Stage}from"../lib/planning-stages";

type Props={role:string;userEmail?:string;flash?:(m:string)=>void};

const money=(n:number,c:string)=>n?`${c} ${n.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—";
const day=(v:string)=>v?new Date(v).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—";
const same=(a?:string,b?:string)=>!!a&&!!b&&a.trim().toLowerCase()===b.trim().toLowerCase();

export default function PlanningProcurement({role,userEmail="",flash}:Props){
  const[stage,setStage]=useState("All stages"),[q,setQ]=useState(""),
    [open,setOpen]=useState<Plan|null>(null),[starting,setStarting]=useState(false),[version,setVersion]=useState(0);
  const reload=()=>setVersion(v=>v+1);
  const canStart=ACCOUNTS_ROLES.includes(role);
  const{data,loading,error}=useAsync(()=>planningApi.load(),[version]);
  /* The jobs waiting to be planned: shown as the count on the first stage, and offered
     when a plan is started. Only accounts can read them. */
  const waiting=useAsync(()=>canStart?planningApi.jobs():Promise.resolve([] as PlanJob[]),[version,canStart]);
  const rows=useMemo(()=>data?.plans||[],[data]);
  const shown=useMemo(()=>rows.filter(r=>(stage==="All stages"||r.stage===stage)&&
    (!q.trim()||[r.ref,r.jobRef,r.customer,r.description,r.pmName].join(" ").toLowerCase()
      .includes(q.trim().toLowerCase()))),[rows,stage,q]);
  const counts=useMemo(()=>{const c:Record<string,number>={};
    rows.forEach(r=>c[r.stage]=(c[r.stage]||0)+1);
    c["Job Notification"]=waiting.data?.length||0;return c},[rows,waiting.data]);
  const managerOnly=!RECEIVABLE_ROLES.includes(role);

  return <div className="recv-module">
    <div className="recv-subhead"><p>{managerOnly
      ?"The plans you are the project manager for: the schedule, then the detailed BOM and procurement plan."
      :"A verified job gets a project manager, a schedule and plan, and a detailed BOM and procurement plan, which audit then verifies."}</p>
      {canStart&&<button className="primary" onClick={()=>setStarting(true)}><Plus/>Start planning</button>}</div>

    <div className="recv-flow">
      {STAGES.map((s,i)=><button key={s} className={stage===s?"recv-stage on":"recv-stage"}
        onClick={()=>s==="Job Notification"?(canStart&&setStarting(true)):setStage(stage===s?"All stages":s)}
        title={s==="Job Notification"?"Verified jobs not yet planned":undefined}>
        <b>{counts[s]||0}</b><span>{s}</span>
        {i<STAGES.length-1&&<ArrowRight className="recv-arrow"/>}</button>)}
    </div>

    <section className="panel">
      <header className="recv-head">
        <h3>{stage==="All stages"?"All plans":stage}<i>{shown.length}</i></h3>
        <label className="recv-search"><Search/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Reference, job, customer or project manager"/>
          {q&&<button onClick={()=>setQ("")} aria-label="Clear search"><X/></button>}</label>
        {stage!=="All stages"&&<button className="ghost" onClick={()=>setStage("All stages")}>Show all stages</button>}
      </header>
      {error?<ErrorBlock message={error} retry={reload}/>
      :loading?<Loading label="Loading plans"/>
      :!rows.length?<Empty label={managerOnly?"No plan names you as project manager yet."
        :canStart?"No plans yet. Start one from a job verified in Job Notification.":"No plans yet."}/>
      :!shown.length?<Empty label="No plan matches that."/>
      :<div className="recv-rows">
        <div className="recv-cols" aria-hidden="true"><span>Reference</span><span>Job</span>
          <span>Project manager</span><span className="num">Est. procurement</span><span className="num">Status</span></div>
        {shown.map(r=><button key={r.id} className="recv-row" onClick={()=>setOpen(r)}>
          <div className="recv-ref"><b>{r.ref}</b><small>{r.customer}</small></div>
          <div className="recv-desc">{r.jobRef} · {r.description||"—"}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}</div>
          <div className="recv-nums"><span>{r.pmName||"Not assigned"}</span>
            {r.startDate&&<span>{day(r.startDate)} → {day(r.endDate)}</span>}</div>
          <div className="recv-amt">{money(r.bomCost,r.currency)}</div>
          <div className={`recv-tag p${stageIndex(r.stage)}`}>{isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
        </button>)}</div>}
    </section>

    {open&&<Detail row={open} role={role} userEmail={userEmail} close={()=>setOpen(null)} reload={reload}
      saved={(r,msg)=>{setOpen(r);reload();flash?.(msg)}}/>}
    {starting&&<StartPlan jobs={waiting.data||[]} close={()=>setStarting(false)}
      added={r=>{setStarting(false);reload();setOpen(r);flash?.(`${r.ref} started for ${r.jobRef}`)}}/>}
  </div>}

/* One plan, and the single action its stage allows, with the form that action needs. */
function Detail({row,role,userEmail,close,saved,reload}:{row:Plan;role:string;userEmail:string;
  close:()=>void;saved:(r:Plan,msg:string)=>void;reload:()=>void}){
  const[f,setF]=useState<Partial<Plan>>({});
  const[note,setNote]=useState(""),[back,setBack]=useState("");
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const at=row.stage as Stage,done=isVerified(at);
  const isManager=same(row.pmEmail,userEmail);
  const mine=mayAct(at,[role],isManager);
  const set=(k:keyof Plan,v:string)=>setF(x=>({...x,[k]:v}));
  const val=(k:keyof Plan)=>String(f[k]??row[k]??"");
  const people=useAsync(()=>at==="Assign Project Manager"&&mine?planningApi.people():Promise.resolve([]),[at,mine]);

  const run=async(fn:()=>Promise<Plan>,msg:string)=>{
    setBusy(true);setErr("");
    try{saved(await fn(),msg)}
    catch(e){const m=e instanceof Error?e.message:"That did not go through";setErr(m);
      if(m.includes("Somebody else moved"))reload()}
    finally{setBusy(false)}};

  const who=at==="Audit Verification"?"audit":at==="Assign Project Manager"?"accounts":"the project manager";
  return <div className="recv-drawer" role="dialog" aria-label={`${row.ref} details`}>
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside>
      <header><div><small>{row.ref} · {row.jobRef}</small><h3>{row.customer}</h3></div>
        <button onClick={close} aria-label="Close"><X/></button></header>
      <div className={`recv-tag p${stageIndex(row.stage)} big`}>{done&&<CheckCircle2/>}{row.stage}</div>
      {row.returnNote&&<p className="recv-back-note"><RotateCcw/><span><b>Sent back by audit:</b> {row.returnNote}</span></p>}

      <dl className="recv-facts">
        <div><dt>Job</dt><dd>{row.jobRef} · {row.description||"—"}</dd></div>
        <div><dt>Project manager</dt><dd><UserRound/>{row.pmName?`${row.pmName} · ${row.pmEmail}`:"Not assigned yet"}</dd></div>
        <div><dt>Schedule</dt><dd>{row.startDate?`${day(row.startDate)} → ${day(row.endDate)}`:"Not planned yet"}</dd></div>
        {!!row.planNotes&&<div><dt>Planning notes</dt><dd>{row.planNotes}</dd></div>}
        <div><dt>BOM</dt><dd>{row.bomSummary||"Not detailed yet"}</dd></div>
        <div><dt>Est. procurement</dt><dd>{money(row.bomCost,row.currency)}</dd></div>
        {!!row.procurementNotes&&<div><dt>Procurement notes</dt><dd>{row.procurementNotes}</dd></div>}
        {!!row.submittedAt&&<div><dt>Sent for audit</dt><dd>{day(row.submittedAt)}</dd></div>}
        {done&&<div><dt>Verified</dt><dd><ShieldCheck/>{row.verifiedBy} · {day(row.verifiedAt)}</dd></div>}
        {done&&!!row.remarks&&<div><dt>Audit remarks</dt><dd>{row.remarks}</dd></div>}
      </dl>

      {err&&<p className="recv-error">{err}</p>}

      {done?<p className="recv-empty">Verified. Nothing further is expected on this plan.</p>
      :!mine?<p className="recv-empty">This plan is with {who}. Your role cannot act on it at this stage.</p>
      :<div className="recv-act">
        {at==="Assign Project Manager"&&<label>Project manager
          <select autoFocus value={val("pmEmail")} onChange={e=>set("pmEmail",e.target.value)}>
            <option value="">{people.loading?"Loading people…":"Choose the project manager…"}</option>
            {(people.data||[]).map(p=><option key={p.email} value={p.email}>{p.name?`${p.name} · ${p.email}`:p.email}</option>)}
          </select></label>}
        {at==="Project Schedule and Planning"&&<>
          <div className="recv-two">
            <label>Start date<input type="date" value={val("startDate")} onChange={e=>set("startDate",e.target.value)}/></label>
            <label>Target completion<input type="date" value={val("endDate")} onChange={e=>set("endDate",e.target.value)}/></label></div>
          <label>Planning notes<textarea rows={3} value={val("planNotes")} onChange={e=>set("planNotes",e.target.value)}
            placeholder="Phases, milestones, resources, site constraints"/></label>
          <p className="recv-hint">Attach the project schedule below if there is one.</p></>}
        {at==="Detailed BOM - Procurement Planning"&&<>
          <label>BOM summary<textarea rows={3} value={val("bomSummary")} onChange={e=>set("bomSummary",e.target.value)}
            placeholder="Main materials and quantities - attach the detailed BOM below"/></label>
          <div className="recv-two">
            <label>Estimated procurement cost<input type="number" min="0" step="0.01" value={f.bomCost===undefined?(row.bomCost||""):String(f.bomCost)}
              onChange={e=>set("bomCost",e.target.value)}/></label>
            <label>Currency<input value={val("currency")} onChange={e=>set("currency",e.target.value)}/></label></div>
          <label>Procurement notes<textarea rows={2} value={val("procurementNotes")} onChange={e=>set("procurementNotes",e.target.value)}
            placeholder="Vendors, lead times, what is ordered when"/></label></>}
        {at==="Audit Verification"&&<label>Audit remarks<textarea rows={2} value={val("remarks")}
          onChange={e=>set("remarks",e.target.value)} placeholder="Optional"/></label>}

        <button className="primary" disabled={busy}
          onClick={()=>run(()=>planningApi.advance(row.id,f),`${row.ref}: ${ACTION_LABEL[at].toLowerCase()} done`)}>
          {busy?"Saving…":ACTION_LABEL[at]}<ArrowRight/></button>

        {at==="Audit Verification"&&<div className="recv-return">
          <b><ArrowLeft/>Send back for correction</b>
          <select value={back} onChange={e=>setBack(e.target.value)}>
            <option value="">Choose the stage to send it back to…</option>
            {RETURNABLE_TO.map(s=><option key={s} value={s}>{s}</option>)}</select>
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}
            placeholder="What needs correcting? The project manager and accounts see this."/>
          <button className="ghost danger" disabled={busy||!back||!note.trim()}
            onClick={()=>run(()=>planningApi.sendBack(row.id,back,note.trim()),`${row.ref} sent back to ${back}`)}>Send back</button></div>}
      </div>}

      {/* The schedule, the BOM and anything else the plan rests on. */}
      <Attachments entityType="planning" entityId={row.id} flash={()=>{}}/>
    </aside></div>}

/* Starting a plan is choosing its job: one verified in Job Notification that has no plan. */
function StartPlan({jobs,close,added}:{jobs:PlanJob[];close:()=>void;added:(r:Plan)=>void}){
  const[jobId,setJobId]=useState(jobs[0]?.id||""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const job=jobs.find(j=>j.id===jobId);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{added(await planningApi.start(jobId))}
    catch(x){setErr(x instanceof Error?x.message:"Could not start it");setBusy(false)}};
  return <div className="recv-drawer" role="dialog" aria-label="Start planning">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>PLANNING & PROCUREMENT</small><h3>Start planning</h3></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      {!jobs.length?<p className="recv-empty">No job is waiting to be planned. A job can be planned once it
        is verified in Job Notification, and each job is planned once.</p>
      :<form className="recv-act" onSubmit={submit}>
        <label>Job from Job Notification<select autoFocus required value={jobId} onChange={e=>setJobId(e.target.value)}>
          {jobs.map(j=><option key={j.id} value={j.id}>{j.ref} · {j.customer}</option>)}</select></label>
        {job&&<p className="recv-hint">{job.description||"No description recorded."}</p>}
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy||!jobId}>{busy?"Starting…":"Start planning"}</button>
      </form>}
    </aside></div>}
