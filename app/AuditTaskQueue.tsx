"use client";
import{CalendarClock,CheckCircle2,Download,Import,Plus,Search,X}from"lucide-react";
import{useMemo,useState}from"react";import type{AuditTask}from"./page";
type Tab="Queue"|"Accepted & In Progress"|"Completed";
export default function AuditTaskQueue({title,kind,tasks,role,accept,update,openImport,create,companies=[],departments=[]}:{companies?:{id:string;name:string}[];departments?:string[];create?:(t:{title:string;department:string;companyId:string;due:string;notes:string})=>Promise<void>|void;title:string;kind:AuditTask["kind"];tasks:AuditTask[];role:string;accept:(id:string)=>void;update:(id:string,status:AuditTask["status"])=>void;openImport:(kind:string)=>void}){const[tab,setTab]=useState<Tab>("Queue"),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[form,setForm]=useState({title:"",department:"",companyId:"",due:"",notes:""}),[search,setSearch]=useState(""),[dept,setDept]=useState("All departments"),[entity,setEntity]=useState("All companies");const base=tasks.filter(t=>t.kind===kind),rows=useMemo(()=>base.filter(t=>(tab==="Queue"?t.status==="Available":tab==="Completed"?t.status==="Completed":!["Available","Completed"].includes(t.status))&&(dept==="All departments"||t.department===dept)&&(entity==="All companies"||t.company===entity)&&`${t.id} ${t.title} ${t.company} ${t.department}`.toLowerCase().includes(search.toLowerCase())),[base,tab,search,dept,entity]);return <div className="page audit-list-page"><div className="intro"><div><small>AUDIT DEPARTMENT</small><h2>{title}</h2><p>Queue, accepted work in progress, and completed tasks in one consistent list.</p></div><div className="audit-list-actions">
   {create&&role!=="Requestor"&&<button className="primary" onClick={()=>setOpen(true)}><Plus/>New ${kind==="Meeting"?"meeting":kind.toLowerCase()+" task"}</button>}
   {role==="Audit Head"&&<><a href="/audit-program-import-template.xlsx" download><Download/>Format</a><button className="primary" onClick={()=>openImport(kind)}><Import/>Import Excel</button></>}</div></div><section className="panel audit-list"><div className="audit-list-tabs">{(["Queue","Accepted & In Progress","Completed"] as Tab[]).map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}<i>{base.filter(t=>x==="Queue"?t.status==="Available":x==="Completed"?t.status==="Completed":!["Available","Completed"].includes(t.status)).length}</i></button>)}</div><div className="audit-list-tools"><label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search task, company or department"/></label><select value={dept} onChange={e=>setDept(e.target.value)}><option>All departments</option>{Array.from(new Set(base.map(t=>t.department))).map(x=><option key={x}>{x}</option>)}</select><select value={entity} onChange={e=>setEntity(e.target.value)}><option>All companies</option>{Array.from(new Set(base.map(t=>t.company))).map(x=><option key={x}>{x}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>PROGRAM / TASK</th><th>COMPANY / DEPT</th><th>AUDIT TYPE</th><th>PLANNED TIME</th><th>ASSIGNED TO</th><th>CURRENT STATUS</th><th>NEXT ACTION</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td><b>{t.id}</b><small>{t.title}</small></td><td>{t.company}<small>{t.department}</small></td><td>{t.kind}<small>{t.dataProvider?`Provider: ${t.dataProvider}`:"Evidence required"}</small></td><td><b>{t.plannedStart||t.due||"Not set"}</b><small>to {t.plannedEnd||t.due||"Not set"}</small></td><td>{t.assignedTo||"Unassigned queue"}</td><td><span className={`badge ${t.status==="Completed"?"green":t.status==="Available"?"amber":"blue"}`}>{t.status}</span><small>{t.notes||"No additional notes"}</small></td><td>{t.status==="Available"?<button className="wb-next" onClick={()=>accept(t.id)}>Accept to start</button>:t.status==="Completed"?<button className="wb-next">View completed</button>:<button className="wb-next" onClick={()=>update(t.id,"Completed")}>Mark completed</button>}</td></tr>)}</tbody></table>{!rows.length&&<div className="wb-empty"><CheckCircle2/><b>No tasks in this section</b><span>Tasks will appear here when their status changes.</span></div>}</div></section>
  {open&&<><button className="overlay" onClick={()=>setOpen(false)}/>
    <form className="modal" onSubmit={async e=>{e.preventDefault();
      if(!form.title.trim()||!create)return; setBusy(true);
      try{await create({...form,title:form.title.trim()}); setOpen(false);
        setForm({title:"",department:"",companyId:"",due:"",notes:""});}
      finally{setBusy(false)}}}>
      <header><div><small>AUDIT DEPARTMENT</small>
        <h2>New {kind==="Meeting"?"meeting":kind.toLowerCase()+" task"}</h2></div>
        <button type="button" onClick={()=>setOpen(false)}><X/></button></header>
      <div className="form">
        <label className="wide">{kind==="Meeting"?"What is the meeting about?":"Task title"}
          <input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
            placeholder={kind==="Meeting"?"e.g. Monthly audit closing":"e.g. Vendor onboarding controls"}/></label>
        <label>Department<select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>
          <option value="">— any —</option>
          {departments.map(d=><option key={d}>{d}</option>)}</select></label>
        <label>Company<select value={form.companyId} onChange={e=>setForm({...form,companyId:e.target.value})}>
          <option value="">— any —</option>
          {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>{kind==="Meeting"?"When":"Due date"}
          <input type="date" value={form.due} onChange={e=>setForm({...form,due:e.target.value})}/></label>
        <label className="wide">Notes<textarea value={form.notes}
          onChange={e=>setForm({...form,notes:e.target.value})}
          placeholder={kind==="Meeting"?"Agenda, attendees, anything to prepare":"What needs checking, and against what evidence"}/></label>
      </div>
      <footer><button type="button" onClick={()=>setOpen(false)}>Cancel</button>
        <button className="primary" disabled={busy||!form.title.trim()}>
          <Plus/>{busy?"Saving…":"Create"}</button></footer>
    </form></>}</div>}
export function TaskBlock({title,rows}:{title:string;rows:AuditTask[]}){return <section className="panel rd-panel"><div className="panel-head"><h2>{title}</h2><span>{rows.length}</span></div>{rows.map(t=><div className="rd-row" key={t.id}><span><b>{t.title}</b><small>{t.id} · {t.company} · {t.department}</small></span><strong><CalendarClock/> {t.due||"Not set"}</strong><em>{t.status}</em></div>)}</section>}
