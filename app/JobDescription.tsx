"use client";
import{useEffect,useState}from"react";
import{FileDown,Pencil,Search}from"lucide-react";
import{csv,dayLabel,liveStatus,monthLabel,statusTone,timeliness,timelinessTone,today,
  useAsync,useWorkforce}from"./workforce-store";
import type{Employee,Frequency,Task}from"./workforce-store";
import{Avatar,Empty,ErrorBlock,Loading}from"./WorkforceShared";

const RHYTHMS:Frequency[]=["Daily","Weekly","Monthly","One Time"];

/* One screen per person: who they are, what the role holds them accountable for,
   and every task they carry broken out by rhythm. Reached from the JD button on the
   chart, the register and the profile. */
export default function JobDescription({employeeId,openProfile,flash}:{
  employeeId:string;openProfile:(id:string)=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [picked,setPicked]=useState(employeeId);
  const [raw,setRaw]=useState("");
  const [term,setTerm]=useState("");
  useEffect(()=>{const t=setTimeout(()=>setTerm(raw),300);return()=>clearTimeout(t)},[raw]);
  useEffect(()=>{if(employeeId)setPicked(employeeId)},[employeeId]);

  const{data:people}=useAsync(()=>wf.api.employees({q:term,limit:20,active:"1"}),
    [term,wf.version],term.length>1);
  const{data,loading,error}=useAsync(()=>wf.api.dossier(picked),[picked,wf.version],!!picked);
  /* The dossier caps its task list, so each rhythm is fetched in full and paged on its
     own. Somebody carrying thirty daily tasks sees all thirty here, not a slice. */
  const{data:daily}=useAsync(()=>wf.api.tasks({employeeId:picked,frequency:"Daily",limit:200}),
    [picked,wf.version],!!picked);
  const{data:weekly}=useAsync(()=>wf.api.tasks({employeeId:picked,frequency:"Weekly",limit:200}),
    [picked,wf.version],!!picked);
  const{data:monthly}=useAsync(()=>wf.api.tasks({employeeId:picked,frequency:"Monthly",limit:200}),
    [picked,wf.version],!!picked);
  const{data:once}=useAsync(()=>wf.api.tasks({employeeId:picked,frequency:"One Time",limit:200}),
    [picked,wf.version],!!picked);

  if(!picked)return <div className="page">
    <div className="intro"><div><small>JOB DESCRIPTION</small><h2>Pick a person</h2>
      <p>Search for somebody to see what their role holds them accountable for and every
        task they carry.</p></div></div>
    <div className="toolbar">
      <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)}
        placeholder="Search a name, ID or team"/></label></div>
    {!!(people?.employees||[]).length&&<section className="panel wf-picker-list">
      {(people?.employees||[]).map((p:Employee)=><button key={p.id} onClick={()=>setPicked(p.id)}>
        <Avatar employee={p} size={30} color={wf.roleById(p.roleId)?.color}/>
        <span><b>{p.name}</b><small>{p.designation||p.code}</small></span></button>)}
    </section>}
  </div>;

  if(loading&&!data)return <div className="page"><Loading label="Loading the job description"/></div>;
  if(error||!data)return <div className="page">
    <ErrorBlock message={error||"Not found"} retry={wf.refresh}/></div>;

  const{employee:e,role,department,manager,performance:p}=data;
  const jd=e.jd||role?.jd||"";
  const inherited=!e.jd&&!!role?.jd;
  const sets:Record<string,{tasks:Task[];total:number}>={
    Daily:{tasks:daily?.tasks||[],total:daily?.total||0},
    Weekly:{tasks:weekly?.tasks||[],total:weekly?.total||0},
    Monthly:{tasks:monthly?.tasks||[],total:monthly?.total||0},
    "One Time":{tasks:once?.tasks||[],total:once?.total||0}};
  const tasks=RHYTHMS.flatMap(f=>sets[f].tasks);
  const grandTotal=RHYTHMS.reduce((a,f)=>a+sets[f].total,0);
  const byRhythm=(f:Frequency)=>sets[f].tasks;

  const exportAll=()=>csv([["Employee","Role","Department","Rhythm","Task","Period","Start",
    "Due","Ends","Priority","Status","Timeliness","Progress %","Expected output","Remarks"],
    ...tasks.map(t=>[e.name,role?.name||"",department?.name||"",t.frequency,t.name,t.period,
      t.start,t.due,t.endsAt||"",t.priority,liveStatus(t),timeliness(t),t.progress,
      t.expectedOutput,t.remarks])],`${e.code}-job-description.csv`);

  return <div className="page">
    <div className="intro"><div><small>JOB DESCRIPTION</small><h2>{e.name}</h2>
      <p>{e.designation||role?.name} · {department?.name||"—"} · reports to {manager?.name||"—"}</p></div>
      <div className="wf-head-tools">
        <button onClick={()=>setPicked("")}>Someone else</button>
        <button onClick={exportAll}><FileDown/>Export</button>
        <button className="primary" onClick={()=>openProfile(e.id)}>Full profile</button>
      </div></div>

    <section className="panel wf-jd-head">
      <Avatar employee={e} size={64} color={role?.color}/>
      <div>
        <span className="badge" style={{background:role?.color,color:"#fff"}}>{role?.name||"No role"}</span>
        <h3>{e.designation||role?.name||"—"}</h3>
        <small>{e.code} · joined {e.joined||"—"} · {e.active?"Active":"Inactive"}</small>
      </div>
      <div className="wf-jd-counts">
        {RHYTHMS.map(f=><span key={f}>{f}<b>{sets[f].total}</b></span>)}
        <span>All work<b>{grandTotal}</b></span>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><small>ACCOUNTABLE FOR</small><h2>Job description</h2></div>
        <button onClick={()=>flash("Edit the role or the person from the employee register to change this")}>
          <Pencil/>How to edit</button></div>
      <div className="wf-jd-body">
        {jd?<p className="wf-jd">{jd}{inherited&&<em> — inherited from the {role?.name} role.
          Give this person their own description to override it.</em>}</p>
          :<Empty label="No job description recorded for this person or their role yet."/>}
      </div>
    </section>

    <div className="metrics wf-metrics-4">
      {[["Every task",grandTotal],["Completed",p.completed],["Open",p.open],
        ["On-time rate",`${p.onTimeRate}%`]]
        .map(x=><article key={String(x[0])}><span>{x[0]}</span><b>{x[1]}</b></article>)}
    </div>

    {RHYTHMS.map(f=>{
      const rows=byRhythm(f);
      return <section className="panel table-panel" key={f}>
        <div className="panel-head"><div><small>{f.toUpperCase()} WORK</small>
          <h2>{f==="One Time"?"One-off tasks":`${f} tasks`}</h2></div>
          <span>{sets[f].total} {sets[f].total===1?"task":"tasks"}
            {sets[f].total>rows.length?` · showing ${rows.length}`:""}</span></div>
        {!rows.length?<Empty label={`No ${f.toLowerCase()} work assigned.`}/>
        :<div className="table-wrap"><table><thead><tr>
          <th>TASK</th><th>{f==="Weekly"?"WEEK":f==="Monthly"?"MONTH":"DUE"}</th>
          <th>STARTED</th><th>ENDS</th><th>PRIORITY</th><th>STATUS</th>
          <th>TIMELINESS</th><th>%</th><th>EXPECTED OUTPUT</th></tr></thead>
          <tbody>{rows.map((t:Task)=>{const s=liveStatus(t);const tl=timeliness(t);
            return <tr key={t.id}>
              <td><b>{t.name}</b>{t.remarks&&<small>{t.remarks}</small>}</td>
              <td>{f==="Weekly"?t.period:f==="Monthly"?monthLabel(t.due):dayLabel(t.due)}</td>
              <td>{t.start||"—"}</td>
              <td>{t.endsAt?<span className="badge">{t.endsAt}</span>:"open ended"}</td>
              <td><span className={`badge ${t.priority.toLowerCase()}`}>{t.priority}</span></td>
              <td><span className={`badge ${statusTone(s)}`}>{s}</span></td>
              <td><span className={`badge ${timelinessTone(tl)}`}>{tl}</span></td>
              <td>{t.progress}%</td>
              <td>{t.expectedOutput||"—"}</td></tr>})}</tbody></table></div>}
      </section>})}

    {RHYTHMS.some(f=>sets[f].total>sets[f].tasks.length)&&<p className="wf-note">
      Some rhythms hold more than 200 occurrences. Use Workforce reports to export the
      complete history.</p>}
  </div>}
