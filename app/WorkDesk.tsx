"use client";
import{useEffect,useState}from"react";
import{Plus,RefreshCw,Search}from"lucide-react";
import{csv,dayLabel,frequencies,liveStatus,monthLabel,normalise,pendingOccurrences,periodOf,statuses,
  statusTone,timeliness,timelinessTone,today,useAsync,useWorkforce}from"./workforce-store";
import type{Frequency,Task,WorkStatus}from"./workforce-store";
import{Empty,ErrorBlock,Loading,Pager,TaskEditor}from"./WorkforceShared";

const LIMIT=25;
const blank=(employeeId:string,deptId:string,actor:string,frequency:Frequency="Daily"):Partial<Task>=>({
  employeeId,deptId,name:"",frequency,period:periodOf(frequency,today()),start:today(),due:today(),
  priority:"Medium",assignedBy:actor,status:"Not Started",progress:0,qty:0,done:0});

export function TaskBoard({openProfile,flash,tabs}:{tabs?:React.ReactNode;openProfile:(id:string)=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [raw,setRaw]=useState("");
  const [q,setQ]=useState("");
  const [freq,setFreq]=useState("");
  const [status,setStatus]=useState("");
  const [offset,setOffset]=useState(0);
  const [edit,setEdit]=useState<{task:Partial<Task>;isNew:boolean}|null>(null);
  useEffect(()=>{const t=setTimeout(()=>{setQ(raw);setOffset(0)},300);return()=>clearTimeout(t)},[raw]);

  const{data,loading,error}=useAsync(()=>wf.api.tasks({q,deptId:wf.dept||undefined,
    frequency:freq||undefined,status:status||undefined,limit:LIMIT,offset}),
    [q,wf.dept,freq,status,offset,wf.version]);
  const rows=data?.tasks||[];
  const total=data?.total||0;

  return <div className="page">
    {tabs}
    <div className="intro"><div><small>WORK REGISTER</small><h2>All tasks</h2>
      <p>Filtered and paged on the server across the {wf.deptById(wf.dept)?.name||"selected"} chart.</p></div>
      <button className="primary" onClick={()=>setEdit({isNew:true,task:blank("",wf.dept,wf.actor)})}><Plus/>Assign task</button></div>

    <div className="toolbar">
      <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Search task name"/></label>
      <select className="wf-select" value={freq} onChange={e=>{setFreq(e.target.value);setOffset(0)}}>
        <option value="">All frequencies</option>{frequencies.map(f=><option key={f}>{f}</option>)}</select>
      <select className="wf-select" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}>
        <option value="">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
      <button onClick={()=>csv([["Task","Employee","Frequency","Period","Due","Priority","Status","Timeliness","Progress %","Blocker","Next action"],
        ...rows.map(t=>[t.name,t.employeeId,t.frequency,t.period,t.due,t.priority,liveStatus(t),timeliness(t),t.progress,t.blocker,t.nextAction])],
        "tasks-page.csv")}>Export page</button>
    </div>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>TASK CONTROL</small><h2>{total.toLocaleString()} tasks</h2></div>
        {loading&&<span>Loading…</span>}</div>
      {error?<ErrorBlock message={error} retry={wf.refresh}/>
      :loading&&!rows.length?<Loading/>
      :!rows.length?<Empty label="No tasks match this filter."/>
      :<><div className="table-wrap"><table><thead><tr>
        <th>TASK</th><th>EMPLOYEE</th><th>FREQUENCY</th><th>PERIOD</th><th>DUE</th>
        <th>PRIORITY</th><th>STATUS</th><th>TIMELINESS</th><th>PROGRESS</th></tr></thead>
        <tbody>{rows.map(t=>{const s=liveStatus(t);const tl=timeliness(t);return <tr key={t.id} onClick={()=>setEdit({task:t,isNew:false})}>
          <td><b>{t.name}</b>{t.expectedOutput&&<small>{t.expectedOutput}</small>}</td>
          <td><button className="wf-link plain" onClick={e=>{e.stopPropagation();openProfile(t.employeeId)}}>{t.employeeId}</button></td>
          <td>{t.frequency}</td><td>{t.period}</td><td>{dayLabel(t.due)}</td>
          <td><span className={`badge ${t.priority.toLowerCase()}`}>{t.priority}</span></td>
          <td><span className={`badge ${statusTone(s)}`}>{s}</span></td>
          <td><span className={`badge ${timelinessTone(tl)}`}>{tl}</span></td>
          <td><progress value={t.progress} max={100}/> {t.progress}%</td></tr>})}</tbody></table></div>
      <Pager total={total} limit={LIMIT} offset={offset} setOffset={setOffset}/></>}
    </section>
    {edit&&<TaskEditor task={edit.task} isNew={edit.isNew} close={()=>setEdit(null)} flash={flash}/>}
  </div>}

export function WorkPeriod({frequency,flash,openProfile,tabs}:{tabs?:React.ReactNode;frequency:Frequency;flash:(m:string)=>void;openProfile:(id:string)=>void}){
  const wf=useWorkforce();
  const [raw,setRaw]=useState("");
  const [picked,setPicked]=useState("");
  const [edit,setEdit]=useState<{task:Partial<Task>;isNew:boolean}|null>(null);
  const [rolling,setRolling]=useState(false);

  const{data:people}=useAsync(()=>wf.api.employees({q:raw,deptId:wf.dept||undefined,active:"1",limit:20}),
    [raw,wf.dept,wf.version],raw.length>1||!picked);
  const list=people?.employees||[];
  const target=picked||list[0]?.id||"";
  const employee=list.find(p=>p.id===target);

  const{data,loading,error}=useAsync(()=>wf.api.tasks({employeeId:target,frequency,limit:60}),
    [target,frequency,wf.version],!!target);
  const rows=data?.tasks||[];

  const quick=async(t:Task,patch:Partial<Task>)=>{
    try{await wf.api.saveTask(normalise({...t,...patch}),false);flash(`${t.name} updated`)}
    catch(e){flash(e instanceof Error?e.message:"Could not update")}};

  /* Catch-up occurrences are generated on demand rather than on every page load, so
     300 people opening this screen do not each trigger a write burst. */
  const rollForward=async()=>{
    if(!rows.length)return;
    const latest=new Map<string,Task>();
    for(const t of rows){const cur=latest.get(t.seriesId);if(!cur||t.due>cur.due)latest.set(t.seriesId,t)}
    const missing=pendingOccurrences([...latest.values()]);
    if(!missing.length)return flash("Every recurring task is already up to date");
    setRolling(true);
    try{await wf.api.bulkTasks(missing.slice(0,100));flash(`${missing.length} recurring occurrence${missing.length===1?"":"s"} created`)}
    catch(e){flash(e instanceof Error?e.message:"Could not generate occurrences")}
    finally{setRolling(false)}};

  const label=frequency==="Daily"?"DATE":frequency==="Weekly"?"WEEK":"MONTH";
  const cell=(t:Task)=>frequency==="Daily"?dayLabel(t.due):frequency==="Weekly"?t.period:monthLabel(t.due);

  return <div className="page">
    {tabs}
    <div className="intro"><div><small>{frequency.toUpperCase()} UPDATE</small><h2>{frequency} work</h2>
      <p>Pick an employee, review the period, and record progress against each task.</p></div>
      <div className="wf-head-tools">
        <button disabled={rolling||!rows.length} onClick={rollForward}>
          <RefreshCw className={rolling?"wf-spin":""}/>Generate missed occurrences</button>
        {target&&<button className="primary" onClick={()=>setEdit({isNew:true,
          task:blank(target,employee?.deptId||wf.dept,wf.actor,frequency)})}><Plus/>Assign {frequency.toLowerCase()} task</button>}
      </div></div>

    <div className="toolbar">
      <label><Search/><input value={raw} onChange={e=>{setRaw(e.target.value);setPicked("")}}
        placeholder="Search for an employee"/></label>
      <select className="wf-select wide-select" value={target} onChange={e=>setPicked(e.target.value)}>
        {!list.length&&<option value="">No matching employees</option>}
        {list.map(p=><option key={p.id} value={p.id}>{p.name} — {p.designation||p.code}</option>)}</select>
      {employee&&<button onClick={()=>openProfile(employee.id)}>Open record</button>}
      <button disabled={!rows.length} onClick={()=>csv([["Period","Task","Qty","Done","Pending","Status","Timeliness","Progress %","Blocker","Remarks"],
        ...rows.map(t=>[t.period,t.name,t.qty,t.done,Math.max(t.qty-t.done,0),liveStatus(t),timeliness(t),t.progress,t.blocker,t.remarks])],
        `${employee?.code||"employee"}-${frequency.toLowerCase()}.csv`)}>Export</button>
    </div>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>{employee?.name?.toUpperCase()||"NO EMPLOYEE SELECTED"}</small>
        <h2>{frequency} work register</h2></div><span>{rows.length} records</span></div>
      {error?<ErrorBlock message={error} retry={wf.refresh}/>
      :loading&&!rows.length?<Loading/>
      :!rows.length?<Empty label={`No ${frequency.toLowerCase()} work for this employee yet.`}/>
      :<div className="table-wrap"><table className="wf-wide"><thead><tr>
        <th>{label}</th><th>TASK</th><th>QTY</th><th>DONE</th><th>PENDING</th><th>STATUS</th>
        <th>PROGRESS</th><th>TIMELINESS</th><th>REMARKS</th><th>ACTION</th></tr></thead>
        <tbody>{rows.map(t=>{const s=liveStatus(t);const tl=timeliness(t);return <tr key={t.id}>
          <td><b>{cell(t)}</b></td>
          <td>{t.name}{t.blocker&&<small className="wf-over">Blocker: {t.blocker}</small>}</td>
          <td>{t.qty||"—"}</td><td>{t.qty?t.done:"—"}</td><td>{t.qty?Math.max(t.qty-t.done,0):"—"}</td>
          <td><select className="wf-inline" value={t.status} onChange={e=>quick(t,{status:e.target.value as WorkStatus})}>
            {statuses.filter(x=>x!=="Overdue").map(x=><option key={x}>{x}</option>)}</select>
            {s==="Overdue"&&<span className="badge red">Overdue</span>}</td>
          <td><select className="wf-inline" value={t.progress} onChange={e=>quick(t,{progress:Number(e.target.value),
            status:Number(e.target.value)===100?"Completed":t.status==="Not Started"?"In Progress":t.status})}>
            {[0,25,50,75,100].map(p=><option key={p} value={p}>{p}%</option>)}</select></td>
          <td><span className={`badge ${timelinessTone(tl)}`}>{tl}</span></td>
          <td>{t.remarks||"—"}</td>
          <td><button className="wf-small" onClick={()=>setEdit({task:t,isNew:false})}>Open</button></td></tr>})}</tbody></table></div>}
    </section>
    {edit&&<TaskEditor task={edit.task} isNew={edit.isNew} close={()=>setEdit(null)} flash={flash}/>}
  </div>}
