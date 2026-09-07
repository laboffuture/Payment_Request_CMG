"use client";
import{useRef,useState}from"react";
import{Camera,Loader2,Trash2,X,Upload}from"lucide-react";
import Attachments,{asDataUrl} from"./Attachments";
import{frequencies,initials,normalise,periodOf,photoUrl,priorities,queryStatuses,readable,resizeImage,
  roleTypes,statuses,today,useWorkforce}from"./workforce-store";
import type{Dept,Employee,Frequency,Priority,Query,QueryStatus,Role,RoleType,Task,Token,WorkStatus}from"./workforce-store";

export const swatches=["#0b725d","#3f70c7","#7855b8","#c0703a","#2f8f83","#1d6fa5","#b4553c","#6a7fb8","#8a6d1f","#71817d"];

/* ---------- state blocks ---------- */
export function Loading({label="Loading"}:{label?:string}){
  return <div className="wf-state"><Loader2 className="wf-spin"/>{label}…</div>}
export function ErrorBlock({message,retry}:{message:string;retry?:()=>void}){
  return <div className="wf-state wf-state-error">{message}{retry&&<button onClick={retry}>Try again</button>}</div>}
export function Empty({label}:{label:string}){return <p className="wf-empty pad">{label}</p>}

export function Pager({total,limit,offset,setOffset}:{total:number;limit:number;offset:number;setOffset:(n:number)=>void}){
  if(total<=limit)return null;
  const from=offset+1,to=Math.min(offset+limit,total);
  return <div className="wf-pager">
    <span>{from}–{to} of {total.toLocaleString()}</span>
    <button disabled={offset===0} onClick={()=>setOffset(Math.max(offset-limit,0))}>Previous</button>
    <button disabled={to>=total} onClick={()=>setOffset(offset+limit)}>Next</button>
  </div>}

/* ---------- avatar ---------- */
export function Avatar({employee,size=36,color}:{employee:{id:string;name:string;photoAt:string};size?:number;color?:string}){
  const url=photoUrl(employee);
  const style={width:size,height:size,borderRadius:Math.round(size/3.2),
    background:color||"#e2f0eb",color:color?readable(color):"#0b725d",fontSize:Math.round(size/2.9)};
  return url
    // photos are user uploads served from our own API, so a plain img avoids the
    // image optimiser and keeps the immutable cache header intact
    // eslint-disable-next-line @next/next/no-img-element
    ?<img className="wf-avatar" src={url} alt={employee.name} style={{...style,objectFit:"cover"}} loading="lazy"/>
    :<span className="wf-avatar" style={style}>{initials(employee.name)}</span>}

export function PhotoPicker({employee,flash,onDone}:{employee:Employee;flash:(m:string)=>void;onDone:()=>void}){
  const wf=useWorkforce();
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const pick=async(file?:File)=>{
    if(!file)return;
    setBusy(true);
    try{
      const dataUrl=await resizeImage(file,256);
      await wf.api.uploadPhoto(employee.id,dataUrl);
      flash(`Photo updated for ${employee.name}`);onDone()}
    catch(e){flash(e instanceof Error?e.message:"Could not upload the photo")}
    finally{setBusy(false)}};
  const clear=async()=>{
    setBusy(true);
    try{await wf.api.removePhoto(employee.id);flash("Photo removed");onDone()}
    catch(e){flash(e instanceof Error?e.message:"Could not remove the photo")}
    finally{setBusy(false)}};
  return <div className="wf-photo-picker">
    <Avatar employee={employee} size={72}/>
    <div>
      <button type="button" className="wf-small" disabled={busy} onClick={()=>input.current?.click()}>
        {busy?<Loader2 className="wf-spin"/>:<Camera/>}{employee.photoAt?"Replace photo":"Add photo"}</button>
      {employee.photoAt&&<button type="button" className="wf-small wf-danger-icon" disabled={busy} onClick={clear}><Trash2/></button>}
      <small>Resized to 256px before upload, around 20 KB stored.</small>
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
      onChange={e=>{pick(e.target.files?.[0]);e.target.value=""}}/>
  </div>}

/* ---------- colour field ---------- */
function ColourField({value,onChange,label}:{value:string;onChange:(v:string)=>void;label:string}){
  return <div className="wf-colour">
    <input type="color" value={value} onChange={e=>onChange(e.target.value)}/>
    {swatches.map(c=><button type="button" key={c} className={c===value?"on":""} style={{background:c}}
      onClick={()=>onChange(c)} aria-label={c}/>)}
    <span className="badge" style={{background:value,color:readable(value)}}>{label||"Preview"}</span>
  </div>}

/* ---------- department editor ---------- */
export function DeptEditor({dept,close,flash}:{dept:Partial<Dept>;close:()=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [d,setD]=useState<Partial<Dept>>(dept);
  const [busy,setBusy]=useState(false);
  const isNew=!wf.departments.some(x=>x.id===dept.id);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);
    try{await wf.api.saveDept(d,isNew);flash(`${d.name} saved`);close()}
    catch(err){flash(err instanceof Error?err.message:"Could not save")}finally{setBusy(false)}};
  return <><button className="overlay" onClick={close}/><form className="modal" onSubmit={submit}>
    <header><div><small>{isNew?"ADD DEPARTMENT":"EDIT DEPARTMENT"}</small><h2>{d.name||"New department"}</h2></div>
      <button type="button" onClick={close}><X/></button></header>
    <div className="form">
      <label>Department name<input required value={d.name||""} onChange={e=>setD({...d,name:e.target.value})}/></label>
      <label>Code<input value={d.code||""} onChange={e=>setD({...d,code:e.target.value.toUpperCase()})}/></label>
      <label className="wide">Colour<ColourField value={d.color||"#0b725d"} onChange={c=>setD({...d,color:c})} label={d.name||""}/></label>
    </div>
    <footer>
      {!isNew&&<button type="button" className="wf-danger" onClick={async()=>{
        if(!confirm(`Delete ${d.name}?`))return;
        try{await wf.api.removeDept(d.id!);flash("Department deleted");close()}
        catch(e){alert(e instanceof Error?e.message:"Could not delete")}}}><Trash2/>Delete</button>}
      <button type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy||!d.name}>{busy?"Saving…":"Save department"}</button>
    </footer>
  </form></>}

/* ---------- role editor ---------- */
export function RoleEditor({role,close,flash}:{role:Partial<Role>;close:()=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [r,setR]=useState<Partial<Role>>(role);
  const [busy,setBusy]=useState(false);
  const isNew=!wf.allRoles.some(x=>x.id===role.id);
  // a role may not be re-parented under itself or any of its own descendants
  const banned=new Set<string>([r.id||""]);
  let front=[r.id||""];
  while(front.length){const nx:string[]=[];
    for(const id of front)for(const x of wf.allRoles)if(x.parentId===id&&!banned.has(x.id)){banned.add(x.id);nx.push(x.id)}
    front=nx}
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);
    try{await wf.api.saveRole(r,isNew);flash(`${r.name} saved`);close()}
    catch(err){flash(err instanceof Error?err.message:"Could not save")}finally{setBusy(false)}};
  return <><button className="overlay" onClick={close}/><form className="modal" onSubmit={submit}>
    <header><div><small>{isNew?"ADD ROLE":"EDIT ROLE"}</small><h2>{r.name||"New role"}</h2></div>
      <button type="button" onClick={close}><X/></button></header>
    <div className="form">
      <label className="wide">Role name<input required value={r.name||""} onChange={e=>setR({...r,name:e.target.value})}
        placeholder="e.g. AR Executive"/></label>
      <label>Department<select value={r.deptId||wf.dept} onChange={e=>setR({...r,deptId:e.target.value})}>
        {wf.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Role type<select value={r.type||"Support"} onChange={e=>setR({...r,type:e.target.value as RoleType})}>
        {roleTypes.map(t=><option key={t}>{t}</option>)}</select></label>
      <label className="wide">Reports to<select value={r.parentId||""} onChange={e=>setR({...r,parentId:e.target.value||null})}>
        <option value="">— top of this chart —</option>
        {wf.allRoles.filter(x=>!banned.has(x.id)&&x.deptId===(r.deptId||wf.dept))
          .map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="wide">Job description<textarea value={r.jd||""} onChange={e=>setR({...r,jd:e.target.value})}
        placeholder="What this position is accountable for. Inherited by anyone in the role who has no personal JD."/></label>
      <label className="wide">Colour<ColourField value={r.color||"#0b725d"} onChange={c=>setR({...r,color:c})} label={r.name||""}/></label>
    </div>
    <footer>
      {!isNew&&<button type="button" className="wf-danger" onClick={async()=>{
        if(!confirm(`Delete ${r.name}?`))return;
        try{await wf.api.removeRole(r.id!);flash("Role deleted");close()}
        catch(e){alert(e instanceof Error?e.message:"Could not delete")}}}><Trash2/>Delete</button>}
      <button type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy||!r.name}>{busy?"Saving…":"Save role"}</button>
    </footer>
  </form></>}

/* ---------- employee editor ---------- */
export function EmployeeEditor({employee,close,flash}:{employee:Partial<Employee>;close:()=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [e,setE]=useState<Partial<Employee>>(employee);
  const [busy,setBusy]=useState(false);
  const [managers,setManagers]=useState<Employee[]>([]);
  const isNew=!employee.code||!!employee.id?.startsWith("new-");
  const set=<K extends keyof Employee>(k:K,v:Employee[K])=>setE(p=>({...p,[k]:v}));
  const submit=async(ev:React.FormEvent)=>{ev.preventDefault();setBusy(true);
    try{const saved=await wf.api.saveEmployee({...e,id:isNew?undefined:e.id},isNew);
      flash(`${saved.name} saved`);close()}
    catch(err){flash(err instanceof Error?err.message:"Could not save")}finally{setBusy(false)}};
  // manager options are searched server-side rather than pre-loading the register
  const findManagers=async(q:string)=>{
    if(q.length<2)return setManagers([]);
    try{const r=await wf.api.employees({q,limit:20,active:"1"});setManagers(r.employees)}catch{setManagers([])}};

  return <><button className="overlay" onClick={close}/><form className="modal wf-tall" onSubmit={submit}>
    <header><div><small>{isNew?"ADD EMPLOYEE":"EDIT EMPLOYEE"}</small><h2>{e.name||"New employee"}</h2></div>
      <button type="button" onClick={close}><X/></button></header>
    <div className="form">
      {!isNew&&e.id&&<div className="wide"><PhotoPicker employee={e as Employee} flash={flash} onDone={wf.refresh}/></div>}
      <label>Employee name<input required value={e.name||""} onChange={x=>set("name",x.target.value)}/></label>
      <label>Employee ID<input required value={e.code||""} onChange={x=>set("code",x.target.value)}/></label>
      <label>Department<select value={e.deptId||wf.dept}
        onChange={x=>setE(p=>({...p,deptId:x.target.value,roleId:"",designation:""}))}>
        {wf.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Designation<select required value={e.roleId||""}
        onChange={x=>{const picked=wf.allRoles.find(r=>r.id===x.target.value);
          setE(p=>({...p,roleId:x.target.value,designation:picked?picked.name:""}))}}>
        <option value="">— select a designation —</option>
        {wf.allRoles.filter(r=>r.deptId===(e.deptId||wf.dept)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <small className="wf-hint">Add a new designation on the Organisation screen.</small></label>
      <label>Team / vertical<input value={e.department||""} onChange={x=>set("department",x.target.value)}/></label>
      <label className="wide">Reports to
        <input placeholder="Type a name to search" defaultValue="" onChange={x=>findManagers(x.target.value)}/>
        <select value={e.reportsTo||""} onChange={x=>set("reportsTo",x.target.value||null)}>
          <option value="">— none —</option>
          {e.reportsTo&&!managers.some(m=>m.id===e.reportsTo)&&<option value={e.reportsTo}>{e.reportsTo} (current)</option>}
          {managers.filter(m=>m.id!==e.id).map(m=><option key={m.id} value={m.id}>{m.name} — {m.designation||m.code}</option>)}
        </select></label>
      <label>Email<input type="email" value={e.email||""} onChange={x=>set("email",x.target.value)}/></label>
      <label>Phone<input value={e.phone||""} onChange={x=>set("phone",x.target.value)}/></label>
      <label>Joining date<input type="date" value={e.joined||""} onChange={x=>set("joined",x.target.value)}/></label>
      <label>Status<select value={e.active===false?"Inactive":"Active"} onChange={x=>set("active",x.target.value==="Active")}>
        <option>Active</option><option>Inactive</option></select></label>
      <label className="wide">Job description<textarea value={e.jd||""} onChange={x=>set("jd",x.target.value)}
        placeholder="Leave blank to inherit the job description from the role."/></label>
    </div>
    <footer><button type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy||!e.name||!e.code||!e.roleId}>{busy?"Saving…":"Save employee"}</button></footer>
  </form></>}

/* ---------- task editor ---------- */
export function TaskEditor({task,isNew,close,flash}:{task:Partial<Task>;isNew:boolean;close:()=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [t,setT]=useState<Partial<Task>>(task);
  const [busy,setBusy]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [people,setPeople]=useState<Employee[]>([]);
  const set=<K extends keyof Task>(k:K,v:Task[K])=>setT(p=>{
    const n:Partial<Task>={...p,[k]:v};
    if(k==="frequency"||k==="due")n.period=periodOf((n.frequency||"Daily") as Frequency,n.due||today());
    if(k==="status"&&v==="Completed"){n.progress=100;n.completedAt=today();if(n.qty)n.done=n.qty}
    if(k==="progress"&&Number(v)===100&&n.status!=="Cancelled"){n.status="Completed";n.completedAt=today()}
    return n});
  const search=async(q:string)=>{
    if(q.length<2)return setPeople([]);
    try{const r=await wf.api.employees({q,limit:20,active:"1"});setPeople(r.employees)}catch{setPeople([])}};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);
    try{
      const saved=await wf.api.saveTask(normalise(t as Task),isNew);
      for(const file of files){
        try{const dataUrl=await asDataUrl(file);
          await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},
            body:JSON.stringify({entityType:"task",entityId:saved.id,kind:"Other",fileName:file.name,dataUrl})});
        }catch{}}
      flash(files.length?`${t.name} saved with ${files.length} document${files.length===1?"":"s"}`
        :isNew?`${t.name} assigned`:`${t.name} updated`);
      close()}
    catch(err){flash(err instanceof Error?err.message:"Could not save")}finally{setBusy(false)}};

  return <><button className="overlay" onClick={close}/><form className="modal wf-tall" onSubmit={submit}>
    <header><div><small>{isNew?"ASSIGN WORK":"UPDATE WORK"}</small><h2>{t.name||"New task"}</h2></div>
      <button type="button" onClick={close}><X/></button></header>
    <div className="form">
      <label className="wide">Task name<input required value={t.name||""} onChange={e=>set("name",e.target.value)}/></label>
      <label>Frequency<select value={t.frequency||"Daily"} onChange={e=>set("frequency",e.target.value as Frequency)}>
        {frequencies.map(f=><option key={f}>{f}</option>)}</select></label>
      <label>Priority<select value={t.priority||"Medium"} onChange={e=>set("priority",e.target.value as Priority)}>
        {priorities.map(p=><option key={p}>{p}</option>)}</select></label>
      <label className="wide">Assigned employee
        <input placeholder="Type a name to search" onChange={e=>search(e.target.value)}/>
        <select value={t.employeeId||""} onChange={e=>set("employeeId",e.target.value)} required>
          <option value="">— select an employee —</option>
          {t.employeeId&&!people.some(p=>p.id===t.employeeId)&&<option value={t.employeeId}>{t.employeeId} (current)</option>}
          {people.map(p=><option key={p.id} value={p.id}>{p.name} — {p.designation||p.code}</option>)}
        </select></label>
      <label>Assigned by<input value={t.assignedBy===undefined?wf.actor:t.assignedBy} onChange={e=>set("assignedBy",e.target.value)}/></label>
      <label>Start date<input type="date" value={t.start||today()} onChange={e=>set("start",e.target.value)}/></label>
      <label>Due date<input type="date" required value={t.due||today()} onChange={e=>set("due",e.target.value)}/></label>
      <label>Status<select value={t.status||"Not Started"} onChange={e=>set("status",e.target.value as WorkStatus)}>
        {statuses.filter(s=>s!=="Overdue").map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Progress<select value={t.progress??0} onChange={e=>set("progress",Number(e.target.value))}>
        {[0,25,50,75,100].map(p=><option key={p} value={p}>{p}%</option>)}</select></label>
      <label className="wide">Remarks<textarea value={t.remarks||""} onChange={e=>set("remarks",e.target.value)}/></label>
      {!isNew&&t.id&&<div className="wide">
        <Attachments entityType="task" entityId={t.id} flash={flash}/></div>}
      {/* A new task has no id yet, so its documents are collected here and uploaded once
          it exists. Editing an existing one uses the panel above instead. */}
      {isNew&&<label className="wide upload">
        <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
        <Upload/><b>Attach supporting documents</b>
        <small>Images, PDF, Word, Excel, CSV or ZIP — up to 15 MB each</small>
        {files.length>0&&<small className="upload-list">{files.length} file{files.length===1?"":"s"}: {files.map(f=>f.name).join(", ")}</small>}</label>}
    </div>
    <footer>
      {!isNew&&<button type="button" className="wf-danger" onClick={async()=>{
        if(!confirm(`Delete "${t.name}"? The audit entry is kept.`))return;
        try{await wf.api.removeTask(t.id!);flash("Task deleted");close()}
        catch(e){alert(e instanceof Error?e.message:"Could not delete")}}}><Trash2/>Delete</button>}
      <button type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy||!t.name||!t.employeeId}>{busy?"Saving…":isNew?"Assign task":"Save update"}</button>
    </footer>
  </form></>}

/* ---------- token editor ---------- */
export function TokenEditor({token,isNew,close,flash}:{token:Partial<Token>;isNew:boolean;close:()=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [t,setT]=useState<Partial<Token>>(token);
  const [busy,setBusy]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [people,setPeople]=useState<Employee[]>([]);
  const set=<K extends keyof Token>(k:K,v:Token[K])=>setT(p=>{
    const n:Partial<Token>={...p,[k]:v};
    if(k==="done"&&n.qty&&Number(v)>=n.qty){n.done=n.qty;n.status="Completed"}
    if(k==="status"&&v==="Completed"&&n.qty)n.done=n.qty;
    return n});
  const search=async(q:string)=>{if(q.length<2)return setPeople([]);
    try{const r=await wf.api.employees({q,limit:20,active:"1"});setPeople(r.employees)}catch{setPeople([])}};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);
    try{
      const saved=await wf.api.saveToken(t,isNew);
      for(const file of files){
        try{const dataUrl=await asDataUrl(file);
          await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},
            body:JSON.stringify({entityType:"ticket",entityId:saved.id,kind:"Other",fileName:file.name,dataUrl})});
        }catch{}}
      flash(files.length?`${saved.number} saved with ${files.length} document${files.length===1?"":"s"}`:`${saved.number} saved`);
      close()}
    catch(err){flash(err instanceof Error?err.message:"Could not save")}finally{setBusy(false)}};
  return <><button className="overlay" onClick={close}/><form className="modal" onSubmit={submit}>
    <header><div><small>{isNew?"ISSUE TOKEN":"UPDATE TOKEN"}</small><h2>{t.number||"New token"}</h2></div>
      <button type="button" onClick={close}><X/></button></header>
    <div className="form">
      <label className="wide">Task type<input required value={t.taskType||""} onChange={e=>set("taskType",e.target.value)}
        placeholder="e.g. Invoice Entry"/></label>
      <label>Functional head role<select value={t.functionRoleId||""} onChange={e=>set("functionRoleId",e.target.value)}>
        <option value="">— select —</option>
        {wf.allRoles.filter(r=>r.type==="Function"||r.type==="Vertical"||r.type==="Group")
          .map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Created by<input value={t.createdBy===undefined?wf.actor:t.createdBy} onChange={e=>set("createdBy",e.target.value)}/></label>
      <label className="wide">Assigned employee
        <input placeholder="Type a name to search" onChange={e=>search(e.target.value)}/>
        <select value={t.employeeId||""} onChange={e=>set("employeeId",e.target.value)} required>
          <option value="">— select an employee —</option>
          {t.employeeId&&!people.some(p=>p.id===t.employeeId)&&<option value={t.employeeId}>{t.employeeId} (current)</option>}
          {people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Created date<input type="date" value={t.created||today()} onChange={e=>set("created",e.target.value)}/></label>
      <label>Reference / batch<input value={t.reference||""} onChange={e=>set("reference",e.target.value)}/></label>
      <label>Priority<select value={t.priority||"Medium"} onChange={e=>set("priority",e.target.value as Priority)}>
        {priorities.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Status<select value={t.status||"Not Started"} onChange={e=>set("status",e.target.value as WorkStatus)}>
        {statuses.filter(s=>s!=="Overdue").map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="wide">Remarks<textarea value={t.remarks||""} onChange={e=>set("remarks",e.target.value)}/></label>
      {!isNew&&t.id&&<div className="wide">
        <Attachments entityType="ticket" entityId={t.id} flash={flash}/></div>}
      {/* A new token has no id yet, so its documents are collected here and uploaded once
          it exists. Editing an existing one uses the panel above instead. */}
      {isNew&&<label className="wide upload">
        <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
        <Upload/><b>Attach supporting documents</b><small>Images, PDF, Word, Excel, CSV or ZIP — up to 15 MB each</small>
        {files.length>0&&<small className="upload-list">{files.length} file{files.length===1?"":"s"}: {files.map(f=>f.name).join(", ")}</small>}</label>}
    </div>
    <footer>
      {!isNew&&<button type="button" className="wf-danger" onClick={async()=>{
        if(!confirm(`Delete ${t.number}?`))return;
        try{await wf.api.removeToken(t.id!);flash("Token deleted");close()}
        catch(e){alert(e instanceof Error?e.message:"Could not delete")}}}><Trash2/>Delete</button>}
      <button type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy||!t.taskType||!t.employeeId}>{busy?"Saving…":"Save token"}</button>
    </footer>
  </form></>}

/* ---------- query editor ---------- */
export function QueryEditor({query,isNew,close,flash}:{query:Partial<Query>;isNew:boolean;close:()=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [q,setQ]=useState<Partial<Query>>(query);
  const [busy,setBusy]=useState(false);
  const [people,setPeople]=useState<Employee[]>([]);
  const set=<K extends keyof Query>(k:K,v:Query[K])=>setQ(p=>({...p,[k]:v}));
  const search=async(v:string)=>{if(v.length<2)return setPeople([]);
    try{const r=await wf.api.employees({q:v,limit:20,active:"1"});setPeople(r.employees)}catch{setPeople([])}};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);
    try{await wf.api.saveQuery(q,isNew);flash(isNew?"Query raised":"Query updated");close()}
    catch(err){flash(err instanceof Error?err.message:"Could not save")}finally{setBusy(false)}};
  const act=async(action:"follow-up"|"resolve"|"reopen")=>{
    setBusy(true);
    try{await wf.api.queryAction(q.id!,action,q.resolution);
      flash(action==="follow-up"?"Follow-up recorded":action==="resolve"?"Query resolved":"Query reopened");close()}
    catch(err){flash(err instanceof Error?err.message:"Could not update")}finally{setBusy(false)}};

  return <><button className="overlay" onClick={close}/><form className="modal" onSubmit={submit}>
    <header><div><small>{isNew?"RAISE QUERY":q.ref}</small><h2>{q.title||"New query"}</h2></div>
      <button type="button" onClick={close}><X/></button></header>
    <div className="form">
      <label className="wide">Title<input required value={q.title||""} onChange={e=>set("title",e.target.value)}
        placeholder="What is the issue?"/></label>
      <label className="wide">Raised against
        <input placeholder="Type a name to search" onChange={e=>search(e.target.value)}/>
        <select value={q.employeeId||""} onChange={e=>set("employeeId",e.target.value)} required>
          <option value="">— select an employee —</option>
          {q.employeeId&&!people.some(p=>p.id===q.employeeId)&&<option value={q.employeeId}>{q.employeeId} (current)</option>}
          {people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Raised by<input value={q.raisedBy===undefined?wf.actor:q.raisedBy} onChange={e=>set("raisedBy",e.target.value)}/></label>
      <label>Priority<select value={q.priority||"Medium"} onChange={e=>set("priority",e.target.value as Priority)}>
        {priorities.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Status<select value={q.status||"Open"} onChange={e=>set("status",e.target.value as QueryStatus)}>
        {queryStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Response due<input type="date" value={q.dueAt||""} onChange={e=>set("dueAt",e.target.value)}/></label>
      <label className="wide">Detail<textarea value={q.detail||""} onChange={e=>set("detail",e.target.value)}/></label>
      <label className="wide">Resolution<textarea value={q.resolution||""} onChange={e=>set("resolution",e.target.value)}
        placeholder="Filled in when the query is closed out."/></label>
      {!isNew&&<p className="wide wf-note">Followed up <b>{q.followUps||0}</b> time{q.followUps===1?"":"s"}.
        {q.lastFollowUpAt?` Last follow-up ${new Date(q.lastFollowUpAt).toLocaleDateString("en-GB")}.`:""}</p>}
    </div>
    <footer>
      {!isNew&&<div className="wf-query-actions">
        <button type="button" disabled={busy} onClick={()=>act("follow-up")}>Record follow-up</button>
        {q.status==="Resolved"||q.status==="Closed"
          ?<button type="button" disabled={busy} onClick={()=>act("reopen")}>Reopen</button>
          :<button type="button" disabled={busy} onClick={()=>act("resolve")}>Mark resolved</button>}
      </div>}
      <button type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy||!q.title||!q.employeeId}>{busy?"Saving…":isNew?"Raise query":"Save"}</button>
    </footer>
  </form></>}
