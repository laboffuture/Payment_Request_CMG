"use client";
import{useState}from"react";
import{FileBarChart}from"lucide-react";
import{csv,frequencies,liveStatus,readable,statusTone,timeliness,useAsync,useWorkforce}from"./workforce-store";
import type{Summary}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";

const n=(v:unknown)=>Number(v)||0;

export function WorkforceReports({openProfile,flash}:{openProfile:(id:string)=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [f,setF]=useState({employeeId:"",deptId:"",frequency:"",status:"",from:"",to:""});
  const [nameSearch,setNameSearch]=useState("");
  const [running,setRunning]=useState(false);
  const set=(k:keyof typeof f,v:string)=>setF(p=>({...p,[k]:v}));

  const{data:people}=useAsync(()=>wf.api.employees({q:nameSearch,limit:20}),[nameSearch],nameSearch.length>1);
  const{data,loading,error}=useAsync(()=>wf.api.tasks({...f,limit:200}),[f,wf.version]);
  const rows=data?.tasks||[];
  const total=data?.total||0;

  /* Report export walks the server pages rather than asking for everything at once,
     so a 200,000-row range never becomes one query. */
  const run=async(kind:string)=>{
    setRunning(true);
    try{
      const all=[];
      for(let offset=0;offset<Math.min(total,5000);offset+=200){
        const page=await wf.api.tasks({...f,limit:200,offset});
        all.push(...page.tasks);
        if(page.tasks.length<200)break}
      csv([["Employee","Task","Frequency","Period","Due","Priority","Status","Timeliness","Progress %","Completed","Blocker","Next action","Remarks"],
        ...all.map(t=>[t.employeeId,t.name,t.frequency,t.period,t.due,t.priority,liveStatus(t),
          timeliness(t),t.progress,t.completedAt,t.blocker,t.nextAction,t.remarks])],
        `${kind.toLowerCase()}-report-${new Date().toISOString().slice(0,10)}.csv`);
      flash(`${kind} report exported — ${all.length} rows`);
    }catch(e){flash(e instanceof Error?e.message:"Could not build the report")}
    finally{setRunning(false)}};

  return <div className="page">
    <div className="intro"><div><small>REPORTING</small><h2>Workforce reports</h2>
      <p>Filter, review, then export. Exports page through the server rather than pulling everything at once.</p></div></div>

    <section className="panel wf-filters">
      <label>Employee
        <div className="wf-filter-pair">
          <input placeholder="Type a name to search" value={nameSearch} onChange={e=>setNameSearch(e.target.value)}/>
          <select value={f.employeeId} onChange={e=>set("employeeId",e.target.value)}>
            <option value="">All employees</option>
            {(people?.employees||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div></label>
      <label>Department<select value={f.deptId} onChange={e=>set("deptId",e.target.value)}>
        <option value="">All departments</option>
        {wf.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Frequency<select value={f.frequency} onChange={e=>set("frequency",e.target.value)}>
        <option value="">All frequencies</option>{frequencies.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Status<select value={f.status} onChange={e=>set("status",e.target.value)}>
        <option value="">All statuses</option>
        {["Not Started","In Progress","On Hold","Completed","Overdue","Cancelled"].map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Due from<input type="date" value={f.from} onChange={e=>set("from",e.target.value)}/></label>
      <label>Due to<input type="date" value={f.to} onChange={e=>set("to",e.target.value)}/></label>
      <div className="wf-report-buttons">
        {["Daily","Weekly","Monthly"].map(k=><button key={k} className="primary" disabled={running} onClick={()=>run(k)}>
          <FileBarChart/>{running?"Building…":`${k} report`}</button>)}
      </div>
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>RESULT</small><h2>{total.toLocaleString()} matching tasks</h2></div>
        <span>showing first {rows.length}</span></div>
      {error?<ErrorBlock message={error} retry={wf.refresh}/>
      :loading&&!rows.length?<Loading/>
      :!rows.length?<Empty label="No tasks match these filters."/>
      :<div className="table-wrap"><table className="wf-wide"><thead><tr>
        <th>EMPLOYEE</th><th>TASK</th><th>FREQUENCY</th><th>DUE</th><th>STATUS</th>
        <th>TIMELINESS</th><th>%</th><th>BLOCKER</th><th>NEXT ACTION</th></tr></thead>
        <tbody>{rows.map(t=><tr key={t.id}>
          <td><button className="wf-link" onClick={()=>openProfile(t.employeeId)}>{t.employeeId}</button></td>
          <td>{t.name}</td><td>{t.frequency}</td><td>{t.due}</td>
          <td><span className={`badge ${statusTone(liveStatus(t))}`}>{liveStatus(t)}</span></td>
          <td>{timeliness(t)}</td><td>{t.progress}%</td>
          <td>{t.blocker||"—"}</td><td>{t.nextAction||"—"}</td></tr>)}</tbody></table></div>}
    </section>
  </div>}

/* Appended under the existing control room. Every figure comes from the SQL summary
   endpoint, not from rows downloaded into the browser. */
export function WorkforceOverview({openProfile,go}:{openProfile:(id:string)=>void;go:()=>void}){
  const wf=useWorkforce();
  const{data,loading,error}=useAsync(()=>wf.api.summary(),[wf.version]);
  if(loading&&!data)return <Loading label="Loading workforce figures"/>;
  if(error||!data)return <ErrorBlock message={error||"Summary unavailable"} retry={wf.refresh}/>;
  const s=data as Summary;
  const t=s.totals||{};
  const q=s.queries||{};

  return <>
    <div className="intro wf-dash-intro"><div><small>WORKFORCE</small><h2>Group task position</h2>
      <p>Aggregated in the database across every department.</p></div>
      <button onClick={go}>Open organisation</button></div>

    <div className="metrics wf-metrics-5">
      {[["Employees",n(t.activeEmployees),`${n(t.employees)} on record`,"blue"],
        ["Tasks",n(t.tasks),"all frequencies","violet"],
        ["Completed",n(t.completed),`${n(t.tasks)?Math.round(n(t.completed)/n(t.tasks)*100):0}% of all work`,"green"],
        ["Pending",n(t.pending),`${n(t.dueToday)} due today`,"amber"],
        ["Overdue",n(t.overdue),"past due date","red"]]
        .map(x=><article className={String(x[3])} key={String(x[0])}><span>{x[0]}</span><b>{n(x[1]).toLocaleString()}</b><small>{x[2]}</small></article>)}
    </div>

    <div className="metrics wf-metrics-4">
      {[["On time",n(t.onTime),`${n(t.onTimeRate)}% of finished work`],
        ["Late",n(t.late),"finished after the due date"],
        ["Queries raised",n(q.raised),`${n(q.open)} still open`],
        ["Queries sorted out",n(q.resolved),`${n(q.followed)} in follow-up`]]
        .map(x=><article key={String(x[0])}><span>{x[0]}</span><b>{n(x[1]).toLocaleString()}</b><small>{x[2]}</small></article>)}
    </div>

    <PerfTable title="Department performance" head="DEPARTMENT" rows={s.departments||[]}/>
    <PerfTable title="Role performance" head="ROLE" rows={s.roles||[]}/>

    <section className="panel table-panel wf-block">
      <div className="panel-head"><div><small>WATCHLIST</small><h2>Most overdue work</h2></div>
        <span>{(s.watchlist||[]).length}</span></div>
      {!(s.watchlist||[]).length?<Empty label="Nothing overdue."/>
      :<div className="table-wrap"><table><thead><tr>
        <th>EMPLOYEE</th><th>ID</th><th>TASKS</th><th>ON TIME</th><th>OVERDUE</th></tr></thead>
        <tbody>{(s.watchlist||[]).map(r=><tr key={String(r.id)}>
          <td><button className="wf-link" onClick={()=>openProfile(String(r.id))}>{String(r.name)}</button></td>
          <td>{String(r.code)}</td><td>{n(r.tasks)}</td><td>{n(r.onTime)}</td>
          <td>{n(r.overdue)?<span className="badge red">{n(r.overdue)}</span>:0}</td></tr>)}</tbody></table></div>}
    </section>
  </>}

function PerfTable({title,head,rows}:{title:string;head:string;rows:Record<string,unknown>[]}){
  return <section className="panel table-panel wf-block">
    <div className="panel-head"><div><small>{title.toUpperCase()}</small><h2>{title}</h2></div><span>{rows.length}</span></div>
    {!rows.length?<Empty label="Nothing mapped yet."/>
    :<div className="table-wrap"><table><thead><tr>
      <th>{head}</th><th>EMPLOYEES</th><th>TASKS</th><th>COMPLETED</th><th>OVERDUE</th><th>%</th></tr></thead>
      <tbody>{rows.map(r=>{const tasks=n(r.tasks);const done=n(r.completed);
        const pct=tasks?Math.round(done/tasks*100):0;const color=String(r.color||"#0b725d");
        return <tr key={String(r.id)}>
          <td><span className="badge" style={{background:color,color:readable(color)}}>{String(r.name)}</span></td>
          <td>{n(r.employees)}</td><td>{tasks}</td><td>{done}</td>
          <td>{n(r.overdue)?<span className="badge red">{n(r.overdue)}</span>:0}</td>
          <td><progress value={pct} max={100}/> {pct}%</td></tr>})}</tbody></table></div>}
  </section>}
