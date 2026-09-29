"use client";
/* The pre-audit queue's two forms, from the business's templates.

   New pre-audit task follows the Daily Task Import template. Its dropdowns read the task
   catalogue: choose the entity, then the category, then the task, and the task's own
   description, assignee, frequency, due date rule and next due date are filled in from
   the catalogue - each still changeable, and a task not in the catalogue can be typed.

   Raise observation follows the Audit Observation template, against a pre-audit task.
   It is saved to the observation register, tagged to the responsible person, so it is
   answered and closed there like every other observation. */

import{useMemo,useState}from"react";
import{Plus,X}from"lucide-react";
import{auditTasksApi,catalogueApi}from"./audit-api";
import type{CatalogueTask}from"./audit-api";
import{ExtraFields,packExtra,useExtraFields}from"./ExtraFields";
import{useAsync,useWorkforce}from"./workforce-store";
import type{AuditTask}from"./page";

const uniq=(xs:string[])=>[...new Set(xs.map(x=>x.trim()).filter(Boolean))];
const req=<i className="pa-req" aria-hidden="true">*</i>;
const opt=<i className="field-optional">optional</i>;
const today=()=>new Date().toISOString().slice(0,10);

/* The template's statuses, and the queue status each starts a task in. */
const TASK_STATUS:Record<string,string>={"Not started":"Available","In progress":"In Progress","Completed":"Completed"};
/* The frequencies the queue repeats (lib/recurrence), and one time. A catalogue value
   outside these - "Daily / Weekly" - is offered too and kept, but does not repeat. */
const FREQUENCIES=["One time","Daily","Weekly","Monthly","Quarterly","Annual"];
const RISKS=["High","Medium","Low"];
const OBS_STATUS=["Open","Resolved"];

type NewTask={title:string;department:string;companyId:string;due:string;notes:string;kind?:string;frequency?:string;
  extra?:string;category:string;entity:string;dueRule:string;catalogueId:string;assignedTo:string;status:string};

export function PreAuditTaskForm({close,create,departments=[]}:{close:()=>void;create:(t:NewTask)=>Promise<void>|void;departments?:string[]}){
  const catalogue=useAsync(()=>catalogueApi.load(),[]);
  /* Audit by: the people with an auditing role only. */
  const people=useAsync(()=>catalogueApi.auditors(),[]);
  const xFields=useExtraFields("audittask");
  const[xVals,setXVals]=useState<Record<string,string>>({});
  const[f,setF]=useState({entity:"",category:"",department:"",title:"",description:"",assignedTo:"",frequency:"Monthly",
    dueRule:"",due:"",status:"Not started",catalogueId:""});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:keyof typeof f,v:string)=>setF(x=>({...x,[k]:v}));
  const rows:CatalogueTask[]=useMemo(()=>catalogue.data||[],[catalogue.data]);
  const entities=uniq(rows.map(r=>r.entity));
  const categories=uniq(rows.filter(r=>!f.entity||r.entity===f.entity).map(r=>r.category));
  const titles=uniq(rows.filter(r=>(!f.entity||r.entity===f.entity)&&(!f.category||r.category===f.category)).map(r=>r.title));
  const rules=uniq(rows.map(r=>r.dueRule));
  /* The auditor as the portal knows them: the login the catalogue matched, by name - or
     no one, if that person is not an auditor, so the choice is made rather than refused. */
  const personFor=(r:CatalogueTask)=>(people.data||[]).find(p=>p.email.toLowerCase()===r.assigneeEmail.toLowerCase())?.name||"";
  const assignees=uniq([...(people.data||[]).map(p=>p.name||p.email),f.assignedTo]);
  const frequencies=uniq([...FREQUENCIES,f.frequency]);

  /* Choosing a catalogue task fills in what the catalogue says about it. */
  const pickTitle=(title:string)=>{
    const r=rows.find(x=>x.title===title&&(!f.entity||x.entity===f.entity)&&(!f.category||x.category===f.category));
    setF(x=>r?{...x,title,entity:r.entity,category:r.category,description:r.description,assignedTo:personFor(r),
      frequency:r.frequency||"One time",dueRule:r.dueRule,due:r.nextDueDate||x.due,
      status:r.status&&TASK_STATUS[r.status]?r.status:x.status,catalogueId:r.id}
      :{...x,title,catalogueId:""})};

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{await create({title:f.title.trim(),department:f.department,companyId:"",due:f.due,notes:f.description.trim(),
      kind:"Pre-Audit",frequency:f.frequency,extra:packExtra(xFields,xVals),category:f.category,entity:f.entity,
      dueRule:f.dueRule.trim(),catalogueId:f.catalogueId,assignedTo:f.assignedTo,status:TASK_STATUS[f.status]||"Available"});
      close()}
    catch(x){setErr(x instanceof Error?x.message:"Could not create the task")}
    finally{setBusy(false)}};

  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>AUDIT DEPARTMENT</small><h2>New pre-audit task</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <label>Project / entity (vertical) {req}
          <select required value={f.entity} onChange={e=>setF(x=>({...x,entity:e.target.value,category:"",title:"",catalogueId:""}))}>
            <option value="">{catalogue.loading?"Loading…":"Select entity"}</option>
            {uniq([...entities,f.entity]).map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Category (area) {req}
          <select required value={f.category} onChange={e=>setF(x=>({...x,category:e.target.value,title:"",catalogueId:""}))}>
            <option value="">Select category</option>
            {uniq([...categories,f.category]).map(x=><option key={x}>{x}</option>)}</select></label>
        {/* The departments of the organisation register, as on the payment request form. */}
        <label className="wide">Department {req}
          <select required value={f.department} onChange={e=>set("department",e.target.value)}>
            <option value="">{departments.length?"Select department":"Loading departments…"}</option>
            {uniq([...departments,f.department]).map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Task title {req}
          <input required list="pre-audit-titles" value={f.title} onChange={e=>pickTitle(e.target.value)}
            placeholder={titles.length?"Choose a task, or type a new one":"Type the task"}/>
          <datalist id="pre-audit-titles">{titles.map(t=><option key={t} value={t}/>)}</datalist></label>
        <label className="wide">Description / instructions {opt}
          <textarea value={f.description} onChange={e=>set("description",e.target.value)}
            placeholder="What needs checking, and against what evidence"/></label>
        <label>Audit by {req}
          <select required value={f.assignedTo} onChange={e=>set("assignedTo",e.target.value)}>
            <option value="">{people.loading?"Loading auditors…":"Select an auditor"}</option>
            {assignees.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Frequency {opt}
          <select value={f.frequency} onChange={e=>set("frequency",e.target.value)}>
            {frequencies.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Due date rule {req}
          <input required list="pre-audit-rules" value={f.dueRule} onChange={e=>set("dueRule",e.target.value)}
            placeholder="e.g. By 10th of following month"/>
          <datalist id="pre-audit-rules">{rules.map(r=><option key={r} value={r}/>)}</datalist></label>
        <label>Next due date {req}
          <input type="date" required value={f.due} onChange={e=>set("due",e.target.value)}/></label>
        <label>Status {opt}
          <select value={f.status} onChange={e=>set("status",e.target.value)}>
            {Object.keys(TASK_STATUS).map(x=><option key={x}>{x}</option>)}</select></label>
        <ExtraFields form="audittask" values={xVals} onChange={setXVals}/>
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy}><Plus/>{busy?"Saving…":"Create"}</button></footer>
    </form></>}

/* The Audit Head assigns - or changes - the auditor of a task. */
export function AssignForm({task,close,saved}:{task:AuditTask;close:()=>void;saved:(msg:string)=>void}){
  const people=useAsync(()=>catalogueApi.auditors(),[]);
  const[who,setWho]=useState(task.assignedTo||""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{await auditTasksApi.update({id:task.id,action:"assign",assignedTo:who} as never);saved(`${task.ref||task.id} assigned to ${who}`)}
    catch(x){setErr(x instanceof Error?x.message:"Could not assign the auditor");setBusy(false)}};
  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>ASSIGN AUDITOR · {task.ref||task.id}</small><h2>{task.title}</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <label className="wide">Audit by {req}
          <select required autoFocus value={who} onChange={e=>setWho(e.target.value)}>
            <option value="">{people.loading?"Loading auditors…":"Select an auditor"}</option>
            {uniq([...(people.data||[]).map(p=>p.name),who]).map(x=><option key={x}>{x}</option>)}</select></label>
        <p className="wide pa-note">The auditor is emailed. {task.assignedTo?`Currently ${task.assignedTo}.`:"Nobody is assigned yet."}</p>
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy||!who||who===task.assignedTo}>{busy?"Saving…":"Assign"}</button></footer>
    </form></>}

/* The pre-audit report: every task shown, with its remarks and the observations raised
   on it, as rows for a spreadsheet. */
export async function preAuditReport(tasks:AuditTask[]){
  type Obs={ref:string;taskId:string;risk:string;status:string;title:string;target:string;responsibility:string};
  const obs:Obs[]=[];
  for(let offset=0;offset<5000;offset+=200){
    const res=await fetch(`/api/workforce/observations?limit=200&offset=${offset}`);
    const d=await res.json().catch(()=>({})) as {observations?:Obs[];total?:number};
    if(!res.ok)break;
    obs.push(...(d.observations||[]));
    if(offset+200>=(d.total||0))break}
  const remarks=(t:AuditTask)=>{try{const r=JSON.parse(t.remarks||"[]");return Array.isArray(r)?r as {by:string;at:string;text:string}[]:[]}catch{return[]}};
  const status=(s:string)=>s==="Available"?"Not started":s;
  return[["Task no.","Task title","Vertical / entity","Category (area)","Department","Audit by","Frequency","Due date rule",
    "Next due date","Status","Description / instructions","Remarks","Latest remark","Observations","High risk","Open observations","Observation details"],
    ...tasks.map(t=>{const mine=obs.filter(o=>o.taskId===t.id),r=remarks(t),last=r[r.length-1];
      return[t.ref||t.id,t.title,t.entity||t.company,t.category||"",t.department,t.assignedTo||"",t.frequency||"",t.dueRule||"",
        t.due||"",status(t.status),t.notes||"",r.length,last?`${last.text} (${last.by})`:"",mine.length,
        mine.filter(o=>o.risk==="High").length,mine.filter(o=>!["Resolved","Closed"].includes(o.status)).length,
        mine.map(o=>`${o.ref} [${o.risk}, ${o.status}] ${o.title} - ${o.responsibility||"—"} by ${o.target||"—"}`).join(" | ")]})]}

/* Remarks on a task: everything recorded so far, oldest first, and a box to add one.
   Remarks are added to, never edited, so the list is the task's running record. */
export function RemarksForm({task,close,saved}:{task:AuditTask;close:()=>void;saved:(msg:string)=>void}){
  const[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const list:{by:string;at:string;text:string}[]=useMemo(()=>{try{const r=JSON.parse(task.remarks||"[]");return Array.isArray(r)?r:[]}catch{return[]}},[task.remarks]);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(!text.trim())return;setBusy(true);setErr("");
    try{await auditTasksApi.update({id:task.id,action:"remark",remark:text.trim()} as never);saved(`Remark added to ${task.ref||task.id}`)}
    catch(x){setErr(x instanceof Error?x.message:"Could not save the remark");setBusy(false)}};
  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>REMARKS · {task.ref||task.id}</small><h2>{task.title}</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <div className="wide pa-remarks">{list.length?list.map((r,i)=><p key={i}><b>{r.text}</b>
            <span>{r.by} · {new Date(r.at).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span></p>)
          :<p className="pa-none">No remarks yet.</p>}</div>
        <label className="wide">New remark {req}
          <textarea required autoFocus value={text} onChange={e=>setText(e.target.value)}
            placeholder="What was checked, found, asked for or agreed"/></label>
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy||!text.trim()}><Plus/>{busy?"Saving…":"Add remark"}</button></footer>
    </form></>}

export function ObservationForm({task,userName,close,done}:{task:AuditTask;userName:string;close:()=>void;done:(msg:string)=>void}){
  const catalogue=useAsync(()=>catalogueApi.load(),[]);
  const people=useAsync(()=>catalogueApi.auditors(),[]);
  const wf=useWorkforce();
  const[term,setTerm]=useState(""),[who,setWho]=useState<{id:string;name:string}|null>(null);
  const{data:found}=useAsync(()=>wf.api.employees({q:term,limit:25,active:"1"}),[term],term.length>1);
  const[f,setF]=useState({entity:task.entity||"",area:task.category||"",auditor:userName,dateIdentified:today(),
    description:"",risk:"",rootCause:"",recommendation:"",target:"",status:"Open"});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:keyof typeof f,v:string)=>setF(x=>({...x,[k]:v}));
  const rows=catalogue.data||[];
  const entities=uniq([...rows.map(r=>r.entity),f.entity]);
  const areas=uniq([...rows.filter(r=>!f.entity||r.entity===f.entity).map(r=>r.category),f.area]);
  const auditors=uniq([...(people.data||[]).map(p=>p.name||p.email),f.auditor]);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!who){setErr("Choose the responsible person from the list.");return}
    setBusy(true);setErr("");
    try{
      const text=f.description.trim();
      const res=await fetch("/api/workforce/observations",{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({title:text.length>90?`${text.slice(0,87)}…`:text,detail:text,taskId:task.id,deptId:"d-group",
          risk:f.risk,area:f.area,entity:f.entity,raisedBy:f.auditor,dateIdentified:f.dateIdentified,
          rootCause:f.rootCause.trim(),recommendation:f.recommendation.trim(),responsibility:who.name,
          target:f.target,status:f.status,tags:[who.id]})});
      const b=await res.json().catch(()=>({})) as {error?:string;observation?:{ref:string}};
      if(!res.ok)throw new Error(b.error||"Could not save the observation");
      done(`${b.observation?.ref||"Observation"} raised on ${task.ref||task.id}`)}
    catch(x){setErr(x instanceof Error?x.message:"Could not save the observation");setBusy(false)}};

  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>AUDIT OBSERVATION · {task.ref||task.id}</small><h2>Raise observation</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <label>Observation ID {opt}<input readOnly value="Issued on save"/></label>
        <label>Vertical / entity {req}
          <select required value={f.entity} onChange={e=>set("entity",e.target.value)}>
            <option value="">Select entity</option>{entities.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Area {req}
          <select required value={f.area} onChange={e=>set("area",e.target.value)}>
            <option value="">Select area</option>{areas.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Auditor {req}
          <select required value={f.auditor} onChange={e=>set("auditor",e.target.value)}>
            <option value="">Select auditor</option>{auditors.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Date identified {req}
          <input type="date" required max={today()} value={f.dateIdentified} onChange={e=>set("dateIdentified",e.target.value)}/></label>
        <label>Risk rating {req}
          <select required value={f.risk} onChange={e=>set("risk",e.target.value)}>
            <option value="">Select risk</option>{RISKS.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Observation description {req}
          <textarea required value={f.description} onChange={e=>set("description",e.target.value)}
            placeholder="What was found, where, and what it affects"/></label>
        <label className="wide">Root cause {opt}
          <textarea value={f.rootCause} onChange={e=>set("rootCause",e.target.value)}/></label>
        <label className="wide">Recommendation {opt}
          <textarea value={f.recommendation} onChange={e=>set("recommendation",e.target.value)}/></label>
        <label className="wide">Responsible person {req}
          {who?<span className="wf-tags"><span className="wf-tag on">{who.name}
              <button type="button" onClick={()=>setWho(null)} aria-label="Change the responsible person">×</button></span></span>
            :<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Type a name to search, then pick from the list"/>}
          {!who&&!!(found?.employees||[]).length&&<div className="wf-picker">{(found?.employees||[]).map(p=>
            <button type="button" key={p.id} onClick={()=>{setWho({id:p.id,name:p.name});setTerm("")}}>
              <b>{p.name}</b><small>{p.designation||p.code}</small></button>)}</div>}</label>
        <label>Target closure date {req}
          <input type="date" required min={f.dateIdentified||undefined} value={f.target} onChange={e=>set("target",e.target.value)}/></label>
        <label>Status {opt}
          <select value={f.status} onChange={e=>set("status",e.target.value)}>
            {OBS_STATUS.map(x=><option key={x}>{x}</option>)}</select></label>
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy}><Plus/>{busy?"Saving…":"Raise observation"}</button></footer>
    </form></>}
