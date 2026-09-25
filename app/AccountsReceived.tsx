"use client";

/* Accounts Receivable.

   Named "Accounts received" when it was first stood up, which described the opposite
   movement of money - a receipt already collected, rather than an amount still owed to
   the company. The label is the accounting term now; the file and module key keep the
   original spelling because renaming them buys nothing a reader can see.

   Four modules, one tab each: Job Notification, Planning & Procurement, Completion and
   Billing, Debt Collection. Job Notification's flow is: a job is notified, it is created
   in CRM, a sales order is cut against it, and audit verifies the three agree. lib/receivable-stages.ts holds the stages and
   who may act at each; this screen only shows what that model already decided, so a
   button never appears for a role the server would refuse. */

import{useMemo,useState}from"react";
import{ArrowLeft,ArrowRight,Building2,CheckCircle2,ClipboardList,FileCheck2,HandCoins,Megaphone,Plus,RotateCcw,Search,ShieldCheck,Trash2,X}from"lucide-react";
import{planningApi,receivablesApi}from"./audit-api";
import{useOptions}from"./options-store";
import Attachments,{asDataUrl}from"./Attachments";
import FilePicker from"./FilePicker";
import type{Receivable}from"./audit-api";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import{ACTION_LABEL,JOB_DEPARTMENTS,RETURNABLE_TO,STAGES,isVerified,mayAct,stageIndex}from"../lib/receivable-stages";
import type{Stage}from"../lib/receivable-stages";
import PlanningProcurement from"./PlanningProcurement";
import CompletionBilling from"./CompletionBilling";
import DebtCollection from"./DebtCollection";
import{RECEIVABLE_ROLES}from"../lib/planning-stages";

type Props={role:string;userEmail?:string;companies?:{id:string;name:string}[];flash?:(m:string)=>void};

const money=(n:number,c:string)=>n?`${c} ${n.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—";
const when=(iso:string)=>iso?new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—";

/* The four modules of Accounts Receivable, in the order a job moves through them. Each
   has a flow of its own; Job Notification carries the register that existed before the
   split, and the other three are PlanningProcurement, CompletionBilling and DebtCollection. */
const MODULES=[
  {id:"job",label:"Job Notification",icon:Megaphone,
    blurb:"A job is notified, created in CRM, a sales order is cut against it, and audit verifies the three agree."},
  {id:"planning",label:"Planning & Procurement",icon:ClipboardList,
    blurb:"Planning the job and procuring what it needs."},
  {id:"billing",label:"Completion and Billing",icon:FileCheck2,
    blurb:"Confirming the work is complete and billing the customer for it."},
  {id:"collection",label:"Debt Collection",icon:HandCoins,
    blurb:"Following up and collecting what the customer owes."}] as const;
type ModuleId=typeof MODULES[number]["id"];
const MODULE_KEY="ar-module";

export default function AccountsReceived(props:Props){
  /* The module last opened is remembered on this device only - a convenience, so it is
     read and written defensively and the screen works without it. */
  const[mod,setMod]=useState<ModuleId>(()=>{
    try{const v=localStorage.getItem(MODULE_KEY);return MODULES.some(m=>m.id===v)?v as ModuleId:"job"}
    catch{return"job"}});
  const pick=(id:ModuleId)=>{setMod(id);try{localStorage.setItem(MODULE_KEY,id)}catch{}};
  /* Who sees which modules. Accounts and audit see all four. Cost control and management
     act only in Completion and Billing. Anybody else is here as a project manager, and
     sees the two modules a manager works in, each showing only their own jobs. */
  const tabs=RECEIVABLE_ROLES.includes(props.role)?MODULES
    :["Cost Control","Management"].includes(props.role)?MODULES.filter(m=>m.id==="billing")
    :MODULES.filter(m=>m.id==="planning"||m.id==="billing");
  const shownMod:ModuleId=tabs.some(m=>m.id===mod)?mod:tabs[0].id;
  return <div className="page recv">
    <div className="intro"><div><small>ACCOUNTS</small><h2>Accounts Receivable</h2>
      <p>From the job notification through to collecting what is owed, in four modules.</p></div></div>
    <nav className="recv-modules" aria-label="Accounts Receivable modules">
      {tabs.map(m=><button key={m.id} className={m.id===shownMod?"on":""} aria-current={m.id===shownMod?"page":undefined}
        onClick={e=>{pick(m.id);e.currentTarget.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"})}}><m.icon/><span><i>{MODULES.indexOf(m)+1}</i>{m.label}</span></button>)}
    </nav>
    {shownMod==="job"?<JobNotification {...props}/>
      :shownMod==="planning"?<PlanningProcurement role={props.role} userEmail={props.userEmail} flash={props.flash}/>
      :shownMod==="billing"?<CompletionBilling role={props.role} userEmail={props.userEmail} flash={props.flash}/>
      :<DebtCollection role={props.role} flash={props.flash}/>}
  </div>}

function JobNotification({role,companies=[],flash}:Props){
  const[stage,setStage]=useState<string>("All stages"),[q,setQ]=useState(""),
    [open,setOpen]=useState<Receivable|null>(null),[form,setForm]=useState(false),
    /* Bumped after every write. The register is the server's copy, so a move is
       followed by a re-read rather than by patching the row in two places. */
    [version,setVersion]=useState(0);
  const reload=()=>setVersion(v=>v+1);
  const{data,loading,error}=useAsync(()=>receivablesApi.load({limit:200}),[version]);
  const rows=useMemo(()=>data?.receivables||[],[data]);

  /* Filtering here rather than on the server: the register is small, and a stage
     click that does not go to the network keeps the counts and the list in step. */
  const shown=useMemo(()=>rows.filter(r=>
    (stage==="All stages"||r.stage===stage)&&
    (!q.trim()||[r.ref,r.customer,r.crmJobNo,r.soNo,r.description]
      .join(" ").toLowerCase().includes(q.trim().toLowerCase()))),[rows,stage,q]);
  const counts=useMemo(()=>{
    const c:Record<string,number>={};
    STAGES.forEach(s=>c[s]=0);
    rows.forEach(r=>c[r.stage]=(c[r.stage]||0)+1);
    return c},[rows]);

  const canRaise=mayAct("Job Notification",[role]);
  /* Deleting is an administrator's alone, and the server checks it again. */
  const admin=role==="Administrator";
  const[deleting,setDeleting]=useState("");
  const remove=async(r:Receivable)=>{
    if(!confirm(`Delete ${r.ref}${r.jobName||r.description?` (${r.jobName||r.description})`:""}?\n\nThe job notification and every document attached to it are removed for everybody. This cannot be undone.`))return;
    setDeleting(r.id);
    try{const b=await receivablesApi.remove(r.id);
      if(open?.id===r.id)setOpen(null);
      reload();flash?.(`${b.ref} deleted${b.documents?` with ${b.documents} document${b.documents===1?"":"s"}`:""}`)}
    catch(e){flash?.(e instanceof Error?e.message:"It could not be deleted")}
    finally{setDeleting("")}};
  const save=(r:Receivable)=>{setOpen(r);reload()};

  return <div className="recv-module">
    <div className="recv-subhead"><p>{MODULES[0].blurb}</p>
      {canRaise&&<button className="primary" onClick={()=>setForm(true)}><Plus/>New job notification</button>}</div>

    {/* The flow itself, as a row of stages. Clicking one filters the list, so the
        pipeline doubles as the navigation rather than being a picture beside it. */}
    <div className="recv-flow">
      {STAGES.map((s,i)=><button key={s} className={stage===s?"recv-stage on":"recv-stage"}
        onClick={()=>setStage(stage===s?"All stages":s)}>
        <b>{counts[s]||0}</b><span>{s}</span>
        {i<STAGES.length-1&&<ArrowRight className="recv-arrow"/>}</button>)}
    </div>

    <section className="panel">
      <header className="recv-head">
        <h3>{stage==="All stages"?"All entries":stage}<i>{shown.length}</i></h3>
        <label className="recv-search"><Search/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Reference, customer, CRM job or SO number"/>
          {q&&<button onClick={()=>setQ("")} aria-label="Clear search"><X/></button>}</label>
        {stage!=="All stages"&&<button className="ghost" onClick={()=>setStage("All stages")}>Show all stages</button>}
      </header>

      {error?<ErrorBlock message={error} retry={reload}/>
      :loading?<Loading label="Loading the register"/>
      :!rows.length?<Empty label={canRaise
        ?"Nothing raised yet. Raise the first job notification when a job comes in."
        :"Nothing raised yet. Accounts raise a job notification when a job comes in."}/>
      :!shown.length?<Empty label="No entry matches that."/>
      :<div className="recv-rows">
        {/* Column names, on the same grid as the rows beneath, so each figure is read
            against a heading rather than guessed at. */}
        <div className={admin?"recv-cols with-del":"recv-cols"} aria-hidden="true"><span>Reference</span><span>Description</span>
          <span>CRM job / SO</span><span className="num">Amount</span><span className="num">Status</span>{admin&&<span/>}</div>
        {shown.map(r=>
        /* A row is not a <button> any more, because a delete button cannot sit inside one;
           it still opens on click, Enter or Space. */
        <div key={r.id} role="button" tabIndex={0} className={admin?"recv-row with-del":"recv-row"} onClick={()=>setOpen(r)}
          onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setOpen(r)}}}>
          <div className="recv-ref"><b>{r.ref}</b><small>{r.customer}</small></div>
          <div className="recv-desc">{r.description||"—"}
            {r.returnNote&&<i className="recv-back"><RotateCcw/>Sent back: {r.returnNote}</i>}</div>
          <div className="recv-nums"><span><i>CRM</i>{r.crmJobNo||"Pending"}</span>
            <span><i>SO</i>{r.soNo||"Pending"}</span></div>
          <div className="recv-amt">{money(r.amount,r.currency)}</div>
          <div className={`recv-tag s${stageIndex(r.stage)}`}>
            {isVerified(r.stage)&&<CheckCircle2/>}{r.stage}</div>
          {admin&&<button type="button" className="recv-del" title={`Delete ${r.ref}`} aria-label={`Delete ${r.ref}`}
            disabled={deleting===r.id} onClick={e=>{e.stopPropagation();remove(r)}}><Trash2/></button>}
        </div>)}</div>}
    </section>

    {open&&<Detail row={open} role={role} companies={companies} close={()=>setOpen(null)}
      saved={(r,msg)=>{save(r);flash?.(msg)}} reload={reload}/>}
    {form&&<NewEntry companies={companies}
      customers={[...new Set(rows.map(r=>r.customer).filter(Boolean))]} close={()=>setForm(false)}
      added={r=>{setForm(false);reload();setOpen(r);flash?.(`${r.ref} raised`)}}/>}
  </div>}

/* One entry, and the single action its stage allows. The form the action needs is
   part of the same panel: recording the CRM job and moving to the sales order stage
   are one step for the person doing it, so they are one step here too. */
function Detail({row,role,companies,close,saved,reload}:{row:Receivable;role:string;
  companies:{id:string;name:string}[];close:()=>void;saved:(r:Receivable,msg:string)=>void;reload:()=>void}){
  const[fields,setFields]=useState<Partial<Receivable>>({});
  const[note,setNote]=useState(""),[back,setBack]=useState<string>("");
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const at=row.stage as Stage,mine=mayAct(at,[role]),done=isVerified(at);
  const set=(k:keyof Receivable,v:string|number)=>setFields(f=>({...f,[k]:v}));
  const company=companies.find(c=>c.id===row.companyId)?.name||row.companyId||"—";

  const run=async(fn:()=>Promise<Receivable>,msg:string)=>{
    setBusy(true);setErr("");
    try{saved(await fn(),msg)}
    catch(e){const m=e instanceof Error?e.message:"That did not go through";setErr(m);
      /* A stale row is the one failure the screen can fix by itself: reload so the
         person sees where the entry actually is instead of pressing again. */
      if(m.includes("Somebody else moved"))reload()}
    finally{setBusy(false)}};

  return <div className="recv-drawer" role="dialog" aria-label={`${row.ref} details`}>
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside>
      <header><div><small>{row.ref}</small><h3>{row.customer}</h3></div>
        <button onClick={close} aria-label="Close"><X/></button></header>

      <div className={`recv-tag s${stageIndex(row.stage)} big`}>
        {done&&<CheckCircle2/>}{row.stage}</div>
      {row.returnNote&&<p className="recv-back-note"><RotateCcw/><span>
        <b>Sent back by audit:</b> {row.returnNote}</span></p>}

      <dl className="recv-facts">
        <div><dt>Company</dt><dd><Building2/>{company}</dd></div>
        <div><dt>Department</dt><dd>{row.department||"—"}</dd></div>
        <div><dt>Notified on</dt><dd>{when(row.notifiedOn)}</dd></div>
        <div><dt>Job</dt><dd>{row.jobName||row.description||"—"}{row.jobCode?` · ${row.jobCode}`:""}</dd></div>
        {/* Where the notification goes from here - set by the flow, not by anyone. */}
        <div><dt>Next process</dt><dd>{done?"None - verified":`${STAGES[stageIndex(row.stage)+1]} · ${ACTION_LABEL[at]}`}</dd></div>
        {!!row.projectName&&<div><dt>Project / contract</dt><dd>{row.projectName}</dd></div>}
        {!!row.jobType&&<div><dt>Job type</dt><dd>{row.jobType} · {row.priority} priority</dd></div>}
        {!!row.jobLocation&&<div><dt>Location</dt><dd>{row.jobLocation}</dd></div>}
        {!!row.pmName&&<div><dt>Project manager</dt><dd>{row.pmName}</dd></div>}
        {(!!row.startDate||!!row.endDate)&&<div><dt>Schedule</dt><dd>{when(row.startDate)} → {when(row.endDate)}</dd></div>}
        {!!row.poNumber&&<div><dt>Contract number</dt><dd>{row.poNumber}</dd></div>}
        {!!row.contractValue&&<div><dt>Contract value</dt><dd>{money(row.contractValue,row.contractCurrency)}</dd></div>}
        {!!row.scope&&<div><dt>Scope of work</dt><dd className="recv-pre">{row.scope}</dd></div>}
        {!!row.boqAvailable&&<div><dt>BOQ / budget</dt><dd>{row.boqAvailable==="Yes"?"Available":"Not available"}</dd></div>}
        {!!row.managementApproval&&<div><dt>Management approval</dt><dd>{row.managementApproval}</dd></div>}
        {!!row.remarksNote&&<div><dt>Remarks</dt><dd className="recv-pre">{row.remarksNote}</dd></div>}
        <div><dt>CRM job</dt><dd>{row.crmJobNo||"Not created yet"}{row.crmOwner&&` · ${row.crmOwner}`}</dd></div>
        <div><dt>Sales order</dt><dd>{row.soNo||"Not raised yet"}</dd></div>
        <div><dt>Amount</dt><dd>{money(row.amount,row.currency)}</dd></div>
        {!!row.submittedAt&&<div><dt>Sent for audit</dt><dd>{when(row.submittedAt)}</dd></div>}
        {done&&<div><dt>Verified</dt><dd><ShieldCheck/>{row.verifiedBy} · {when(row.verifiedAt)}</dd></div>}
        {done&&!!row.remarks&&<div><dt>Audit remarks</dt><dd>{row.remarks}</dd></div>}
      </dl>

      {err&&<p className="recv-error">{err}</p>}

      {done?<p className="recv-empty">Verified. Nothing further is expected on this entry.</p>
      :!mine?<p className="recv-empty">This entry is with {at==="Audit Verification"?"audit":"accounts"}.
        Your role cannot act on it at this stage.</p>
      :<div className="recv-act">
        {at==="Job Notification"&&<>
          <label>CRM job number<input autoFocus value={String(fields.crmJobNo??"")}
            onChange={e=>set("crmJobNo",e.target.value)} placeholder="e.g. CRM-2026-0481"/></label>
          <label>CRM job owner<input value={String(fields.crmOwner??"")}
            onChange={e=>set("crmOwner",e.target.value)} placeholder="Defaults to you"/></label></>}
        {at==="CRM JOB Creation"&&<>
          <label>Sales order number<input autoFocus value={String(fields.soNo??"")}
            onChange={e=>set("soNo",e.target.value)} placeholder="e.g. SO-2026-1187"/></label>
          <div className="recv-two">
            <label>Amount<input type="number" min="0" step="0.01" value={String(fields.amount??"")}
              onChange={e=>set("amount",e.target.value)}/></label>
            <label>Currency<input value={String(fields.currency??row.currency)}
              onChange={e=>set("currency",e.target.value)}/></label></div></>}
        {at==="Sales Order"&&<p className="recv-hint">The job, the CRM entry and the sales
          order go to audit together. Audit can send it back to any of the three stages.</p>}
        {at==="Audit Verification"&&<label>Audit remarks<textarea rows={2} value={String(fields.remarks??"")}
          onChange={e=>set("remarks",e.target.value)} placeholder="Optional"/></label>}

        <button className="primary" disabled={busy}
          onClick={()=>run(()=>receivablesApi.advance(row.id,fields),
            `${row.ref}: ${ACTION_LABEL[at].toLowerCase()} done`)}>
          {busy?"Saving…":ACTION_LABEL[at]}<ArrowRight/></button>

        {at==="Audit Verification"&&<div className="recv-return">
          <b><ArrowLeft/>Send back for correction</b>
          <select value={back} onChange={e=>setBack(e.target.value)}>
            <option value="">Choose the stage to send it back to…</option>
            {RETURNABLE_TO.map(s=><option key={s} value={s}>{s}</option>)}</select>
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}
            placeholder="What needs correcting? Accounts see this on the entry."/>
          <button className="ghost danger" disabled={busy||!back||!note.trim()}
            onClick={()=>run(()=>receivablesApi.sendBack(row.id,back,note.trim()),
              `${row.ref} sent back to ${back}`)}>Send back</button></div>}
      </div>}
      {/* Drawings, quotes and anything else the notification rests on. */}
      <Attachments entityType="receivable" entityId={row.id} flash={()=>{}}/>
    </aside></div>}

/* The job notification form: what the job is, for whom, under whom and on what terms.
   The notification number and job code are the server's to issue, so they are shown
   greyed as the numbers this notification will get. Files are uploaded once the
   notification exists, since an attachment has to belong to something. */
const JOB_TYPES=["Interior fit-out","Renovation","Civil works","MEP","Joinery","Maintenance","Other"];
const PRIORITIES=["Low","Normal","High","Urgent"];
const APPROVALS=["Approved","Pending","Not required"];
/* The client dropdown's way out: a client not yet in the list is typed instead. */
const NEW_CLIENT="__new__";

function NewEntry({companies,customers,close,added}:{companies:{id:string;name:string}[];
  customers:string[];close:()=>void;added:(r:Receivable)=>void}){
  /* BOQ is a plain Yes/No with no placeholder, so it starts on the first choice and the
     value sent always matches what the dropdown shows. */
  const[f,setF]=useState<Record<string,string>>({companyId:companies[0]?.id||"",priority:"Normal",boqAvailable:"Yes",
    notifiedOn:new Date().toISOString().slice(0,10),contractCurrency:"AED"});
  const[files,setFiles]=useState<File[]>([]);
  const[newClient,setNewClient]=useState(false);
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
  const numbers=useAsync(()=>receivablesApi.next(),[]);
  const people=useAsync(()=>planningApi.people(),[]);
  const clientList=useOptions("receivable.client",[]);
  const jobTypes=useOptions("receivable.jobType",JOB_TYPES);
  const clients=[...new Set([...clientList,...customers])].sort((a,b)=>a.localeCompare(b));

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{
      const row=await receivablesApi.create(f as unknown as Partial<Receivable>);
      /* The notification is saved; a file that fails to upload is reported rather than
         undoing it, and can be added again from the notification itself. */
      const failed:string[]=[];
      for(const file of files){
        try{const r=await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({entityType:"receivable",entityId:row.id,kind:"Other",fileName:file.name,dataUrl:await asDataUrl(file)})});
          if(!r.ok)failed.push(file.name)}catch{failed.push(file.name)}}
      if(failed.length)alert(`${row.ref} was raised, but these files did not upload: ${failed.join(", ")}. Add them from the notification.`);
      added(row)}
    catch(x){setErr(x instanceof Error?x.message:"Could not raise it");setBusy(false)}};

  return <div className="recv-drawer wide" role="dialog" aria-label="Job notification form">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside><header><div><small>JOB NOTIFICATION FORM</small><h3>New job notification</h3>
        <p className="recv-form-sub">Create and submit a new job notification for project / interior work.</p></div>
      <button onClick={close} aria-label="Close"><X/></button></header>
      <form className="recv-act recv-form" onSubmit={submit}>
        {/* In the order of the field specification. */}
        <div className="recv-two">
          <label><span className="recv-lbl">Job Notification No.<i className="recv-req" aria-hidden="true">*</i></span><input readOnly className="recv-auto" value={numbers.data?.jobNo||"Issued on submit"}/></label>
          <label><span className="recv-lbl">Company<i className="recv-req" aria-hidden="true">*</i></span><select required value={f.companyId||""} onChange={e=>set("companyId",e.target.value)}>
            <option value="">Select company</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
        <div className="recv-two">
          <label><span className="recv-lbl">Department<i className="recv-req" aria-hidden="true">*</i></span><select required value={f.department||""} onChange={e=>set("department",e.target.value)}>
            <option value="">Select department</option>{JOB_DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></label>
          <label><span className="recv-lbl">Client / customer<i className="recv-req" aria-hidden="true">*</i></span>{newClient
            ?<span className="recv-newclient"><input autoFocus required value={f.customer||""} onChange={e=>set("customer",e.target.value)} placeholder="New client name"/>
               <button type="button" className="ghost" onClick={()=>{setNewClient(false);set("customer","")}}>List</button></span>
            :<select required value={f.customer||""} onChange={e=>{if(e.target.value===NEW_CLIENT){setNewClient(true);set("customer","")}else set("customer",e.target.value)}}>
              <option value="">Select client</option>{clients.map(c=><option key={c}>{c}</option>)}
              <option value={NEW_CLIENT}>+ New client…</option></select>}</label></div>
        <div className="recv-two">
          <label><span className="recv-lbl">Project / contract name</span><input value={f.projectName||""} onChange={e=>set("projectName",e.target.value)} placeholder="Enter project / contract name"/></label>
          <label><span className="recv-lbl">Job name<i className="recv-req" aria-hidden="true">*</i></span><input required value={f.jobName||""} onChange={e=>set("jobName",e.target.value)} placeholder="Enter job name"/></label></div>
        <div className="recv-two">
          <label><span className="recv-lbl">Job code<i className="recv-req" aria-hidden="true">*</i></span><input readOnly className="recv-auto" value={numbers.data?.jobCode||"Issued on submit"}
            title="The common key linking all of this project's transactions"/></label>
          <label><span className="recv-lbl">Job location</span><input value={f.jobLocation||""} onChange={e=>set("jobLocation",e.target.value)} placeholder="Enter job location"/></label></div>
        <div className="recv-two">
          <label><span className="recv-lbl">Project manager / responsible person<i className="recv-req" aria-hidden="true">*</i></span><select required value={f.pmEmail||""} onChange={e=>set("pmEmail",e.target.value)}>
            <option value="">{people.loading?"Loading people…":"Select project manager"}</option>
            {(people.data||[]).map(p=><option key={p.email} value={p.email}>{p.name?`${p.name} · ${p.email}`:p.email}</option>)}</select></label>
          <label><span className="recv-lbl">Job start date<i className="recv-req" aria-hidden="true">*</i></span><input type="date" required value={f.startDate||""} onChange={e=>set("startDate",e.target.value)}/></label></div>
        <div className="recv-two">
          <label><span className="recv-lbl">Expected completion date</span><input type="date" min={f.startDate||undefined} value={f.endDate||""} onChange={e=>set("endDate",e.target.value)}/></label>
          <label><span className="recv-lbl">Contract number</span><input value={f.poNumber||""} onChange={e=>set("poNumber",e.target.value)} placeholder="Enter contract number"/></label></div>
        <div className="recv-two">
          <label><span className="recv-lbl">Contract value / budget</span><span className="recv-money">
            <select aria-label="Currency" value={f.contractCurrency||"AED"} onChange={e=>set("contractCurrency",e.target.value)}>
              {["AED","INR","USD","SAR","EUR","GBP"].map(c=><option key={c}>{c}</option>)}</select>
            <input type="number" min="0" step="0.01" value={f.contractValue||""} onChange={e=>set("contractValue",e.target.value)} placeholder="Enter amount"/></span></label>
          <label><span className="recv-lbl">Job type<i className="recv-req" aria-hidden="true">*</i></span><select required value={f.jobType||""} onChange={e=>set("jobType",e.target.value)}>
            <option value="">Select job type</option>{jobTypes.map(t=><option key={t}>{t}</option>)}</select></label></div>
        <label><span className="recv-lbl">Scope of work<i className="recv-req" aria-hidden="true">*</i></span><textarea required rows={4} value={f.scope||""} onChange={e=>set("scope",e.target.value)} placeholder="Enter scope of work details…"/></label>
        <div className="recv-two">
          <label><span className="recv-lbl">BOQ / budget available<i className="recv-req" aria-hidden="true">*</i></span><select required value={f.boqAvailable||"Yes"} onChange={e=>set("boqAvailable",e.target.value)}>
            <option>Yes</option><option>No</option></select></label>
          <label><span className="recv-lbl">Management approval<i className="recv-req" aria-hidden="true">*</i></span><select required value={f.managementApproval||""} onChange={e=>set("managementApproval",e.target.value)}
            title="Management authorisation - maker-checker control">
            <option value="">Select approval</option>{APPROVALS.map(a=><option key={a}>{a}</option>)}</select></label></div>
        <div className="recv-two">
          <label><span className="recv-lbl">Priority<i className="recv-req" aria-hidden="true">*</i></span><select required value={f.priority||""} onChange={e=>set("priority",e.target.value)}>
            <option value="">Select priority</option>{PRIORITIES.map(a=><option key={a}>{a}</option>)}</select></label>
          <label><span className="recv-lbl">Notification date<i className="recv-req" aria-hidden="true">*</i></span><input type="date" required value={f.notifiedOn||""} onChange={e=>set("notifiedOn",e.target.value)}/></label></div>
        <label><span className="recv-lbl">Remarks</span><textarea rows={2} value={f.remarksNote||""} onChange={e=>set("remarksNote",e.target.value)} placeholder="Enter any additional remarks…"/></label>
        <FilePicker files={files} onChange={setFiles} label="Attachments (optional)"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.dwg"/>
        <label><span className="recv-lbl">Next process<i className="recv-req" aria-hidden="true">*</i></span><input readOnly className="recv-auto" value={`${STAGES[1]} · ${ACTION_LABEL["Job Notification"]} (accounts)`}/></label>
        {err&&<p className="recv-error">{err}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?"Submitting…":"Submit job notification"}</button>
      </form></aside></div>}
