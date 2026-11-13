"use client";
/* Pre-audit tasks.

   Nobody creates tasks here: each auditor works from their own task sheet and, once a task
   is done, reports it - vertical, area/process, task title, department, what was done, the
   observations found and any reference files. The auditor's name is filled in and
   locked; the completed date can be set back for work done earlier. The report goes to
   the Audit Head, who accepts it (the task is closed) or rejects it with a reason; a rejected report keeps its record and the auditor
   corrects it and sends it again.

   The Audit Head audits too, and reports his own work the same way - it needs nobody's
   review and is accepted as reported. He sees the whole team's reports, filtered by
   auditor, vertical, area/process, department and date. */

import{useEffect,useMemo,useRef,useState}from"react";
import{CheckCircle2,Download,FileUp,Plus,Search,Trash2,X,XCircle}from"lucide-react";
import{auditTasksApi}from"./audit-api";
import type{AuditRow}from"./audit-api";
import{csv,useAsync}from"./workforce-store";
import{Pager}from"./WorkforceShared";
import Attachments from"./Attachments";
import{PRE_AUDIT_AREAS}from"../lib/pre-audit-areas";
const AREAS:readonly string[]=PRE_AUDIT_AREAS;

const HEAD_ROLES=["Audit Head","Administrator"];
const LIMIT=25;
const req=<i className="pa-req" aria-hidden="true">*</i>;
const opt=<i className="field-optional">optional</i>;
/* Today in India, as the server dates a report. */
const indiaToday=()=>new Date(Date.now()+330*60_000).toISOString().slice(0,10);
const uniq=(xs:string[])=>[...new Set(xs.map(x=>(x||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const day=(d:string)=>d?new Date(`${d.slice(0,10)}T00:00:00`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";
const when=(iso:string)=>iso?new Date(iso).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
type Step={by:string;at:string;action:string;note?:string};
const listOf=<T,>(v?:string):T[]=>{try{const r=JSON.parse(v||"[]");return Array.isArray(r)?r:[]}catch{return[]}};
const tone=(s:string)=>s==="Accepted"?"green":s==="Rejected"?"red":"amber";
const label=(s:string)=>s==="Reported"?"Waiting for review":s;

type Status="Reported"|"Accepted"|"Rejected";
type Catalogue={tasks:{entity:string;title:string}[]};

export default function PreAuditDesk({role,departments,userName,flash,changed}:{role:string;departments:string[];
  userName:string;flash:(m:string)=>void;changed?:()=>void}){
  const head=HEAD_ROLES.includes(role);
  const[tab,setTab]=useState<Status>("Reported");
  const[version,setVersion]=useState(0);
  const reload=()=>{setVersion(v=>v+1);changed?.()};

  const[raw,setRaw]=useState(""),[q,setQ]=useState("");
  const[auditor,setAuditor]=useState(""),[project,setProject]=useState(""),[vertical,setVertical]=useState(""),[dept,setDept]=useState("");
  const[from,setFrom]=useState(""),[to,setTo]=useState(""),[offset,setOffset]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>{setQ(raw);setOffset(0)},300);return()=>clearTimeout(t)},[raw]);
  const filters={kind:"Pre-Audit",q,assignedTo:auditor,project,entity:vertical,department:dept,from,to};
  const list=useAsync(()=>auditTasksApi.load({...filters,status:tab,limit:LIMIT,offset}),
    [tab,q,auditor,project,vertical,dept,from,to,offset,version]);
  /* The count on each tab, under the same filters. */
  const counts=useAsync(async()=>{const n=await Promise.all((["Reported","Accepted","Rejected"] as Status[])
      .map(s=>auditTasksApi.load({...filters,status:s,limit:1}).then(d=>d.total)));
    return{Reported:n[0],Accepted:n[1],Rejected:n[2]} as Record<Status,number>},
    [q,auditor,project,vertical,dept,from,to,version]);
  const rows=list.data?.tasks||[],total=list.data?.total||0;

  /* The filter and form choices. */
  const catalogue=useAsync(()=>fetch("/api/task-catalogue").then(r=>r.json()) as Promise<Catalogue&{auditors:{name:string}[]}>,[]);
  const verticals=uniq([...(catalogue.data?.tasks||[]).map(t=>t.entity),...rows.map(t=>t.entity||""),vertical]);
  const projects=[...AREAS,...uniq([...rows.map(t=>t.project||""),project]).filter(p=>!AREAS.includes(p))];
  const depts=uniq([...departments,...rows.map(t=>t.department),dept]);
  const auditors=uniq([...(catalogue.data?.auditors||[]).map(a=>a.name),...rows.map(t=>t.assignedTo),auditor]);

  const[reporting,setReporting]=useState<AuditRow|"new"|null>(null),[viewing,setViewing]=useState<AuditRow|null>(null),
    [exporting,setExporting]=useState(false);
  const filtered=!!(auditor||project||vertical||dept||from||to||raw);
  const clear=()=>{setAuditor("");setProject("");setVertical("");setDept("");setFrom("");setTo("");setRaw("");setOffset(0)};

  /* The download covers the tab and filters on screen, up to 1,000 reports. */
  const download=async()=>{setExporting(true);
    try{
      const all:AuditRow[]=[];
      for(let off=0;off<1000;off+=200){
        const d=await auditTasksApi.load({...filters,status:tab,limit:200,offset:off});
        all.push(...d.tasks);if(off+200>=d.total)break}
      csv([["Task no.","Task title","Vertical","Area/Process","Department",...(head?["Task done by"]:[]),"Task completed date","Status",
        "Description","Observations","Reviewed by","Reviewed on","Rejection reason"],
        ...all.map(t=>[t.ref,t.title,t.entity||"",t.project||"",t.department,...(head?[t.assignedTo]:[]),t.completedOn||"",label(t.status),
          t.workDescription||"",t.observations||"",t.reviewedBy||"",t.reviewedAt?when(t.reviewedAt):"",t.rejectReason||""])],
        `pre-audit-${tab.toLowerCase()}-${indiaToday()}.csv`);
      flash(`Downloaded ${all.length} report${all.length===1?"":"s"}`)}
    catch(e){flash(e instanceof Error?e.message:"Could not build the download")}
    finally{setExporting(false)}};

  const tabs:[Status,string][]=[["Reported",head?"To review":"Reported tasks"],["Accepted","Accepted"],["Rejected","Rejected"]];
  const set=(f:(v:string)=>void)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{f(e.target.value);setOffset(0)};

  return <div className="page audit-list-page">
    <div className="intro"><div><small>AUDIT DEPARTMENT</small><h2>Pre-audit tasks</h2>
      <p>{head?"Review what the team reported, and report your own work."
        :"Finished a task from your sheet? Report it here for the Audit Head to accept."}</p></div>
      <div className="audit-list-actions">
        <button disabled={exporting||!total} onClick={download}><Download/>{exporting?"Preparing…":"Download"}</button>
        <button className="primary" onClick={()=>setReporting("new")}><Plus/>Report task completion</button>
      </div></div>

    <section className="panel audit-list">
      <div className="audit-list-tabs">{tabs.map(([k,l])=>
        <button key={k} className={tab===k?"active":""} onClick={()=>{setTab(k);setOffset(0)}}>{l}<i>{counts.data?.[k]??"…"}</i></button>)}</div>
      <div className="audit-list-tools pa-filters">
        <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Search task, vertical, area/process or description"/></label>
        {head&&<select value={auditor} onChange={set(setAuditor)} aria-label="Auditor">
          <option value="">All auditors</option>{auditors.map(a=><option key={a}>{a}</option>)}</select>}
        <select value={vertical} onChange={set(setVertical)} aria-label="Vertical">
          <option value="">All verticals</option>{verticals.map(p=><option key={p}>{p}</option>)}</select>
        <select value={project} onChange={set(setProject)} aria-label="Area/Process">
          <option value="">All areas/processes</option>{projects.map(p=><option key={p}>{p}</option>)}</select>
        <select value={dept} onChange={set(setDept)} aria-label="Department">
          <option value="">All departments</option>{depts.map(p=><option key={p}>{p}</option>)}</select>
        <label className="pa-date">From<input type="date" value={from} max={to||undefined} onChange={set(setFrom)}/></label>
        <label className="pa-date">To<input type="date" value={to} min={from||undefined} onChange={set(setTo)}/></label>
        <button type="button" className={from===indiaToday()&&to===indiaToday()?"pa-chip on":"pa-chip"}
          onClick={()=>{const d=indiaToday();setFrom(d);setTo(d);setOffset(0)}}>Today</button>
        {filtered&&<button type="button" className="pa-chip" onClick={clear}>Clear</button>}
      </div>
      <div className="table-wrap"><table><thead><tr><th>TASK</th><th>VERTICAL</th><th>AREA/PROCESS</th><th>DEPARTMENT</th>
        {head&&<th>TASK DONE BY</th>}<th>COMPLETED ON</th><th>STATUS</th><th>ACTION</th></tr></thead>
        <tbody>{rows.map(t=><tr key={t.id} className="pa-row" onClick={()=>setViewing(t)}>
          <td><b>{t.ref}</b><small>{t.title}</small></td>
          <td>{t.entity||"—"}</td>
          <td>{t.project||"—"}</td>
          <td>{t.department||"—"}</td>
          {head&&<td>{t.assignedTo||"—"}</td>}
          <td><b>{day(t.completedOn||t.completedAt)}</b></td>
          <td><span className={`badge ${tone(t.status)}`}>{label(t.status)}</span>
            {t.status==="Rejected"&&t.rejectReason&&<small className="pa-clip">{t.rejectReason}</small>}
            {t.status!=="Reported"&&t.reviewedBy&&<small>by {t.reviewedBy}</small>}
            {/* A report rejected and sent again keeps its rejection on record. */}
            {t.status!=="Rejected"&&(()=>{const n=listOf<Step>(t.history).filter(s=>s.action==="Rejected").length;
              return n?<small className="pa-was">Rejected {n===1?"once":`${n} times`} before</small>:null})()}</td>
          <td><button className="wb-next" onClick={e=>{e.stopPropagation();
              if(!head&&t.status==="Rejected")setReporting(t);else setViewing(t)}}>
            {head&&t.status==="Reported"?"Review":!head&&t.status==="Rejected"?"Edit & resubmit":"View"}</button></td>
        </tr>)}</tbody></table>
        {list.error?<div className="wb-empty"><b>Could not load the reports</b><span>{list.error}</span></div>
        :!rows.length&&!list.loading&&<div className="wb-empty"><CheckCircle2/>
          <b>{filtered?"Nothing matches these filters":tab==="Reported"?(head?"Nothing waiting for review":"Nothing waiting for review")
            :tab==="Accepted"?"Nothing accepted yet":"Nothing rejected"}</b>
          <span>{filtered?"Change or clear the filters.":tab==="Reported"
            ?(head?"Reports from the auditors appear here.":"Use Report task completion when you finish a task.")
            :"Reports appear here once the Audit Head has reviewed them."}</span></div>}</div>
      <Pager total={total} limit={LIMIT} offset={offset} setOffset={setOffset}/>
    </section>

    {reporting&&<ReportForm task={reporting==="new"?null:reporting} userName={userName} head={head}
      verticals={uniq((catalogue.data?.tasks||[]).map(t=>t.entity))} catalogue={catalogue.data?.tasks||[]}
      departments={uniq(departments)} close={()=>setReporting(null)}
      saved={(m,next)=>{setReporting(null);flash(m);setTab(next);setOffset(0);reload()}}/>}
    {viewing&&<ReportView task={viewing} head={head} close={()=>setViewing(null)} flash={flash}
      edit={()=>{setReporting(viewing);setViewing(null)}}
      saved={(t,m)=>{setViewing(t);flash(m);reload()}}
      removed={m=>{setViewing(null);flash(m);reload()}}/>}
  </div>}

/* Reporting a finished task, or correcting a rejected one. The auditor is filled in and
   locked - the server takes it from the sign-in. The completed date starts at today and can
   be set back for work done earlier, never forward. */
function ReportForm({task,userName,head,verticals,catalogue,departments,close,saved}:{task:AuditRow|null;userName:string;head:boolean;
  verticals:string[];catalogue:{entity:string;title:string}[];departments:string[];
  close:()=>void;saved:(m:string,tab:Status)=>void}){
  const[f,setF]=useState({project:AREAS.includes(task?.project||"")?task!.project:"",entity:task?.entity||"",title:task?.title||"",department:task?.department||"",
    workDescription:task?.workDescription||"",observations:task?.observations||"",
    completedOn:task?.completedOn||indiaToday()});
  const[files,setFiles]=useState<File[]>([]);
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const input=useRef<HTMLInputElement>(null);
  const set=(k:keyof typeof f)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setF(x=>({...x,[k]:e.target.value}));
  const titles=useMemo(()=>uniq(catalogue.filter(t=>!f.entity||t.entity===f.entity).map(t=>t.title)),[catalogue,f.entity]);
  const steps=listOf<Step>(task?.history).filter(s=>s.action==="Rejected");

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{
      const t=task?await auditTasksApi.update({id:task.id,action:"resubmit",...f} as never)
        :await auditTasksApi.create({kind:"Pre-Audit",...f} as never);
      /* Reference files go up once the report exists to hold them. One that fails is named;
         the report itself is already saved. */
      const failed:string[]=[];
      for(const file of files){
        try{
          const dataUrl=await new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>no(r.error);r.readAsDataURL(file)});
          const res=await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},
            body:JSON.stringify({entityType:"audit-task",entityId:t.id,kind:"Other",note:"Reference file",fileName:file.name,dataUrl})});
          if(!res.ok)throw new Error(((await res.json().catch(()=>({}))) as {error?:string}).error||file.name)}
        catch(x){failed.push(x instanceof Error?x.message:file.name)}}
      const next:Status=t.status==="Accepted"?"Accepted":"Reported";
      saved(`${t.ref} ${task?"sent again":head?"recorded":"reported to the Audit Head"}`+
        (failed.length?`. Not attached: ${failed.join("; ")}`:""),next)}
    catch(x){setErr(x instanceof Error?x.message:"Could not save the report");setBusy(false)}};

  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>{task?`EDIT & RESUBMIT · ${task.ref}`:"PRE-AUDIT"}</small><h2>{task?task.title:"Report task completion"}</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        {steps.length>0&&<div className="wide pa-rejected">{steps.map((s,i)=><p key={i}><b>Rejected by {s.by} · {when(s.at)}</b><span>{s.note}</span></p>)}</div>}
        <label>Vertical {req}
          <select required value={f.entity} onChange={set("entity")}>
            <option value="">Select vertical</option>{uniq([...verticals,f.entity]).map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Area/Process {req}
          <select required value={f.project} onChange={set("project")}>
            <option value="">Select area/process</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select></label>
        <label className="wide">Task title {req}
          <input required list="pa-titles" value={f.title} onChange={set("title")} placeholder="Choose a task, or type it as it is on your sheet"/>
          <datalist id="pa-titles">{titles.map(t=><option key={t} value={t}/>)}</datalist></label>
        <label>Department {req}
          <select required value={f.department} onChange={set("department")}>
            <option value="">{departments.length?"Select department":"Loading departments…"}</option>
            {uniq([...departments,f.department]).map(d=><option key={d}>{d}</option>)}</select></label>
        <Locked label="Task done by" value={task?.assignedTo||userName||"You"}/>
        <label>Task completed date {req}
          <input required type="date" value={f.completedOn} max={indiaToday()} onChange={set("completedOn")}/></label>
        <label className="wide">Description {req}
          <textarea required value={f.workDescription} onChange={set("workDescription")}
            placeholder="What was checked, against what evidence, and the result"/></label>
        <label className="wide">Observations {opt}
          <textarea value={f.observations} onChange={set("observations")}
            placeholder="What was found that needs attention. Leave empty if nothing was found."/></label>
        <div className="wide"><span className="pa-label">Reference files <em className="pa-opt">optional</em></span>
          <div className="pa-files">
            <button type="button" className="pa-chip" onClick={()=>input.current?.click()}><FileUp/>Add files</button>
            <input ref={input} type="file" multiple hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
              onChange={e=>{const add=Array.from(e.target.files||[]);setFiles(v=>[...v,...add]);e.target.value=""}}/>
            {files.map((x,i)=><span key={i} className="wf-tag on">{x.name}
              <button type="button" aria-label={`Remove ${x.name}`} onClick={()=>setFiles(v=>v.filter((_,j)=>j!==i))}>×</button></span>)}
            {!files.length&&<span className="pa-hint">{task?"Files already attached stay; add more here.":"PDF, images, Word, Excel, CSV or ZIP."}</span>}
          </div></div>
        <p className="wide pa-note">{head?"Your own work is recorded as accepted.":"The Audit Head is told, and accepts or rejects it."}
          {" "}Observations are also added to the observation register.</p>
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy}><CheckCircle2/>{busy?"Saving…":task?"Resubmit":"Report"}</button></footer>
    </form></>}

function Locked({label,value,wide}:{label:string;value:string;wide?:boolean}){
  return <label className={wide?"wide":undefined}>{label}<input readOnly tabIndex={-1} className="pa-locked" value={value}/></label>}

/* A report as filed, with its files and its review history. The Audit Head accepts or
   rejects one waiting for review; the auditor can correct a rejected one. */
function ReportView({task,head,close,saved,edit,flash,removed}:{task:AuditRow;head:boolean;close:()=>void;flash:(m:string)=>void;
  saved:(t:AuditRow,m:string)=>void;edit:()=>void;removed:(m:string)=>void}){
  const[rejecting,setRejecting]=useState(false),[reason,setReason]=useState(""),[deleting,setDeleting]=useState(false);
  /* The Audit Head removes a report outright; its observation stays in the register. */
  const remove=async()=>{setBusy(true);setErr("");
    try{await auditTasksApi.remove(task.id);removed(`${task.ref} deleted`)}
    catch(x){setErr(x instanceof Error?x.message:"Could not delete it");setBusy(false)}};
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const steps=listOf<Step>(task.history);
  const review=head&&task.status==="Reported";
  const decide=async(action:"accept"|"reject")=>{
    if(action==="reject"&&!reason.trim()){setErr("Write the reason for rejecting it.");return}
    setBusy(true);setErr("");
    try{const t=await auditTasksApi.update({id:task.id,action,reason:reason.trim()} as never);
      setRejecting(false);setReason("");setBusy(false);
      saved(t,`${task.ref} ${action==="accept"?"accepted - the task is closed":"rejected - the auditor has been told"}`)}
    catch(x){setErr(x instanceof Error?x.message:"That did not work");setBusy(false)}};
  return <><button className="overlay" onClick={close}/>
    <div className="modal pa-view">
      <header><div><small>{task.ref} · <span className={`badge ${tone(task.status)}`}>{label(task.status)}</span></small><h2>{task.title}</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <Locked label="Vertical" value={task.entity||"—"}/>
        <Locked label="Area/Process" value={task.project||"—"}/>
        <Locked label="Department" value={task.department||"—"}/>
        <Locked label="Task done by" value={task.assignedTo||"—"}/>
        <Locked label="Task completed date" value={day(task.completedOn||task.completedAt)}/>
        <Locked label="Reported on" value={when(task.completedAt||"")}/>
        <Locked label="Reviewed" value={task.status!=="Reported"&&task.reviewedBy?`${task.reviewedBy} · ${when(task.reviewedAt||"")}`:"Not yet"}/>
        <div className="wide pa-text"><span>Description</span><p>{task.workDescription||"—"}</p></div>
        <div className="wide pa-text"><span>Observations</span><p>{task.observations||"None"}</p></div>
        <div className="wide"><Attachments entityType="audit-task" entityId={task.id} flash={flash} readOnly canRemove={false}/></div>
        {steps.length>0&&<div className="wide"><span className="pa-label">History</span>
          <div className="pa-remarks">{steps.map((s,i)=><p key={i} className={s.action==="Rejected"?"pa-bad":undefined}>
            <b>{s.action}{s.note?` - ${s.note}`:""}</b><span>{s.by} · {when(s.at)}</span></p>)}</div></div>}
        {review&&rejecting&&<label className="wide">Reason for rejecting {req}
          <textarea autoFocus value={reason} onChange={e=>setReason(e.target.value)} placeholder="What is wrong or missing, so the auditor can correct it"/></label>}
        {deleting&&<div className="wide pa-rejected"><p><b>Delete {task.ref} for good?</b>
          <span>The report, its history and its review are removed. Any observation it raised stays in the observation register.</span></p></div>}
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer>
        {head&&deleting?<><button type="button" onClick={()=>{setDeleting(false);setErr("")}}>Back</button>
          <button type="button" className="pa-reject" disabled={busy} onClick={remove}><Trash2/>{busy?"Deleting…":"Delete"}</button></>
        :<>{head&&!rejecting&&<button type="button" className="pa-reject pa-delete" onClick={()=>setDeleting(true)}><Trash2/>Delete</button>}
        {review?(rejecting
          ?<><button type="button" onClick={()=>{setRejecting(false);setErr("")}}>Back</button>
            <button type="button" className="pa-reject" disabled={busy||!reason.trim()} onClick={()=>decide("reject")}><XCircle/>{busy?"Saving…":"Reject"}</button></>
          :<><button type="button" className="pa-reject" onClick={()=>setRejecting(true)}><XCircle/>Reject</button>
            <button type="button" className="primary" disabled={busy} onClick={()=>decide("accept")}><CheckCircle2/>{busy?"Saving…":"Accept"}</button></>)
        :!head&&task.status==="Rejected"
          ?<><button type="button" onClick={close}>Close</button><button type="button" className="primary" onClick={edit}>Edit &amp; resubmit</button></>
          :<button type="button" onClick={close}>Close</button>}</>}
      </footer>
    </div></>}
