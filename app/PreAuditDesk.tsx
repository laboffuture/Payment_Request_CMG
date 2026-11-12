"use client";
/* Pre-audit tasks.

   The Audit Head adds the tasks; they go into an open pool. An auditor sees the open
   pool, takes the task they will do, and from then on nobody else sees it. When it is
   done they file a short report: the task's title, project, category and department are
   filled in and locked, the auditor is whoever took it and the date is today. They write
   what was done and the observations found; the observations go to the observation
   register as well.

   The Audit Head sees every completed task, searches and filters them by auditor,
   project and date, and writes remarks on them. */

import{useEffect,useMemo,useState}from"react";
import{CheckCircle2,Download,Plus,Search,Trash2,X}from"lucide-react";
import{auditTasksApi}from"./audit-api";
import type{AuditRow}from"./audit-api";
import{csv,useAsync}from"./workforce-store";
import{Pager}from"./WorkforceShared";
import{PreAuditTaskForm}from"./PreAuditForms";

const HEAD_ROLES=["Audit Head","Administrator"];
const LIMIT=25;
const req=<i className="pa-req" aria-hidden="true">*</i>;
const opt=<i className="field-optional">optional</i>;
/* Today in India, as the server dates a completed task. */
const indiaToday=()=>new Date(Date.now()+330*60_000).toISOString().slice(0,10);
const uniq=(xs:string[])=>[...new Set(xs.map(x=>(x||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const day=(d:string)=>d?new Date(`${d.slice(0,10)}T00:00:00`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";
const when=(iso:string)=>iso?new Date(iso).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
type Remark={by:string;at:string;text:string};
const remarksOf=(v?:string):Remark[]=>{try{const r=JSON.parse(v||"[]");return Array.isArray(r)?r:[]}catch{return[]}};
const OPEN=(t:AuditRow)=>t.status==="Available";
const DONE=(t:AuditRow)=>t.status==="Completed";
const WORKING=(t:AuditRow)=>!OPEN(t)&&!DONE(t);

type Tab="open"|"mine"|"done"|"working";

export default function PreAuditDesk({role,departments,flash,changed}:{role:string;departments:string[];
  flash:(m:string)=>void;changed?:()=>void}){
  const head=HEAD_ROLES.includes(role);
  const[tab,setTab]=useState<Tab>(head?"done":"open");
  const[version,setVersion]=useState(0);
  const reload=()=>{setVersion(v=>v+1);changed?.()};
  /* The open pool and the work under way. The server leaves out what other auditors hold. */
  const live=useAsync(()=>auditTasksApi.load({kind:"Pre-Audit",limit:200}),[version]);
  const all=useMemo(()=>(live.data?.tasks||[]).filter(t=>!DONE(t)),[live.data]);
  const open=all.filter(OPEN),working=all.filter(WORKING);

  /* Completed tasks are searched on the server, a page at a time, since they only grow. */
  const[raw,setRaw]=useState(""),[q,setQ]=useState("");
  const[auditor,setAuditor]=useState(""),[project,setProject]=useState("");
  const[from,setFrom]=useState(""),[to,setTo]=useState(""),[offset,setOffset]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>{setQ(raw);setOffset(0)},300);return()=>clearTimeout(t)},[raw]);
  const done=useAsync(()=>auditTasksApi.load({kind:"Pre-Audit",status:"Completed",q,assignedTo:auditor,entity:project,
    from,to,limit:LIMIT,offset}),[q,auditor,project,from,to,offset,version]);
  const doneRows=done.data?.tasks||[],doneTotal=done.data?.total||0;

  /* The filter choices: every auditor and every project the catalogue knows. */
  const catalogue=useAsync(()=>fetch("/api/task-catalogue").then(r=>r.json()) as Promise<{tasks:{entity:string}[];auditors:{name:string}[]}>,[]);
  const auditors=uniq([...(catalogue.data?.auditors||[]).map(a=>a.name),...doneRows.map(t=>t.assignedTo),auditor]);
  const projects=uniq([...(catalogue.data?.tasks||[]).map(t=>t.entity),...all.map(t=>t.entity||""),...doneRows.map(t=>t.entity||""),project]);

  const[adding,setAdding]=useState(false),[completing,setCompleting]=useState<AuditRow|null>(null),
    [viewing,setViewing]=useState<AuditRow|null>(null),[busy,setBusy]=useState(""),[reporting,setReporting]=useState(false);

  const act=async(t:AuditRow,action:"take"|"release",msg:string)=>{
    setBusy(t.id);
    try{await auditTasksApi.update({id:t.id,action});flash(msg)}
    catch(e){flash(e instanceof Error?e.message:"That did not work")}
    finally{setBusy("");reload()}};
  const remove=async(t:AuditRow)=>{
    if(!confirm(`Delete ${t.ref} (${t.title})? Observations raised on it stay in the register.`))return;
    try{await auditTasksApi.remove(t.id);flash(`${t.ref} deleted`);reload()}
    catch(e){flash(e instanceof Error?e.message:"Could not delete it")}};
  const create=async(t:Partial<AuditRow>)=>{
    await auditTasksApi.create({...t,kind:"Pre-Audit"});flash("Task added to the open pool");reload()};

  /* The report covers what the completed list shows - the filters decide - up to 1,000 tasks. */
  const report=async()=>{setReporting(true);
    try{
      const rows:AuditRow[]=[];
      for(let off=0;off<1000;off+=200){
        const d=await auditTasksApi.load({kind:"Pre-Audit",status:"Completed",q,assignedTo:auditor,entity:project,from,to,limit:200,offset:off});
        rows.push(...d.tasks);if(off+200>=d.total)break}
      csv([["Task no.","Task title","Project","Category","Department","Task done by","Task started on","Task completed on",
        "Description","Observations","Remarks"],
        ...rows.map(t=>[t.ref,t.title,t.entity||"",t.category||"",t.department,t.assignedTo,when(t.acceptedAt),t.completedOn||"",
          t.workDescription||"",t.observations||"",remarksOf(t.remarks).map(r=>`${r.text} (${r.by}, ${when(r.at)})`).join(" | ")])],
        `pre-audit-completed-${indiaToday()}.csv`);
      flash(`Report downloaded: ${rows.length} task${rows.length===1?"":"s"}`)}
    catch(e){flash(e instanceof Error?e.message:"Could not build the report")}
    finally{setReporting(false)}};

  const tabs:[Tab,string,number|null][]=head
    ?[["done","Completed",doneTotal],["working","In progress",working.length],["open","Open tasks",open.length]]
    :[["open","Open tasks",open.length],["mine","My tasks",working.length],["done","My completed",doneTotal]];
  const pool=tab==="open"?open:working;

  return <div className="page audit-list-page">
    <div className="intro"><div><small>AUDIT DEPARTMENT</small><h2>Pre-audit tasks</h2>
      <p>{head?"Add tasks to the open pool, and review what the auditors completed."
        :"Take a task from the open pool. Once you take it, it is yours and leaves the pool for everyone else."}</p></div>
      <div className="audit-list-actions">
        {tab==="done"&&head&&<button disabled={reporting||!doneTotal} onClick={report}><Download/>{reporting?"Preparing…":"Download report"}</button>}
        {head&&<button className="primary" onClick={()=>setAdding(true)}><Plus/>New pre-audit task</button>}
      </div></div>

    <section className="panel audit-list">
      <div className="audit-list-tabs">{tabs.map(([k,l,n])=>
        <button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}{n!==null&&<i>{n}</i>}</button>)}</div>

      {tab==="done"?<>
        <div className="audit-list-tools pa-filters">
          <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Search task, project or auditor"/></label>
          {head&&<select value={auditor} onChange={e=>{setAuditor(e.target.value);setOffset(0)}} aria-label="Auditor">
            <option value="">All auditors</option>{auditors.map(a=><option key={a}>{a}</option>)}</select>}
          <select value={project} onChange={e=>{setProject(e.target.value);setOffset(0)}} aria-label="Project">
            <option value="">All projects</option>{projects.map(p=><option key={p}>{p}</option>)}</select>
          <label className="pa-date">From<input type="date" value={from} max={to||undefined} onChange={e=>{setFrom(e.target.value);setOffset(0)}}/></label>
          <label className="pa-date">To<input type="date" value={to} min={from||undefined} onChange={e=>{setTo(e.target.value);setOffset(0)}}/></label>
          <button type="button" className={from===indiaToday()&&to===indiaToday()?"pa-chip on":"pa-chip"}
            onClick={()=>{const d=indiaToday();setFrom(d);setTo(d);setOffset(0)}}>Today</button>
          {(auditor||project||from||to||raw)&&<button type="button" className="pa-chip" onClick={()=>{setAuditor("");setProject("");setFrom("");setTo("");setRaw("");setOffset(0)}}>Clear</button>}
        </div>
        <div className="table-wrap"><table><thead><tr><th>TASK</th><th>PROJECT</th><th>TASK DONE BY</th><th>STARTED ON</th>
          <th>COMPLETED ON</th><th>OBSERVATIONS</th><th>REMARKS</th></tr></thead>
          <tbody>{doneRows.map(t=>{const r=remarksOf(t.remarks);return <tr key={t.id} onClick={()=>setViewing(t)} className="pa-row">
            <td><b>{t.ref}</b><small>{t.title}</small></td>
            <td>{t.entity||"—"}<small>{[t.category,t.department].filter(Boolean).join(" · ")}</small></td>
            <td>{t.assignedTo||"—"}</td>
            <td>{when(t.acceptedAt)}</td>
            <td><b>{day(t.completedOn||t.completedAt)}</b></td>
            <td>{t.observations?<span className="pa-clip">{t.observations}</span>:<small>None</small>}</td>
            <td><button className="wb-next" onClick={e=>{e.stopPropagation();setViewing(t)}}>
              {head?(r.length?`Remarks (${r.length})`:"Add remark"):r.length?`Remarks (${r.length})`:"View"}</button>
              {head&&<div className="pa-head"><button className="pa-del" onClick={e=>{e.stopPropagation();remove(t)}}><Trash2/>Delete</button></div>}</td>
          </tr>})}</tbody></table>
          {done.error?<div className="wb-empty"><b>Could not load the completed tasks</b><span>{done.error}</span></div>
          :!doneRows.length&&!done.loading&&<div className="wb-empty"><CheckCircle2/><b>No completed tasks</b>
            <span>{auditor||project||from||to||q?"Nothing matches these filters.":"Completed pre-audit tasks appear here."}</span></div>}</div>
        <Pager total={doneTotal} limit={LIMIT} offset={offset} setOffset={setOffset}/>
      </>
      :<div className="table-wrap"><table><thead><tr><th>TASK</th><th>PROJECT</th><th>DEPARTMENT</th><th>DUE</th>
        {tab!=="open"&&<><th>TAKEN BY</th><th>STARTED ON</th></>}<th>ACTION</th></tr></thead>
        <tbody>{pool.map(t=><tr key={t.id}>
          <td><b>{t.ref}</b><small>{t.title}</small>{t.notes&&<small className="pa-clip">{t.notes}</small>}</td>
          <td>{t.entity||"—"}<small>{t.category||""}</small></td>
          <td>{t.department||"—"}</td>
          <td><b>{t.due?day(t.due):"Not set"}</b><small>{t.dueRule||""}{t.frequency&&t.frequency!=="One time"?` · ${t.frequency}`:""}</small></td>
          {tab!=="open"&&<><td>{t.assignedTo||"—"}</td><td>{when(t.acceptedAt)}</td></>}
          <td>{tab==="open"
            ?(head?<span className="wb-next wb-readonly">Waiting for an auditor</span>
              :<button className="wb-next" disabled={busy===t.id} onClick={()=>act(t,"take",`${t.ref} is yours - find it under My tasks`)}>
                {busy===t.id?"Taking…":"Take this task"}</button>)
            :<div className="wb-next-pair">
              {!head&&<button className="wb-next" onClick={()=>setCompleting(t)}>Complete task</button>}
              <button className="wb-next" disabled={busy===t.id} onClick={()=>{
                if(confirm(head?`Put ${t.ref} back in the open pool? ${t.assignedTo} will no longer hold it.`:`Give ${t.ref} back to the open pool?`))
                  act(t,"release",`${t.ref} is back in the open pool`)}}>{head?"Back to pool":"Give back"}</button></div>}
            {head&&<div className="pa-head"><button className="pa-del" onClick={()=>remove(t)}><Trash2/>Delete</button></div>}</td>
        </tr>)}</tbody></table>
        {live.error?<div className="wb-empty"><b>Could not load the tasks</b><span>{live.error}</span></div>
        :!pool.length&&!live.loading&&<div className="wb-empty"><CheckCircle2/>
          <b>{tab==="open"?"No open tasks":head?"Nothing in progress":"You have no tasks in hand"}</b>
          <span>{tab==="open"?(head?"Add a task and it appears here for the auditors.":"New tasks appear here when the Audit Head adds them.")
            :head?"Tasks the auditors take appear here.":"Take one from Open tasks."}</span></div>}</div>}
    </section>

    {adding&&<PreAuditTaskForm departments={departments} close={()=>setAdding(false)} create={t=>create(t)}/>}
    {completing&&<CompleteForm task={completing} close={()=>setCompleting(null)}
      saved={m=>{setCompleting(null);flash(m);reload()}}/>}
    {viewing&&<TaskReport task={viewing} head={head} close={()=>setViewing(null)}
      saved={(t,m)=>{setViewing(t);flash(m);reload()}}/>}
  </div>}

/* The auditor's completion report. Only the description and the observations are theirs
   to write; the rest is the task's, and the server takes it from the task, not from here. */
function CompleteForm({task,close,saved}:{task:AuditRow;close:()=>void;saved:(m:string)=>void}){
  const[description,setDescription]=useState(""),[found,setFound]=useState("");
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(!description.trim())return;setBusy(true);setErr("");
    try{await auditTasksApi.update({id:task.id,action:"complete",workDescription:description.trim(),observations:found.trim()} as never);
      saved(`${task.ref} completed${found.trim()?" - observations sent to the observation register":""}`)}
    catch(x){setErr(x instanceof Error?x.message:"Could not complete the task");setBusy(false)}};
  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>COMPLETE TASK · {task.ref}</small><h2>{task.title}</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <Locked label="Project" value={task.entity||"—"}/>
        <Locked label="Category" value={task.category||"—"}/>
        <Locked label="Department" value={task.department||"—"}/>
        <Locked label="Task done by" value={task.assignedTo||"—"}/>
        <Locked wide label="Task title" value={task.title}/>
        <Locked label="Task started on" value={when(task.acceptedAt)}/>
        <Locked label="Task completed on" value={day(indiaToday())}/>
        <label className="wide">Description {req}
          <textarea required autoFocus value={description} onChange={e=>setDescription(e.target.value)}
            placeholder="What was checked, against what evidence, and the result"/></label>
        <label className="wide">Observations {opt}
          <textarea value={found} onChange={e=>setFound(e.target.value)}
            placeholder="What was found that needs attention. Leave empty if nothing was found."/></label>
        <p className="wide pa-note">The observations are also added to the observation register against this task.
          Once completed, the task cannot be changed.</p>
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy||!description.trim()}><CheckCircle2/>{busy?"Saving…":"Complete task"}</button></footer>
    </form></>}

function Locked({label,value,wide}:{label:string;value:string;wide?:boolean}){
  return <label className={wide?"wide":undefined}>{label}<input readOnly tabIndex={-1} className="pa-locked" value={value}/></label>}

/* A completed task as filed, with the Audit Head's remarks - and, for the Audit Head, a box
   to add one. Remarks are added to, never edited. */
function TaskReport({task,head,close,saved}:{task:AuditRow;head:boolean;close:()=>void;saved:(t:AuditRow,m:string)=>void}){
  const[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const list=remarksOf(task.remarks);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(!text.trim())return;setBusy(true);setErr("");
    try{const t=await auditTasksApi.update({id:task.id,action:"remark",remark:text.trim()} as never);
      setText("");setBusy(false);saved(t,`Remark added to ${task.ref}`)}
    catch(x){setErr(x instanceof Error?x.message:"Could not save the remark");setBusy(false)}};
  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>COMPLETED TASK · {task.ref}</small><h2>{task.title}</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <Locked label="Project" value={task.entity||"—"}/>
        <Locked label="Category" value={task.category||"—"}/>
        <Locked label="Department" value={task.department||"—"}/>
        <Locked label="Task done by" value={task.assignedTo||"—"}/>
        <Locked label="Task started on" value={when(task.acceptedAt)}/>
        <Locked label="Task completed on" value={day(task.completedOn||task.completedAt)}/>
        <div className="wide pa-text"><span>Description</span><p>{task.workDescription||"—"}</p></div>
        <div className="wide pa-text"><span>Observations</span><p>{task.observations||"None"}</p></div>
        <div className="wide"><span className="pa-label">Audit Head remarks</span>
          <div className="pa-remarks">{list.length?list.map((r,i)=><p key={i}><b>{r.text}</b><span>{r.by} · {when(r.at)}</span></p>)
            :<p className="pa-none">No remarks yet.</p>}</div></div>
        {head&&<label className="wide">New remark {req}
          <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Your remark on this task"/></label>}
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>{head?"Cancel":"Close"}</button>
        {head&&<button className="primary" disabled={busy||!text.trim()}><Plus/>{busy?"Saving…":"Add remark"}</button>}</footer>
    </form></>}

