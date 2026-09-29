"use client";

/* Accounts Receivable, module 2: Planning & Procurement.

   A job verified in Job Notification is planned here: accounts assign a project manager,
   the manager schedules the work and details the bill of materials to procure, and audit
   verifies the plan. lib/planning-stages.ts holds the flow and who may act at each stage;
   this screen shows only what that model allows, and the server checks it again. */

import{useEffect,useMemo,useState}from"react";
import{ArrowLeft,ArrowRight,CheckCircle2,Package,Plus,RotateCcw,Search,ShieldCheck,ShoppingCart,Trash2,UserRound,X}from"lucide-react";
import{bomApi,planningApi,procurementApi}from"./audit-api";
import type{BomLine,Plan,PlanJob,Purchase}from"./audit-api";
import{asDataUrl}from"./Attachments";
import{useOptions}from"./options-store";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import Attachments from"./Attachments";
import{ACCOUNTS_ROLES,ACTION_LABEL,BOM_UNITS,MATERIAL_CATEGORIES,NEEDS_APPROVAL,PLAN_PEOPLE,PLAN_READ_ROLES,PROCUREMENT_STATUSES,PLANNING_STATUSES,RETURNABLE_TO,STAGES,
  bomFigures,isVerified,mayAct,stageIndex}
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
    (!q.trim()||[r.ref,r.jobRef,r.jobCode,r.projectName,r.customer,r.description,r.pmName].join(" ").toLowerCase()
      .includes(q.trim().toLowerCase()))),[rows,stage,q]);
  const counts=useMemo(()=>{const c:Record<string,number>={};
    rows.forEach(r=>c[r.stage]=(c[r.stage]||0)+1);
    c["Job Notification"]=waiting.data?.length||0;return c},[rows,waiting.data]);
  const managerOnly=!PLAN_READ_ROLES.includes(role);
  /* Deleting is an administrator's alone, and the server checks it again. */
  const admin=role==="Administrator";
  const[deleting,setDeleting]=useState("");
  const remove=async(r:Plan)=>{
    if(!confirm(`Delete ${r.ref} (${r.jobCode||r.jobRef} · ${r.projectName||r.customer})?\n\nIts schedule, BOM, procurement and every document attached to it are removed for everybody, and the job goes back to waiting to be planned. This cannot be undone.`))return;
    setDeleting(r.id);
    try{const b=await planningApi.remove(r.id);
      if(open?.id===r.id)setOpen(null);
      reload();flash?.(`${b.ref} deleted${b.documents?` with ${b.documents} document${b.documents===1?"":"s"}`:""}`)}
    catch(e){flash?.(e instanceof Error?e.message:"It could not be deleted")}
    finally{setDeleting("")}};

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
        <div className={admin?"recv-cols with-del":"recv-cols"} aria-hidden="true"><span>Reference</span><span>Job</span>
          <span>Project manager</span><span className="num">Est. procurement</span><span className="num">Status</span>{admin&&<span/>}</div>
        {/* A row is not a <button>, so a delete button can sit inside it; it still opens on
            click, Enter or Space. */}
        {shown.map(r=><div key={r.id} role="button" tabIndex={0} className={admin?"recv-row with-del":"recv-row"} onClick={()=>setOpen(r)}
          onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setOpen(r)}}}>
          <div className="recv-ref"><b>{r.ref}</b><small>{r.customer}</small></div>
          <div className="recv-desc">{r.jobCode||r.jobRef} · {r.projectName||r.description||"—"}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}
            {!!r.pendingApprovals&&<i className="pp-await"><ShoppingCart/>{r.pendingApprovals} purchase{r.pendingApprovals===1?"":"s"} awaiting approval</i>}</div>
          <div className="recv-nums"><span>{r.pmName||"Not assigned"}</span>
            {r.startDate&&<span>{day(r.startDate)} → {day(r.endDate)}</span>}
            {r.planningStatus&&<span>{r.planningStatus}</span>}</div>
          <div className="recv-amt">{money(r.bomCost,r.currency)}</div>
          <div className={`recv-tag p${stageIndex(r.stage)}`}>{isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
          {admin&&<button type="button" className="recv-del" title={`Delete ${r.ref}`} aria-label={`Delete ${r.ref}`}
            disabled={deleting===r.id} onClick={e=>{e.stopPropagation();remove(r)}}><Trash2/></button>}
        </div>)}</div>}
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
  const[busy,setBusy]=useState(false),[err,setErr]=useState(""),[planning,setPlanning]=useState(false);
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
        {!!row.jobCode&&<div><dt>Job code</dt><dd>{row.jobCode}</dd></div>}
        {!!row.projectName&&<div><dt>Project</dt><dd>{row.projectName}</dd></div>}
        <div><dt>Job</dt><dd>{row.jobRef} · {row.description||"—"}</dd></div>
        <div><dt>Project manager</dt><dd><UserRound/>{row.pmName?`${row.pmName} · ${row.pmEmail}`:"Not assigned yet"}</dd></div>
        {PLAN_PEOPLE.map(({key,label})=>{const name=row[`${key}Name`],email=row[`${key}Email`];
          return email?<div key={key}><dt>{label}</dt><dd><UserRound/>{name?`${name} · ${email}`:email}</dd></div>:null})}
        <div><dt>Schedule</dt><dd>{row.startDate?`${day(row.startDate)} → ${day(row.endDate)}`:"Not planned yet"}</dd></div>
        {!!row.planningStatus&&<div><dt>Planning status</dt><dd>{row.planningStatus}</dd></div>}
        {!!row.planNotes&&<div><dt>Remarks</dt><dd>{row.planNotes}</dd></div>}
        {!!row.bomSummary&&<div><dt>BOM summary</dt><dd>{row.bomSummary}</dd></div>}
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
        {at==="Project Schedule and Planning"&&<p className="recv-hint">Fill in the project planning form: the dates,
          the planning status and the people on the project. Attach the project schedule below if there is one.</p>}
        {at==="Detailed BOM - Procurement Planning"&&<>
          <p className="recv-hint">Add the material lines to the detailed BOM below. The estimated procurement cost
            is their total - each line&apos;s estimated cost, or its BOQ value where none is entered.</p>
          <div className="recv-two">
            <label>BOM summary<input value={val("bomSummary")} onChange={e=>set("bomSummary",e.target.value)} placeholder="Optional"/></label>
            <label>Currency<input value={val("currency")} onChange={e=>set("currency",e.target.value)}/></label></div>
          <label>Procurement notes<textarea rows={2} value={val("procurementNotes")} onChange={e=>set("procurementNotes",e.target.value)}
            placeholder="Vendors, lead times, what is ordered when (optional)"/></label></>}
        {at==="Audit Verification"&&<label>Audit remarks<textarea rows={2} value={val("remarks")}
          onChange={e=>set("remarks",e.target.value)} placeholder="Optional"/></label>}

        <button className="primary" disabled={busy}
          onClick={()=>at==="Project Schedule and Planning"?setPlanning(true)
            :run(()=>planningApi.advance(row.id,f),`${row.ref}: ${ACTION_LABEL[at].toLowerCase()} done`)}>
          {busy?"Saving…":at==="Project Schedule and Planning"?"Open project planning form":ACTION_LABEL[at]}<ArrowRight/></button>

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

      <Bom plan={row} flash={m=>{saved(row,m)}}/>
      <Procurement plan={row} userEmail={userEmail} flash={m=>{saved(row,m)}}/>

      {/* The schedule, the BOM and anything else the plan rests on. */}
      <Attachments entityType="planning" entityId={row.id} flash={()=>{}}/>
    </aside>
    {planning&&<PlanningForm row={row} close={()=>setPlanning(false)}
      saved={r=>{setPlanning(false);saved(r,`${r.ref}: project plan submitted`)}}/>}</div>}

const lbl=(text:string,required=false)=><span className="recv-lbl">{text}{required&&<i className="recv-req" aria-hidden="true">*</i>}</span>;

/* Project Planning: the plan's dates, status and people. The job code, project and
   project manager come from the job and the stage before, and are shown, not entered. */
function PlanningForm({row,close,saved}:{row:Plan;close:()=>void;saved:(r:Plan)=>void}){
  const[f,setF]=useState<Record<string,string>>(()=>{
    const v:Record<string,string>={startDate:row.startDate,endDate:row.endDate,
      planningStatus:row.planningStatus||"Not started",planNotes:row.planNotes};
    PLAN_PEOPLE.forEach(({key})=>v[`${key}Email`]=row[`${key}Email`]);return v});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const people=useAsync(()=>planningApi.people(),[]);
  const who=(k:string,label:string)=><label key={k}>{lbl(label)}<select value={f[k]||""} onChange={e=>set(k,e.target.value)}>
    <option value="">{people.loading?"Loading people…":"Select a person"}</option>
    {(people.data||[]).map(p=><option key={p.email} value={p.email}>{p.name?`${p.name} · ${p.email}`:p.email}</option>)}</select></label>;
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{saved(await planningApi.advance(row.id,f as unknown as Partial<Plan>))}
    catch(x){setErr(x instanceof Error?x.message:"Could not save the plan");setBusy(false)}};
  const[p1,p2,p3,p4]=PLAN_PEOPLE;

  return <div className="recv-drawer wide recv-over" role="dialog" aria-label="Project planning">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>PROJECT PLANNING · {row.ref}</small><h3>{row.projectName||row.customer}</h3>
        <p className="recv-form-sub">The job code, project and project manager come from the job. Complete the rest and submit the plan.</p></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        <div className="recv-two">
          <label>{lbl("Job code",true)}<input readOnly className="recv-auto" value={row.jobCode||row.jobRef}
            title="The common key linking all of this project's transactions"/></label>
          <label>{lbl("Project",true)}<input readOnly className="recv-auto" value={row.projectName||row.description||row.customer}/></label></div>
        <div className="recv-two">
          <label>{lbl("Project manager",true)}<input readOnly className="recv-auto"
            value={row.pmName?`${row.pmName} · ${row.pmEmail}`:row.pmEmail||"—"}/></label>
          {who(`${p1.key}Email`,p1.label)}</div>
        <div className="recv-two">{who(`${p2.key}Email`,p2.label)}{who(`${p3.key}Email`,p3.label)}</div>
        <div className="recv-two">{who(`${p4.key}Email`,p4.label)}
          <label>{lbl("Start date",true)}<input type="date" required value={f.startDate||""} onChange={e=>set("startDate",e.target.value)}/></label></div>
        <div className="recv-two">
          <label>{lbl("Target completion date",true)}<input type="date" required min={f.startDate||undefined} value={f.endDate||""}
            onChange={e=>set("endDate",e.target.value)}/></label>
          <label>{lbl("Planning status",true)}<select required value={f.planningStatus||""} onChange={e=>set("planningStatus",e.target.value)}
            title="For monitoring the plan's progress and ageing">
            {PLANNING_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label></div>
        <label>{lbl("Remarks")}<textarea rows={4} value={f.planNotes||""} onChange={e=>set("planNotes",e.target.value)}
          placeholder="Phases, milestones, resources, site constraints"/></label>
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?"Submitting…":"Submit project plan"}<ArrowRight/></button>
      </form>
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
          {jobs.map(j=><option key={j.id} value={j.id}>{j.jobCode||j.ref} · {j.projectName||j.customer}</option>)}</select></label>
        {job&&<p className="recv-hint">{job.ref} · {job.customer} · {job.description||"No description recorded."}</p>}
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy||!jobId}>{busy?"Starting…":"Start planning"}</button>
      </form>}
    </aside></div>}

const qty=(n:number|null)=>n===null?"—":n.toLocaleString("en-GB",{maximumFractionDigits:3});
const amt=(n:number|null,c:string)=>n===null?"—":`${c} ${n.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

/* The detailed BOM: the plan's material lines, with the quantities still to buy and the
   cost against the estimate. A negative variance is an overrun. */
function Bom({plan,flash}:{plan:Plan;flash:(m:string)=>void}){
  const[version,setVersion]=useState(0),[editing,setEditing]=useState<Partial<BomLine>|null>(null);
  const{data,loading,error}=useAsync(()=>bomApi.load(plan.id),[plan.id,plan.stage,version]);
  const lines=data?.lines||[],canEdit=!!data?.canEdit,c=plan.currency||"AED";
  const boq=lines.reduce((t,l)=>t+l.boqValue,0);
  return <section className="pp-sched">
    <header><b><Package/>Detailed BOM</b>
      {!!lines.length&&<span>{lines.length} {lines.length===1?"line":"lines"} · BOQ {amt(boq,c)}</span>}
      {canEdit&&<button className="ghost" onClick={()=>setEditing({})}><Plus/>Add BOM line</button>}</header>
    {error?<p className="recv-error">{error}</p>
    :loading&&!data?<p className="recv-hint">Loading the BOM…</p>
    :!lines.length?<p className="recv-hint">No BOM line yet.{canEdit?" Add the first one.":""}</p>
    :<ul>{lines.map(l=><li key={l.id}><button disabled={!canEdit} onClick={()=>setEditing(l)} title={canEdit?"Edit this line":undefined}>
        <div className="pp-sched-top"><b>{l.boqItem} · {l.description}</b><i className="pp-st">{l.category}</i></div>
        <div className="pp-sched-meta">BOQ {qty(l.boqQty)} {l.unit} × {amt(l.boqRate,c)} = {amt(l.boqValue,c)}</div>
        <div className="pp-sched-meta">Required {qty(l.requiredQty)} {l.unit} by {day(l.requiredDate)}
          {l.purchasedQty!==null&&<> · purchased {qty(l.purchasedQty)} · balance {qty(l.balanceQty)}</>}</div>
        {(l.estimatedCost!==null||l.actualCost!==null)&&<div className="pp-sched-meta">Estimated {amt(l.estimatedCost,c)} · actual {amt(l.actualCost,c)}
          {l.variance!==null&&<> · variance <span className={l.variance<0?"pp-neg":"pp-pos"}>{amt(l.variance,c)}</span></>}</div>}
        <div className="pp-sched-meta">Approved by {l.approvedByName}</div>
      </button></li>)}</ul>}
    {editing&&<BomForm plan={plan} line={editing} close={()=>setEditing(null)}
      saved={m=>{setEditing(null);setVersion(v=>v+1);flash(m)}}/>}
  </section>}

/* One line of the detailed BOM, in the order of its field specification. The BOQ value,
   balance quantity and variance are worked out as the figures are typed; the server
   works them out again when it saves. */
function BomForm({plan,line,close,saved}:{plan:Plan;line:Partial<BomLine>;close:()=>void;saved:(m:string)=>void}){
  const n=(v:number|null|undefined)=>v===null||v===undefined?"":String(v);
  const[f,setF]=useState<Record<string,string>>({boqItem:line.boqItem||"",category:line.category||"",
    description:line.description||"",specification:line.specification||"",unit:line.unit||"",
    boqQty:n(line.boqQty),boqRate:n(line.boqRate),requiredQty:n(line.requiredQty),purchasedQty:n(line.purchasedQty),
    estimatedCost:n(line.estimatedCost),actualCost:n(line.actualCost),requiredDate:line.requiredDate||"",
    approvedByEmail:line.approvedByEmail||"",remarks:line.remarks||""});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const people=useAsync(()=>planningApi.people(),[]);
  const categories=useOptions("planning.materialCategory",MATERIAL_CATEGORIES);
  const units=useOptions("planning.unit",BOM_UNITS);
  const c=plan.currency||"AED";
  const opt=(v:string)=>v.trim()===""?null:Number(v)||0;
  const calc=bomFigures({boqQty:Number(f.boqQty)||0,boqRate:Number(f.boqRate)||0,requiredQty:Number(f.requiredQty)||0,
    purchasedQty:opt(f.purchasedQty),estimatedCost:opt(f.estimatedCost),actualCost:opt(f.actualCost)});
  const go=async(fn:()=>Promise<unknown>,msg:string)=>{
    setBusy(true);setErr("");
    try{await fn();saved(msg)}
    catch(x){setErr(x instanceof Error?x.message:"Could not save the BOM line");setBusy(false)}};
  const submit=(e:React.FormEvent)=>{e.preventDefault();
    go(()=>bomApi.save({...f,id:line.id,planId:plan.id}),`${f.boqItem}: ${line.id?"updated":"added to the BOM"}`)};
  const del=()=>{if(line.id&&confirm(`Remove "${line.boqItem}" from the BOM?`))
    go(()=>bomApi.remove(line.id!),`${line.boqItem}: removed from the BOM`)};
  const pick=(k:string,label:string,list:readonly string[])=><label>{lbl(label,true)}
    <select required value={f[k]} onChange={e=>set(k,e.target.value)}><option value="">Select {label.toLowerCase()}</option>
      {[...new Set([...list,f[k]].filter(Boolean))].map(o=><option key={o}>{o}</option>)}</select></label>;
  const num=(k:string,label:string,required=false,step="0.01")=><label>{lbl(label,required)}
    <input type="number" required={required} min="0" step={step} value={f[k]} onChange={e=>set(k,e.target.value)}/></label>;

  return <div className="recv-drawer wide recv-over" role="dialog" aria-label="BOM line">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>DETAILED BOM · {plan.ref}</small><h3>{line.id?line.boqItem:"New BOM line"}</h3>
        <p className="recv-form-sub">Figures in {c}. The BOQ value, balance quantity and variance are worked out.</p></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        <div className="recv-two">
          <label>{lbl("Job code",true)}<input readOnly className="recv-auto" value={plan.jobCode||plan.jobRef}
            title="The common key linking all of this project's transactions"/></label>
          <label>{lbl("Project",true)}<input readOnly className="recv-auto" value={plan.projectName||plan.description||plan.customer}/></label></div>
        <div className="recv-two">
          <label>{lbl("BOQ item",true)}<input required autoFocus value={f.boqItem} onChange={e=>set("boqItem",e.target.value)}
            placeholder="e.g. 3.2.1"/></label>
          {pick("category","Material category",categories)}</div>
        <label>{lbl("Material description",true)}<input required value={f.description} onChange={e=>set("description",e.target.value)}/></label>
        <label>{lbl("Specification")}<textarea rows={3} value={f.specification} onChange={e=>set("specification",e.target.value)}
          placeholder="Make, grade, finish, size"/></label>
        <div className="recv-two">{pick("unit","Unit",units)}{num("boqQty","BOQ quantity",true,"any")}</div>
        <div className="recv-two">{num("boqRate","BOQ rate",true)}
          <label>{lbl("BOQ value",true)}<input readOnly className="recv-auto" value={amt(calc.boqValue,c)}
            title="BOQ quantity × BOQ rate"/></label></div>
        <div className="recv-two">{num("requiredQty","Required quantity",true,"any")}{num("purchasedQty","Purchased quantity",false,"any")}</div>
        <div className="recv-two">
          <label>{lbl("Balance quantity")}<input readOnly className="recv-auto"
            value={calc.balanceQty===null?"Worked out once a purchased quantity is entered":`${qty(calc.balanceQty)} ${f.unit}`}
            title="Required quantity − purchased quantity"/></label>
          {num("estimatedCost","Estimated cost")}</div>
        <div className="recv-two">{num("actualCost","Actual cost")}
          <label>{lbl("Variance")}<input readOnly className={`recv-auto${calc.variance!==null&&calc.variance<0?" pp-neg":""}`}
            value={calc.variance===null?"Worked out from estimated and actual cost":amt(calc.variance,c)}
            title="Estimated cost − actual cost; negative is an overrun"/></label></div>
        <div className="recv-two">
          <label>{lbl("Required date",true)}<input type="date" required value={f.requiredDate} onChange={e=>set("requiredDate",e.target.value)}/></label>
          <label>{lbl("Approved by",true)}<select required value={f.approvedByEmail} onChange={e=>set("approvedByEmail",e.target.value)}>
            <option value="">{people.loading?"Loading people…":"Select a person"}</option>
            {(people.data||[]).map(p=><option key={p.email} value={p.email}>{p.name?`${p.name} · ${p.email}`:p.email}</option>)}</select></label></div>
        <label>{lbl("Remarks")}<textarea rows={3} value={f.remarks} onChange={e=>set("remarks",e.target.value)}/></label>
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?"Saving…":line.id?"Save BOM line":"Add BOM line"}</button>
        {line.id&&<button type="button" className="ghost danger" disabled={busy} onClick={del}><Trash2/>Remove BOM line</button>}
      </form>
    </aside></div>}

const APPROVAL_CLASS:Record<string,string>={Pending:"hold",Approved:"done",Rejected:"late"};

/* Procurement planning: what is bought for each BOM material, from whom and at what
   rate, with the management approval (maker-checker), the PO and delivery. */
function Procurement({plan,userEmail,flash}:{plan:Plan;userEmail:string;flash:(m:string)=>void}){
  const[version,setVersion]=useState(0),[editing,setEditing]=useState<Partial<Purchase>|null>(null);
  const{data,loading,error}=useAsync(()=>procurementApi.load(plan.id),[plan.id,plan.stage,version]);
  const bom=useAsync(()=>bomApi.load(plan.id),[plan.id,version]);
  const lines=data?.lines||[],canEdit=!!data?.canEdit,c=plan.currency||"AED";
  const materials=bom.data?.lines||[];
  const waiting=lines.filter(l=>l.approval==="Pending").length;
  return <section className="pp-sched">
    <header><b><ShoppingCart/>Procurement planning</b>
      {!!lines.length&&<span>{lines.length} {lines.length===1?"purchase":"purchases"}{waiting?` · ${waiting} awaiting approval`:""}</span>}
      {canEdit&&!!materials.length&&<button className="ghost" onClick={()=>setEditing({})}><Plus/>Add purchase</button>}</header>
    {error?<p className="recv-error">{error}</p>
    :loading&&!data?<p className="recv-hint">Loading procurement…</p>
    :!lines.length?<p className="recv-hint">No purchase planned yet.{canEdit?materials.length?" Add the first one."
      :" Add the materials to the detailed BOM first.":""}</p>
    :<ul>{lines.map(l=><li key={l.id}><button onClick={()=>setEditing(l)} title="Open this purchase">
        <div className="pp-sched-top"><b>{l.prNo} · {l.material}</b>
          <i className={`pp-st ${APPROVAL_CLASS[l.approval]||""}`}>{l.approval==="Pending"?"Awaiting approval":l.approval}</i></div>
        <div className="pp-sched-meta">{qty(l.balanceRequired)} {l.unit} to buy by {day(l.requiredDate)} · {l.selectedVendor} @ {amt(l.selectedRate,c)}</div>
        <div className="pp-sched-meta">{l.status}{l.poNo&&<> · {l.poNo} of {day(l.poDate)}</>}
          {l.expectedDelivery&&!l.actualDelivery&&<> · expected {day(l.expectedDelivery)}</>}
          {l.actualDelivery&&<> · delivered {day(l.actualDelivery)}</>}</div>
      </button></li>)}</ul>}
    {editing&&<PurchaseForm plan={plan} line={editing} materials={materials} canEdit={canEdit}
      canApprove={!!data?.canApprove} userEmail={userEmail} close={()=>setEditing(null)}
      saved={m=>{setEditing(null);setVersion(v=>v+1);flash(m)}}/>}
  </section>}

/* A vendor, typed or picked from the vendor register and the vendors already quoted. */
function VendorInput({value,onChange,extra=[],required=false,disabled=false}:{value:string;onChange:(v:string)=>void;
  extra?:string[];required?:boolean;disabled?:boolean}){
  const[hints,setHints]=useState<string[]>([]);
  const[id]=useState(()=>`vendors-${Math.random().toString(36).slice(2,8)}`);
  useEffect(()=>{const q=value.trim();let live=true;
    const t=setTimeout(()=>{fetch(`/api/vendors?q=${encodeURIComponent(q)}&limit=12`)
      .then(r=>r.json() as Promise<{vendors?:{name:string}[]}>)
      .then(d=>{if(live)setHints((d.vendors||[]).map(x=>x.name))}).catch(()=>{})},200);
    return()=>{live=false;clearTimeout(t)}},[value]);
  return <><input list={id} required={required} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}
    placeholder="Select or type a vendor" autoComplete="off"/>
    <datalist id={id}>{[...new Set([...extra.filter(Boolean),...hints])].map(v=><option key={v} value={v}/>)}</datalist></>}

/* One purchase, in the order of its field specification. The maker fills it in; a
   different person in management then approves or rejects it. */
function PurchaseForm({plan,line,materials,canEdit,canApprove,userEmail,close,saved}:{plan:Plan;line:Partial<Purchase>;
  materials:BomLine[];canEdit:boolean;canApprove:boolean;userEmail:string;close:()=>void;saved:(m:string)=>void}){
  const n=(v:number|null|undefined)=>v===null||v===undefined?"":String(v);
  const[f,setF]=useState<Record<string,string>>(()=>{
    const v:Record<string,string>={bomId:line.bomId||"",requiredQty:n(line.requiredQty),availableStock:n(line.availableStock),
      requiredDate:line.requiredDate||"",selectedVendor:line.selectedVendor||"",selectedRate:n(line.selectedRate),
      poDate:line.poDate||"",expectedDelivery:line.expectedDelivery||"",actualDelivery:line.actualDelivery||"",
      status:line.status||"Requested",approval:line.approval||"Pending"};
    for(const q of[1,2,3]){const k=`q${q}` as "q1";
      v[`${k}Vendor`]=String(line[`${k}Vendor`]??"");v[`${k}Amount`]=n(line[`${k}Amount`]);
      v[`${k}FileId`]=String(line[`${k}FileId`]??"");v[`${k}FileName`]=String(line[`${k}FileName`]??"")}
    return v});
  const[busy,setBusy]=useState(false),[err,setErr]=useState(""),[uploading,setUploading]=useState(0);
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const c=plan.currency||"AED";
  /* The checker: approving roles, not whoever set these terms, while a decision is due. */
  const checker=!!line.id&&canApprove&&line.approval==="Pending"&&!same(line.makerEmail,userEmail);
  const locked=!canEdit||checker;
  const bom=materials.find(m=>m.id===f.bomId);
  const balance=Math.max(0,(Number(f.requiredQty)||0)-(Number(f.availableStock)||0));
  const quoted=[f.q1Vendor,f.q2Vendor,f.q3Vendor].filter(Boolean);
  /* Choosing the material fills in what the BOM line already says. */
  const pickMaterial=(id:string)=>{const m=materials.find(x=>x.id===id);
    setF(x=>({...x,bomId:id,requiredQty:x.requiredQty||(m?String(m.balanceQty??m.requiredQty):""),
      requiredDate:x.requiredDate||m?.requiredDate||""}))};
  const upload=async(q:number,file?:File)=>{
    if(!file)return;
    setUploading(u=>u+1);setErr("");
    try{const res=await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({entityType:"procurement",entityId:plan.id,kind:"Quotation",fileName:file.name,
          note:`Quotation ${q}${line.prNo?` · ${line.prNo}`:""}`,dataUrl:await asDataUrl(file)})});
      const d=await res.json() as {attachment?:{id:string;fileName:string};error?:string};
      if(!res.ok||!d.attachment)throw new Error(d.error||"The file did not upload");
      setF(x=>({...x,[`q${q}FileId`]:d.attachment!.id,[`q${q}FileName`]:d.attachment!.fileName}))}
    catch(x){setErr(`Quotation ${q}: ${x instanceof Error?x.message:"the file did not upload"}`)}
    finally{setUploading(u=>u-1)}};
  const go=async(fn:()=>Promise<unknown>,msg:string)=>{
    setBusy(true);setErr("");
    try{await fn();saved(msg)}
    catch(x){setErr(x instanceof Error?x.message:"Could not save the purchase");setBusy(false)}};
  const submit=(e:React.FormEvent)=>{e.preventDefault();
    if(checker){if(f.approval==="Pending"){setErr("Choose Approved or Rejected.");return}
      go(()=>procurementApi.decide(line.id!,f.approval),`${line.prNo}: ${f.approval.toLowerCase()}`);return}
    go(()=>procurementApi.save({...f,id:line.id,planId:plan.id}),line.id?`${line.prNo}: updated`:"Purchase planned - sent to management for approval")};
  const del=()=>{if(line.id&&confirm(`Remove ${line.prNo} (${line.material})?`))
    go(()=>procurementApi.remove(line.id!),`${line.prNo}: removed`)};
  const decided=line.approval&&line.approval!=="Pending"
    ?`${line.approval} by ${line.approvedByName}${line.approvedAt?` on ${day(line.approvedAt)}`:""}`:"Pending - awaiting management approval";

  return <div className="recv-drawer wide recv-over" role="dialog" aria-label="Purchase">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>PROCUREMENT PLANNING · {plan.ref}</small><h3>{line.id?`${line.prNo} · ${line.material}`:"New purchase"}</h3>
        <p className="recv-form-sub">{checker?"Review the terms below and approve or reject them. You cannot change them here."
          :`Figures in ${c}. Management approves each purchase; changing its terms later needs a fresh approval.`}</p></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        <fieldset className="pp-fields" disabled={locked}>
        <div className="recv-two">
          <label>{lbl("Job code",true)}<input readOnly className="recv-auto" value={plan.jobCode||plan.jobRef}
            title="The common key linking all of this project's transactions"/></label>
          <label>{lbl("Project",true)}<input readOnly className="recv-auto" value={plan.projectName||plan.description||plan.customer}/></label></div>
        <div className="recv-two">
          <label>{lbl("Material",true)}<select required value={f.bomId} onChange={e=>pickMaterial(e.target.value)}>
            <option value="">Select a BOM material</option>
            {materials.map(m=><option key={m.id} value={m.id}>{m.boqItem} · {m.description} ({m.unit})</option>)}</select></label>
          <label>{lbl("Purchase request no.")}<input readOnly className="recv-auto" value={line.prNo||"Issued on save"}/></label></div>
        <div className="recv-two">
          <label>{lbl("Required quantity",true)}<input type="number" required min="0" step="any" value={f.requiredQty}
            onChange={e=>set("requiredQty",e.target.value)}/></label>
          <label>{lbl("Available stock")}<input type="number" min="0" step="any" value={f.availableStock}
            onChange={e=>set("availableStock",e.target.value)}/></label></div>
        <div className="recv-two">
          <label>{lbl("Balance required")}<input readOnly className="recv-auto" value={`${qty(balance)} ${bom?.unit||line.unit||""}`}
            title="Required quantity − available stock"/></label>
          <label>{lbl("Required date",true)}<input type="date" required value={f.requiredDate} onChange={e=>set("requiredDate",e.target.value)}/></label></div>
        <div className="pp-quotes">
          <div className="pp-quote-head"><span>Quotations</span><span>Vendor</span><span>Amount</span><span>File</span></div>
          {[1,2,3].map(q=><div className="pp-quote" key={q}><b>Quotation {q}</b>
            <VendorInput value={f[`q${q}Vendor`]} onChange={v=>set(`q${q}Vendor`,v)} disabled={locked}/>
            <input type="number" min="0" step="0.01" value={f[`q${q}Amount`]} onChange={e=>set(`q${q}Amount`,e.target.value)} placeholder={c}/>
            <span className="pp-file">{f[`q${q}FileId`]
              ?<><a href={`/api/attachments?id=${encodeURIComponent(f[`q${q}FileId`])}`} target="_blank" rel="noreferrer">{f[`q${q}FileName`]||"View file"}</a>
                {!locked&&<button type="button" aria-label={`Remove quotation ${q} file`} onClick={()=>{set(`q${q}FileId`,"");set(`q${q}FileName`,"")}}><X/></button>}</>
              :locked?<span className="pp-none">No file</span>
              :<label className="pp-pick">Choose file<input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={e=>{upload(q,e.target.files?.[0]);e.target.value=""}}/></label>}</span>
          </div>)}</div>
        <div className="recv-two">
          <label>{lbl("Selected vendor",true)}<VendorInput required value={f.selectedVendor} onChange={v=>set("selectedVendor",v)} extra={quoted} disabled={locked}/></label>
          <label>{lbl("Selected rate",true)}<input type="number" required min="0" step="0.01" value={f.selectedRate}
            onChange={e=>set("selectedRate",e.target.value)} placeholder={`${c} per ${bom?.unit||"unit"}`}/></label></div>
        <div className="recv-two">
          <label>{lbl("PO number")}<input readOnly className="recv-auto" value={line.poNo||"Issued on approval"}/></label>
          <label>{lbl("PO date")}<input type="date" value={f.poDate} onChange={e=>set("poDate",e.target.value)}/></label></div>
        </fieldset>
        <div className="recv-two">
          <label>{lbl("Approval",true)}{checker
            ?<select required value={f.approval} onChange={e=>set("approval",e.target.value)}
              title="Management authorisation - maker-checker control">
              <option value="Pending">Select approval</option><option>Approved</option><option>Rejected</option></select>
            :<input readOnly className="recv-auto" value={decided} title="Management authorisation - maker-checker control"/>}</label>
          <fieldset className="pp-fields" disabled={locked}>
          <label>{lbl("Status",true)}<select required value={f.status} onChange={e=>set("status",e.target.value)}
            title="For monitoring progress and ageing">
            {PROCUREMENT_STATUSES.map(s=><option key={s} disabled={NEEDS_APPROVAL.includes(s)&&line.approval!=="Approved"}>{s}</option>)}</select></label>
          </fieldset></div>
        <fieldset className="pp-fields" disabled={locked}>
        <div className="recv-two">
          <label>{lbl("Expected delivery")}<input type="date" value={f.expectedDelivery} onChange={e=>set("expectedDelivery",e.target.value)}/></label>
          <label>{lbl("Actual delivery")}<input type="date" value={f.actualDelivery} onChange={e=>set("actualDelivery",e.target.value)}/></label></div>
        </fieldset>
        {!!line.id&&canApprove&&line.approval==="Pending"&&same(line.makerEmail,userEmail)&&
          <p className="recv-hint">You set these terms, so someone else in management must approve them.</p>}
        {err&&<p className="recv-error">{err}</p>}
        {(checker||canEdit)&&<button className="primary" type="submit" disabled={busy||uploading>0}>
          {busy?"Saving…":uploading?"Uploading…":checker?"Record decision":line.id?"Save purchase":"Plan purchase"}</button>}
        {!!line.id&&canEdit&&!checker&&line.approval!=="Approved"&&<button type="button" className="ghost danger" disabled={busy} onClick={del}><Trash2/>Remove purchase</button>}
      </form>
    </aside></div>}
