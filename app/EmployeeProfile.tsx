"use client";
import{useState}from"react";
import{FileDown,FileText,MessageSquareWarning,Pencil,Plus,X}from"lucide-react";
import{csv,dayLabel,liveStatus,monthLabel,photoUrl,readable,stamp,statusTone,timeliness,timelinessTone,
  today,useAsync,useWorkforce}from"./workforce-store";
import type{Employee,Frequency,Query,Task,Token}from"./workforce-store";
import{Avatar,EmployeeEditor,Empty,ErrorBlock,Loading,QueryEditor,TaskEditor}from"./WorkforceShared";
import Attachments from"./Attachments";

type Tab="work"|"queries"|"observations"|"tokens"|"team";

export function EmployeeProfile({id,close,flash,openProfile,openJd}:{
  id:string;close:()=>void;flash:(m:string)=>void;openProfile:(id:string)=>void;
  openJd?:(id:string)=>void}){
  const wf=useWorkforce();
  const [tab,setTab]=useState<Tab>("work");
  const [taskEdit,setTaskEdit]=useState<{task:Partial<Task>;isNew:boolean}|null>(null);
  const [queryEdit,setQueryEdit]=useState<{query:Partial<Query>;isNew:boolean}|null>(null);
  const [empEdit,setEmpEdit]=useState<Partial<Employee>|null>(null);
  const{data,loading,error}=useAsync(()=>wf.api.dossier(id),[id,wf.version]);

  return <><button className="overlay" onClick={close}/><aside className="detail wf-profile">
    {loading&&!data?<><header><div><small>EMPLOYEE</small><h2>Loading</h2></div>
        <button onClick={close}><X/></button></header><div className="detail-body"><Loading/></div></>
    :error||!data?<><header><div><small>EMPLOYEE</small><h2>Not available</h2></div>
        <button onClick={close}><X/></button></header>
        <div className="detail-body"><ErrorBlock message={error||"Record not found"} retry={wf.refresh}/></div></>
    :(()=>{
      const{employee:e,role,department,manager,directReports,performance:p,queryStats:qs,tokenStats:ts}=data;
      const jd=e.jd||role?.jd||"";
      const finished=p.onTime+p.late;
      return <>
      <header><div><small>{department?.name?.toUpperCase()||"EMPLOYEE"}</small><h2>{e.name}</h2></div>
        <button onClick={close}><X/></button></header>
      <div className="detail-body">
        <div className="wf-dossier-head">
          {photoUrl(e)
            // eslint-disable-next-line @next/next/no-img-element
            ?<img className="wf-dossier-photo" src={photoUrl(e)} alt={e.name}/>
            :<span className="wf-dossier-photo wf-dossier-initials"
               style={{background:role?.color||"#e2f0eb",color:role?readable(role.color):"#0b725d"}}>
               {e.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span>}
          <div>
            <b>{e.designation||role?.name||"—"}</b>
            <span className="badge" style={{background:role?.color,color:role?readable(role.color):undefined}}>{role?.name||"No role"}</span>
            {!e.active&&<span className="badge red">Inactive</span>}
            <small>{e.code} · {department?.name||e.department||"—"}</small>
          </div>
          <div className="wf-dossier-tools">
            {openJd&&<button onClick={()=>openJd(e.id)}><FileText/>JD</button>}
            <button onClick={()=>setEmpEdit({...e})}><Pencil/>Edit</button>
            <button onClick={()=>csv([["Task","Frequency","Period","Due","Status","Timeliness","Progress %","Remarks"],
              ...data.tasks.map(t=>[t.name,t.frequency,t.period,t.due,liveStatus(t),timeliness(t),t.progress,t.remarks])],
              `${e.code}-record.csv`)}><FileDown/>Export</button>
          </div>
        </div>

        <div className="facts">
          {[["Reports to",manager?.name||"—"],["Direct reports",String(directReports.length)],
            ["Email",e.email||"—"],["Phone",e.phone||"—"],["Joined",e.joined||"—"],
            ["Status",e.active?"Active":"Inactive"]].map(x=><label key={x[0]}>{x[0]}<b>{x[1]}</b></label>)}
        </div>

        <section><h4>Job description</h4>
          {jd?<p className="wf-jd">{jd}{!e.jd&&role?.jd&&<em> — inherited from the {role.name} role</em>}</p>
             :<p className="wf-empty">No job description recorded for this employee or their role.</p>}</section>

        <section><h4>Task performance</h4>
          <div className="wf-summary wf-summary-6">
            {[["Total",p.total],["Completed",p.completed],["On time",p.onTime],["Late",p.late],
              ["Delayed",p.delayed],["Open",p.open]].map(x=><article key={String(x[0])}><span>{x[0]}</span><b>{x[1]}</b></article>)}
          </div>
          <div className="wf-rates">
            <label>On-time rate <b>{p.onTimeRate}%</b>
              <progress value={p.onTimeRate} max={100}/>
              <small>{p.onTime} of {finished} finished tasks closed on or before the due date</small></label>
            <label>Completion rate <b>{p.completionRate}%</b>
              <progress value={p.completionRate} max={100}/>
              <small>{p.completed} of {p.total} assigned tasks completed</small></label>
          </div>
          <div className="wf-freq">
            {Object.entries(p.byFrequency).map(([k,v])=><span key={k}>{k}<b>{v}</b></span>)}
          </div>
        </section>

        <section><h4>Queries</h4>
          <div className="wf-summary wf-summary-5">
            {[["Raised",qs.raised],["Open",qs.open],["Followed up",qs.followed],
              ["Sorted out",qs.resolved],["Follow-ups",qs.followUpCount]]
              .map(x=><article key={String(x[0])}><span>{x[0]}</span><b>{x[1]}</b></article>)}
          </div>
          <label className="wf-rate-line">Resolution rate <b>{qs.resolutionRate}%</b>
            <progress value={qs.resolutionRate} max={100}/></label>
        </section>


        <Attachments entityType="employee" entityId={e.id} flash={flash}/>
        <div className="wf-tabs">
          {([["work",`Work (${data.tasks.length})`],["queries",`Queries (${data.queries.length})`],
            ["tokens",`Tokens (${ts.tokens})`],["team",`Team (${directReports.length})`]] as [Tab,string][])
            .map(([k,label])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{label}</button>)}
        </div>

        {tab==="work"&&<>
          <div className="wf-profile-actions">
            <button className="primary" onClick={()=>setTaskEdit({isNew:true,task:{
              employeeId:e.id,deptId:e.deptId,name:"",frequency:"Daily",due:today(),start:today(),
              priority:"Medium",status:"Not Started",progress:0,qty:0,done:0,assignedBy:wf.actor}})}>
              <Plus/>Assign task</button>
            <button onClick={()=>setQueryEdit({isNew:true,query:{employeeId:e.id,deptId:e.deptId,
              title:"",priority:"Medium",status:"Open",raisedBy:wf.actor}})}>
              <MessageSquareWarning/>Raise query</button>
          </div>
          {(["Daily","Weekly","Monthly","One Time"] as Frequency[]).map(f=>{
            const rows=data.tasks.filter(t=>t.frequency===f);
            return rows.length?<WorkTable key={f} title={`${f} work`} kind={f} rows={rows}
              open={t=>setTaskEdit({task:t,isNew:false})}/>:null})}
          {!data.tasks.length&&<Empty label="No tasks assigned yet."/>}
          {data.tasks.length>=60&&<p className="wf-note">Showing the 60 most recent tasks. Use Workforce reports for the full history.</p>}
        </>}

        {tab==="queries"&&<QueryTable rows={data.queries} open={q=>setQueryEdit({query:q,isNew:false})}/>}
        {tab==="tokens"&&<TokenTable rows={data.tokens} stats={ts}/>}
        {tab==="team"&&(directReports.length
          ?<div className="wf-reports">{directReports.map(r=><button key={r.id} onClick={()=>openProfile(r.id)}>
              <Avatar employee={r} size={30}/><span><b>{r.name}</b><small>{r.code}</small></span></button>)}</div>
          :<Empty label="No direct reports."/>)}
      </div></>})()}
  </aside>
  {taskEdit&&<TaskEditor task={taskEdit.task} isNew={taskEdit.isNew} close={()=>setTaskEdit(null)} flash={flash}/>}
  {queryEdit&&<QueryEditor query={queryEdit.query} isNew={queryEdit.isNew} close={()=>setQueryEdit(null)} flash={flash}/>}
  {empEdit&&<EmployeeEditor employee={empEdit} close={()=>setEmpEdit(null)} flash={flash}/>}
  </>}

function WorkTable({title,kind,rows,open}:{title:string;kind:Frequency;rows:Task[];open:(t:Task)=>void}){
  const label=(t:Task)=>kind==="Daily"?dayLabel(t.due):kind==="Weekly"?t.period:kind==="Monthly"?monthLabel(t.due):dayLabel(t.due);
  return <section><h4>{title}</h4>
    <div className="table-wrap wf-table"><table><thead><tr>
      <th>TASK</th><th>{kind==="Weekly"?"WEEK":kind==="Monthly"?"MONTH":"DATE"}</th>
      <th>STATUS</th><th>TIMELINESS</th><th>%</th><th>REMARKS</th></tr></thead>
      <tbody>{rows.map(t=>{const s=liveStatus(t);const tl=timeliness(t);return <tr key={t.id} onClick={()=>open(t)}>
        <td><b>{t.name}</b></td><td>{label(t)}</td>
        <td><span className={`badge ${statusTone(s)}`}>{s}</span></td>
        <td><span className={`badge ${timelinessTone(tl)}`}>{tl}</span></td>
        <td>{t.progress}%</td><td>{t.remarks||t.blocker||"—"}</td></tr>})}</tbody></table></div>
  </section>}

function QueryTable({rows,open}:{rows:Query[];open:(q:Query)=>void}){
  if(!rows.length)return <Empty label="No queries raised against this employee."/>;
  return <section><h4>Query register</h4>
    <div className="table-wrap wf-table"><table><thead><tr>
      <th>REF</th><th>QUERY</th><th>RAISED</th><th>FOLLOW-UPS</th><th>STATUS</th><th>RESOLUTION</th></tr></thead>
      <tbody>{rows.map(q=><tr key={q.id} onClick={()=>open(q)}>
        <td><b>{q.ref}</b></td><td>{q.title}</td><td>{stamp(q.raisedAt)}</td>
        <td>{q.followUps}{q.lastFollowUpAt&&<small>last {stamp(q.lastFollowUpAt)}</small>}</td>
        <td><span className={`badge ${statusTone(q.status)}`}>{q.status}</span></td>
        <td>{q.resolution||"—"}</td></tr>)}</tbody></table></div>
  </section>}

function TokenTable({rows,stats}:{rows:Token[];stats:{tokens:number;qty:number;done:number;pending:number}}){
  return <section><h4>Token work</h4>
    <div className="wf-summary">
      {[["Tokens",stats.tokens],["Quantity",stats.qty],["Completed",stats.done],["Pending",stats.pending],
        ["Completion",`${stats.qty?Math.round(stats.done/stats.qty*100):0}%`]]
        .map(x=><article key={String(x[0])}><span>{x[0]}</span><b>{x[1]}</b></article>)}
    </div>
    {!rows.length?<Empty label="No tokens issued to this employee."/>
    :<div className="table-wrap wf-table"><table><thead><tr>
      <th>TOKEN</th><th>TYPE</th><th>QTY</th><th>DONE</th><th>PENDING</th><th>STATUS</th></tr></thead>
      <tbody>{rows.map(t=><tr key={t.id}><td><b>{t.number}</b></td><td>{t.taskType}</td>
        <td>{t.qty}</td><td>{t.done}</td><td>{Math.max(t.qty-t.done,0)}</td>
        <td><span className={`badge ${statusTone(t.status)}`}>{t.status}</span></td></tr>)}</tbody></table></div>}
  </section>}
