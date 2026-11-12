"use client";
import{useCallback,useEffect,useMemo,useState}from"react";
import{ArrowLeft,Download,FileText,Layers,Paperclip,Pencil,Printer,Search,Trash2,X}from"lucide-react";
import{makeZip,safeName}from"../lib/zip";
import type{ZipEntry}from"../lib/zip";
import{stamp}from"../lib/stamp";
import{csv}from"./workforce-store";
import{money,moneyList,summaryOf}from"../lib/consolidation";
import type{BatchPayment,Consolidation,Group}from"../lib/consolidation";
import{useBudgets}from"./JobBudget";
import{inr,short}from"../lib/budget";
import type{JobBudget}from"../lib/budget";

/* Consolidated payments: the batches accounts, audit, finance and the administrator have
   made by ticking payment requests on the register. Each batch has a summary on screen and a
   PDF (the browser's Save as PDF). A batch only groups requests - it never moves them on. */

type Batch=Consolidation&{hidden:number};
type Data={consolidations:Batch[];inBatch:Record<number,string>};

export async function loadConsolidations():Promise<Data>{
  const r=await fetch("/api/consolidations");
  const b=await r.json().catch(()=>({})) as Partial<Data>&{error?:string};
  if(!r.ok)throw new Error(b.error||"Consolidated payments could not be loaded");
  return{consolidations:b.consolidations||[],inBatch:b.inBatch||{}}}

async function send(method:string,body?:unknown,query=""){
  const r=await fetch(`/api/consolidations${query}`,{method,headers:{"content-type":"application/json"},
    body:body?JSON.stringify(body):undefined});
  const b=await r.json().catch(()=>({})) as Record<string,unknown>&{error?:string};
  if(!r.ok)throw new Error(b.error||"That change was refused");
  return b}

const when=(iso:string)=>iso?new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"";

export default function ConsolidatedPayments({flash,open}:{flash:(m:string)=>void;open?:(id:number)=>void}){
  const[data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[pick,setPick]=useState(""),[q,setQ]=useState("");
  const load=useCallback(()=>loadConsolidations().then(d=>{setData(d);setError("")})
    .catch(e=>setError(e instanceof Error?e.message:"Could not load")),[]);
  useEffect(()=>{load()},[load]);
  const batch=data?.consolidations.find(b=>b.id===pick)||null;
  const list=useMemo(()=>{const s=q.trim().toLowerCase();
    return(data?.consolidations||[]).filter(b=>!s||[b.cpNo,b.title,b.note,b.createdBy,...b.payments.flatMap(p=>[p.requestNo,p.vendor,p.company])]
      .some(x=>(x||"").toLowerCase().includes(s)))},[data,q]);
  if(batch)return <BatchDetail batch={batch} back={()=>setPick("")} reload={load} flash={flash} open={open}/>;
  return <div className="page cp-page">
    <div className="intro"><div><small>ACCOUNTS · AUDIT · FINANCE</small><h2>Consolidated payments</h2>
      <p>Payment requests combined into one batch, with one summary and one PDF. Tick requests under Accounts / Audit queues → All requests, then move them here.</p></div></div>
    <div className="toolbar"><label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search CP number, title, request, vendor or company"/></label></div>
    {error&&<p className="cp-error">{error}</p>}
    {!data&&!error&&<p className="queue-empty">Loading…</p>}
    {data&&<section className="panel table-panel"><div className="panel-head"><div><small>BATCHES</small><h2>All consolidated payments</h2></div><span>{list.length} of {data.consolidations.length}</span></div>
      {!list.length?<div className="wb-empty"><Layers/><b>{data.consolidations.length?"Nothing matches that search":"No consolidated payments yet"}</b>
        <span>{data.consolidations.length?"Try another word.":"Tick payment requests in Accounts / Audit queues → All requests and choose Move to consolidated payments."}</span></div>
      :<div className="table-wrap"><table className="cp-table"><thead><tr><th>NUMBER</th><th>TITLE</th><th>REQUESTS</th><th>TOTAL</th><th>COMPANIES</th><th>CREATED</th></tr></thead>
        <tbody>{list.map(b=>{const s=summaryOf(b.payments);return <tr key={b.id} onClick={()=>setPick(b.id)}>
          <td><b>{b.cpNo}</b></td><td>{b.title}{b.note&&<small>{b.note}</small>}</td><td>{s.count}{b.hidden>0&&<small>+{b.hidden} not visible to you</small>}</td>
          <td><b>{moneyList(s.totals)}</b></td><td>{s.byCompany.map(c=>c.name).join(", ")||"—"}</td>
          <td>{when(b.createdAt)}<small>{b.createdBy}</small></td></tr>})}</tbody></table></div>}
    </section>}
  </div>}

function GroupTable({title,groups}:{title:string;groups:Group[]}){
  return <section className="panel cp-group"><div className="panel-head"><div><small>SUMMARY</small><h2>{title}</h2></div></div>
    <table><thead><tr><th>{title.replace(/^By /,"").toUpperCase()}</th><th>REQUESTS</th><th>AMOUNT</th></tr></thead>
      <tbody>{groups.map(g=><tr key={g.name}><td>{g.name}</td><td>{g.count}</td><td><b>{moneyList(g.totals)}</b></td></tr>)}</tbody></table></section>}

function BatchDetail({batch,back,reload,flash,open}:{batch:Batch;back:()=>void;reload:()=>Promise<void>|void;flash:(m:string)=>void;open?:(id:number)=>void}){
  const[ticked,setTicked]=useState<number[]>([]),[edit,setEdit]=useState(false),[busy,setBusy]=useState(false);
  const rows=batch.payments;
  /* The budget and spend of each request's job, from the job budgets. */
  const{find}=useBudgets();
  const jobOf=(p:BatchPayment)=>find(p.jbCode||p.projectCode);
  /* With some requests ticked, the summary and the PDF cover those; otherwise the whole batch. */
  const chosen=ticked.length?rows.filter(r=>ticked.includes(r.id)):rows;
  const s=summaryOf(chosen);
  const all=rows.length>0&&ticked.length===rows.length;
  const toggle=(id:number)=>setTicked(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const removeTicked=async()=>{
    if(!ticked.length||!confirm(`Take ${ticked.length} payment request(s) out of ${batch.cpNo}?\n\nThe requests themselves are not changed.`))return;
    setBusy(true);try{await send("PATCH",{id:batch.id,remove:ticked});setTicked([]);await reload();flash(`${ticked.length} taken out of ${batch.cpNo}`)}
    catch(e){flash(e instanceof Error?e.message:"Could not take them out")}finally{setBusy(false)}};
  const remove=async()=>{
    if(!confirm(`Delete ${batch.cpNo}?\n\nOnly the batch is deleted. The ${rows.length} payment request(s) in it are not changed and can be consolidated again.`))return;
    setBusy(true);try{await send("DELETE",undefined,`?id=${encodeURIComponent(batch.id)}`);flash(`${batch.cpNo} deleted`);back();await reload()}
    catch(e){flash(e instanceof Error?e.message:"Could not delete it")}finally{setBusy(false)}};
  const excel=()=>csv([["S.No","Request no","Payment type","Company","Department","Vendor","Project","JB code","PO no","Invoice no","Invoice date","Due","Status","Currency","Amount","TDS value","Job budget (INR)","Job raised (INR)","Budget status"],
    ...chosen.map((p,i)=>{const j=jobOf(p);return[i+1,p.requestNo,p.nature||"",p.company,p.department,p.vendor,p.project||"",p.jbCode||p.projectCode||"",p.poNumber||"",p.invoiceNumber||"",p.invoiceDate||"",
      p.due,p.status,p.currency,p.amount,p.tdsValue||"",j?j.budget:"",j?Math.round(j.spent*100)/100:"",j?stateText[j.state]:""]}),
    [],...s.byKind.filter(k=>k.count).flatMap(k=>k.totals.map(t=>["","",k.label,"","","","","","","","","","Total",t.currency,t.amount,"","","",""])),
    ...s.totals.map(t=>["","","All","","","","","","","","","","Total",t.currency,t.amount,"","","",""])],
    `${batch.cpNo}-${new Date().toISOString().slice(0,10)}.csv`);
  return <div className="page cp-page">
    <div className="cp-head"><button className="cp-back" onClick={back}><ArrowLeft/>All consolidated payments</button>
      <div className="cp-actions">
        <button onClick={()=>setEdit(true)}><Pencil/>Edit</button>
        <button onClick={excel} disabled={!chosen.length}><Download/>Excel (CSV)</button>
        <button className="primary" onClick={()=>printBatch(batch,chosen,jobOf)} disabled={!chosen.length}><Printer/>Print / Save PDF</button>
        <button className="cp-danger" onClick={remove} disabled={busy}><Trash2/>Delete</button></div></div>
    <div className="intro"><div><small>{batch.cpNo} · CREATED {when(batch.createdAt).toUpperCase()} BY {batch.createdBy.toUpperCase()}</small><h2>{batch.title}</h2>
      {batch.note&&<p>{batch.note}</p>}
      {ticked.length>0&&<p className="cp-scope">The summary, Excel and PDF cover the {ticked.length} ticked request(s). <button onClick={()=>setTicked([])}>Show the whole batch</button></p>}
      {batch.hidden>0&&<p className="cp-scope">{batch.hidden} more request(s) in this batch belong to a company you cannot see.</p>}</div></div>
    <div className="metrics cp-metrics">
      <article className="blue"><span>Payment requests</span><b>{s.count}</b><small>{ticked.length?`ticked of ${rows.length}`:"in this batch"}</small></article>
      {s.byKind.filter(k=>k.kind!=="other"||k.count).map(k=><article className={k.kind==="vendor"?"green":k.kind==="sub"?"amber":""} key={k.kind}><span>{k.label}</span>
        <b className="cp-money">{moneyList(k.totals)}</b><small>{k.count} request(s)</small></article>)}
      <article className="green"><span>Total</span><b className="cp-money">{moneyList(s.totals)}</b><small>{s.count} request(s)</small></article>
      <article className="violet"><span>Companies · vendors</span><b>{s.byCompany.length} · {s.byVendor.length}</b><small>{s.tds.length?`TDS ${moneyList(s.tds)}`:"no TDS recorded"}</small></article>
    </div>
    <div className="cp-groups"><GroupTable title="By payment type" groups={s.byNature}/><GroupTable title="By company" groups={s.byCompany}/><GroupTable title="By vendor" groups={s.byVendor}/><GroupTable title="By status" groups={s.byStatus}/></div>
    <section className="panel table-panel"><div className="panel-head"><div><small>PAYMENT REQUESTS</small><h2>In this batch</h2></div>
      {ticked.length>0&&<button className="cp-danger" disabled={busy} onClick={removeTicked}><X/>Take {ticked.length} out</button>}</div>
      {!rows.length?<div className="wb-empty"><FileText/><b>This batch is empty</b><span>Every request was taken out. Add more from Accounts / Audit queues → All requests, or delete it.</span></div>
      :<div className="table-wrap"><table className="cp-table"><thead><tr><th><input type="checkbox" aria-label="Tick every request" checked={all} onChange={()=>setTicked(all?[]:rows.map(r=>r.id))}/></th>
        <th>REQUEST</th><th>COMPANY / DEPT</th><th>VENDOR</th><th>PROJECT / PO</th><th>INVOICE</th><th>DUE</th><th>STATUS</th><th>AMOUNT</th><th>BUDGET</th><th>RAISED</th></tr></thead>
        <tbody>{rows.map(p=><tr key={p.id} className={ticked.includes(p.id)?"cp-ticked":""} onClick={()=>open?.(p.id)}>
          <td onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`Tick ${p.requestNo}`} checked={ticked.includes(p.id)} onChange={()=>toggle(p.id)}/></td>
          <td><b>{p.requestNo}</b><small>{p.nature||"—"}</small></td><td>{p.company}<small>{p.department}</small></td><td>{p.vendor}</td>
          <td>{p.project||"—"}{p.poNumber&&<small>PO {p.poNumber}</small>}</td><td>{p.invoiceNumber||"—"}{p.invoiceDate&&<small>{p.invoiceDate}</small>}</td>
          <td>{p.due}</td><td><span className="badge">{p.status}</span></td><td className="cp-amt"><b>{money(p.currency,p.amount)}</b></td><BudgetCells j={jobOf(p)}/></tr>)}</tbody>
        <tfoot>{s.byKind.filter(k=>k.count).flatMap(k=>k.totals.map(t=><tr key={k.kind+t.currency} className="cp-sub"><td colSpan={8}>{k.label} · {t.currency} ({t.count})</td><td className="cp-amt">{money(t.currency,t.amount)}</td><td colSpan={2}/></tr>))}
          {s.totals.map(t=><tr key={t.currency}><td colSpan={8}>Total {t.currency} ({t.count}{ticked.length?" ticked":""})</td><td className="cp-amt"><b>{money(t.currency,t.amount)}</b></td><td colSpan={2}/></tr>)}</tfoot></table></div>}
    </section>
    <BatchFiles key={batch.id+":"+rows.map(r=>r.id).join(",")} batch={batch} chosen={chosen} ticked={ticked.length>0} flash={flash}/>
    {edit&&<EditBatch batch={batch} close={()=>setEdit(false)} done={async()=>{setEdit(false);await reload();flash(`${batch.cpNo} updated`)}}/>}
  </div>}

type BatchFile={id:string;paymentId:number;kind:string;fileName:string;mime:string;bytes:number;uploadedBy:string;uploadedAt:string};
const size=(n:number)=>n>=1073741824?`${(n/1073741824).toFixed(2)} GB`:n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(Math.round(n/1024),1)} KB`;
const fileUrl=(id:string)=>`/api/attachments?id=${encodeURIComponent(id)}`;

/* Every document attached to the requests in the batch (or the ticked ones), each one to
   open or download, and all of them together as one ZIP with a folder per request. The
   files are only read here - nothing is copied or changed on the requests. */
function BatchFiles({batch,chosen,ticked,flash}:{batch:Batch;chosen:BatchPayment[];ticked:boolean;flash:(m:string)=>void}){
  const[files,setFiles]=useState<BatchFile[]|null>(null),[err,setErr]=useState(""),[progress,setProgress]=useState("");
  /* The host remounts this (key) when the batch or its requests change, so it starts empty. */
  useEffect(()=>{let dead=false;
    fetch(`/api/consolidations?files=${encodeURIComponent(batch.id)}`).then(async r=>{
      const b=await r.json().catch(()=>({})) as{files?:BatchFile[];error?:string};
      if(!r.ok)throw new Error(b.error||"The attachments could not be loaded");
      if(!dead)setFiles(b.files||[])})
      .catch(e=>{if(!dead)setErr(e instanceof Error?e.message:"The attachments could not be loaded")});
    return()=>{dead=true}},[batch.id]);
  const byPayment=useMemo(()=>{const m=new Map<number,BatchFile[]>();for(const f of files||[])m.set(f.paymentId,[...(m.get(f.paymentId)||[]),f]);return m},[files]);
  const groups=chosen.map(p=>({p,list:byPayment.get(p.id)||[]}));
  const withFiles=groups.filter(g=>g.list.length);
  const without=groups.filter(g=>!g.list.length);
  const all=withFiles.flatMap(g=>g.list);
  const total=all.reduce((n,f)=>n+f.bytes,0);

  const downloadAll=async()=>{
    if(!all.length||progress)return;
    if(total>1.5*1073741824&&!confirm(`That is ${size(total)} of files. Your browser holds them all while it builds the ZIP. Tick fewer requests if it fails.\n\nGo ahead?`))return;
    const entries:ZipEntry[]=[];const missing:string[]=[];let done=0;
    const used=new Set<string>();
    const nameFor=(p:BatchPayment,f:BatchFile)=>{
      const folder=safeName(`${p.requestNo} - ${p.vendor}`);
      const base=safeName(`${f.kind} - ${f.fileName}`);
      const dot=base.lastIndexOf(".");const stem=dot>0?base.slice(0,dot):base,ext=dot>0?base.slice(dot):"";
      let name=`${folder}/${base}`;for(let n=2;used.has(name.toLowerCase());n++)name=`${folder}/${stem} (${n})${ext}`;
      used.add(name.toLowerCase());return name};
    const jobs=withFiles.flatMap(g=>g.list.map(f=>({p:g.p,f})));
    setProgress(`0 of ${jobs.length}`);
    try{
      /* Four at a time, so a large batch is quick without flooding the server. */
      let next=0;
      const worker=async()=>{while(next<jobs.length){const{p,f}=jobs[next++];
        try{const r=await fetch(fileUrl(f.id));if(!r.ok)throw new Error(String(r.status));
          entries.push({name:nameFor(p,f),data:new Uint8Array(await r.arrayBuffer()),date:f.uploadedAt?new Date(f.uploadedAt):undefined})}
        catch{missing.push(`${p.requestNo}: ${f.kind} - ${f.fileName}`)}
        setProgress(`${++done} of ${jobs.length}`)}};
      await Promise.all([worker(),worker(),worker(),worker()]);
      if(!entries.length){flash("None of the files could be downloaded. Check your connection and try again.");return}
      entries.sort((a,b)=>a.name.localeCompare(b.name));
      if(missing.length)entries.push({name:"Files not included.txt",data:new TextEncoder().encode(
        `These files could not be read from storage when the ZIP was made:\r\n\r\n${missing.join("\r\n")}\r\n`)});
      const url=URL.createObjectURL(makeZip(entries));
      const a=document.createElement("a");a.href=url;a.download=`${batch.cpNo}-attachments-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      flash(missing.length?`ZIP ready - ${entries.length-1} file(s); ${missing.length} could not be read (listed inside)`:`ZIP ready - ${entries.length} file(s)`)}
    finally{setProgress("")}};

  return <section className="panel table-panel cp-files"><div className="panel-head"><div><small>ATTACHMENTS</small><h2>Documents of these requests</h2></div>
    {files&&all.length>0&&<button className="primary cp-zip" disabled={!!progress} onClick={downloadAll}><Download/>{progress?`Downloading ${progress}…`:`Download all (ZIP) · ${all.length} file${all.length===1?"":"s"}, ${size(total)}`}</button>}</div>
    {err&&<p className="cp-error cp-files-note">{err}</p>}
    {!files&&!err&&<p className="queue-empty">Loading attachments…</p>}
    {files&&<>
      <p className="cp-files-note">{all.length?`${all.length} file(s) from ${withFiles.length} of ${chosen.length} ${ticked?"ticked ":""}request(s). The ZIP has one folder per request.`:`No documents are attached to ${ticked?"the ticked":"these"} requests.`}
        {without.length>0&&all.length>0&&<> Nothing attached to {without.slice(0,8).map(g=>g.p.requestNo).join(", ")}{without.length>8?` and ${without.length-8} more`:""}.</>}</p>
      {all.length>0&&<div className="table-wrap"><table className="cp-table cp-file-table"><thead><tr><th>REQUEST</th><th>TYPE</th><th>FILE</th><th>SIZE</th><th>ADDED</th><th></th></tr></thead>
        <tbody>{withFiles.flatMap(g=>g.list.map((f,i)=><tr key={f.id} className={i===0?"cp-file-first":""}>
          <td className={i===0?"cp-file-req":"cp-file-req cp-file-repeat"}><b>{g.p.requestNo}</b><small>{g.p.vendor}</small></td>
          <td><span className="badge">{f.kind}</span></td>
          <td><a className="cp-file-link" href={fileUrl(f.id)} target="_blank" rel="noreferrer"><Paperclip/>{f.fileName}</a></td>
          <td className="cp-amt">{size(f.bytes)}</td>
          <td>{when(f.uploadedAt)}<small>{f.uploadedBy}</small></td>
          <td><a className="cp-file-dl" href={fileUrl(f.id)} download={f.fileName} title={`Download ${f.fileName}`} aria-label={`Download ${f.fileName}`}><Download/></a></td></tr>))}</tbody></table></div>}
    </>}
  </section>}

const stateText={ok:"Within budget",near:"Near budget",over:"Overspent"} as const;

/* The job's budget and spend for a request in the batch; a dash when it has no job. */
function BudgetCells({j}:{j?:JobBudget}){
  if(!j)return <><td className="cp-amt cp-nojob">—</td><td className="cp-amt cp-nojob">—</td></>;
  return <><td className="cp-amt" title={inr(j.budget)}>{short(j.budget)}<small>{j.code}</small></td>
    <td className="cp-amt" title={`${inr(j.spent)} of ${inr(j.budget)}`}>{short(j.spent)}
      <small className={`cp-bstate ${j.state}`}>{j.state==="ok"?`${j.budget?Math.round(j.spent/j.budget*100):0}% used`:stateText[j.state]}</small></td></>}

function EditBatch({batch,close,done}:{batch:Batch;close:()=>void;done:()=>void}){
  const[title,setTitle]=useState(batch.title),[note,setNote]=useState(batch.note),[err,setErr]=useState(""),[saving,setSaving]=useState(false);
  const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setErr("");
    try{await send("PATCH",{id:batch.id,title,note});done()}catch(x){setErr(x instanceof Error?x.message:"Could not save")}finally{setSaving(false)}};
  return <><button className="overlay" aria-label="Close" onClick={close}/><form className="modal" onSubmit={save}>
    <header><div><small>{batch.cpNo}</small><h2>Edit consolidated payment</h2></div><button type="button" onClick={close}><X/></button></header>
    <div className="form"><label className="wide">Title<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label className="wide">Note<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
      {err&&<p className="wide login-error">{err}</p>}</div>
    <footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving||!title.trim()}>{saving?"Saving…":"Save"}</button></footer></form></>}

/* The tick-box bar's dialog on the register: a new batch from the ticked requests, or add
   them to one that exists. */
export function MoveToConsolidated({rows,batches,close,done}:{rows:BatchPayment[];batches:Batch[];close:()=>void;done:(msg:string)=>void}){
  const[mode,setMode]=useState<"new"|"add">("new"),[into,setInto]=useState(""),[title,setTitle]=useState(""),[note,setNote]=useState(""),
    [err,setErr]=useState(""),[saving,setSaving]=useState(false);
  const s=summaryOf(rows);
  const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setErr("");
    try{const b=await send("POST",{paymentIds:rows.map(r=>r.id),...(mode==="add"?{consolidationId:into}:{title,note})});
      done(`${rows.length} payment request(s) moved to ${String(b.cpNo)}`)}
    catch(x){setErr(x instanceof Error?x.message:"Could not move them")}finally{setSaving(false)}};
  return <><button className="overlay" aria-label="Close" onClick={close}/><form className="modal cp-move" onSubmit={save}>
    <header><div><small>{rows.length} PAYMENT REQUEST(S) · {moneyList(s.totals)}</small><h2>Move to consolidated payments</h2></div><button type="button" onClick={close}><X/></button></header>
    <div className="form">
      <div className="wide cp-mode"><label><input type="radio" checked={mode==="new"} onChange={()=>setMode("new")}/>New consolidated payment</label>
        <label><input type="radio" checked={mode==="add"} disabled={!batches.length} onChange={()=>setMode("add")}/>Add to an existing one{!batches.length&&" (none yet)"}</label></div>
      {mode==="new"?<><label className="wide">Title<input required autoFocus maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Vendor payments - week 46"/></label>
        <label className="wide">Note (optional)<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label></>
      :<label className="wide">Consolidated payment<select required value={into} onChange={e=>setInto(e.target.value)}><option value="">— choose —</option>
        {batches.map(b=><option key={b.id} value={b.id}>{b.cpNo} · {b.title} ({b.payments.length})</option>)}</select></label>}
      <div className="wide cp-move-list">{rows.map(r=><span key={r.id}><b>{r.requestNo}</b> {r.vendor}<em>{money(r.currency,r.amount)}</em></span>)}</div>
      <p className="wide cp-hint">Each request keeps its own approval flow. A request can be in one consolidated payment at a time.</p>
      {err&&<p className="wide login-error">{err}</p>}</div>
    <footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving||(mode==="new"?!title.trim():!into)}>{saving?"Moving…":"Move"}</button></footer></form></>}

const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

/* The PDF: a print page in its own window, saved through the browser's Save as PDF. */
function printBatch(batch:Batch,rows:BatchPayment[],jobOf:(p:BatchPayment)=>JobBudget|undefined){
  const s=summaryOf(rows);
  const groups=(title:string,list:Group[])=>`<div class="g"><h3>${esc(title)}</h3><table><thead><tr><th>${esc(title.replace(/^By /,""))}</th><th class="n">Requests</th><th class="r">Amount</th></tr></thead><tbody>${
    list.map(g=>`<tr><td>${esc(g.name)}</td><td class="n">${g.count}</td><td class="r">${esc(moneyList(g.totals))}</td></tr>`).join("")}</tbody></table></div>`;
  const body=rows.map((p,i)=>`<tr><td class="n">${i+1}</td><td><b>${esc(p.requestNo)}</b><small>${esc(p.nature||"")}</small></td><td>${esc(p.company)}<small>${esc(p.department)}</small></td><td>${esc(p.vendor)}</td>
    <td>${esc(p.project||"—")}${p.poNumber?`<small>PO ${esc(p.poNumber)}</small>`:""}</td><td>${esc(p.invoiceNumber||"—")}${p.invoiceDate?`<small>${esc(p.invoiceDate)}</small>`:""}</td>
    <td>${esc(p.due)}</td><td>${esc(p.status)}</td><td class="r">${esc(money(p.currency,p.amount))}</td>${(()=>{const j=jobOf(p);
    return j?`<td class="r">${esc(short(j.budget))}<small>${esc(j.code)}</small></td><td class="r${j.state==="over"?" over":""}">${esc(short(j.spent))}<small>${esc(j.state==="ok"?`${j.budget?Math.round(j.spent/j.budget*100):0}% used`:stateText[j.state])}</small></td>`
      :`<td class="r">—</td><td class="r">—</td>`})()}</tr>`).join("");
  const foot=s.byKind.filter(k=>k.count).flatMap(k=>k.totals.map(t=>`<tr class="sub"><td colspan="8" class="r">${esc(k.label)} · ${esc(t.currency)} (${t.count})</td><td class="r">${esc(money(t.currency,t.amount))}</td><td colspan="2"></td></tr>`)).join("")
    +s.totals.map(t=>`<tr><td colspan="8" class="r">Total ${esc(t.currency)} (${t.count} request${t.count===1?"":"s"})</td><td class="r"><b>${esc(money(t.currency,t.amount))}</b></td><td colspan="2"></td></tr>`).join("");
  const partial=rows.length<batch.payments.length?`<p class="note">This copy covers ${rows.length} of the ${batch.payments.length} payment requests in ${esc(batch.cpNo)}.</p>`:"";
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(batch.cpNo)} - ${esc(batch.title)}</title><style>
  @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:10.5px/1.4 Inter,Arial,sans-serif;color:#17312b;margin:0}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0b725d;padding-bottom:10px;margin-bottom:12px}
  .top img{height:42px}.top h1{font-size:18px;margin:0}.top p{margin:2px 0 0;color:#5b6b67}.meta{text-align:right}.meta b{font-size:15px;display:block}
  .cards{display:flex;gap:8px;margin:10px 0}.card{flex:1;border:1px solid #d5e0dc;border-radius:6px;padding:7px 9px}.card span{display:block;color:#5b6b67;font-size:9px;text-transform:uppercase;letter-spacing:.5px}.card b{font-size:13px}
  .groups{display:flex;gap:10px;margin-bottom:12px}.g{flex:1}h3{font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.6px;color:#0b725d}
  table{width:100%;border-collapse:collapse}th{background:#eef4f2;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;padding:5px 6px;border:1px solid #d5e0dc}
  td{padding:5px 6px;border:1px solid #e1e8e5;vertical-align:top}td small{display:block;color:#71817d;font-size:8.5px}.r{text-align:right;white-space:nowrap}.n{text-align:center}
  tfoot td{background:#f6f9f8;font-weight:600}tfoot tr.sub td{font-weight:400;color:#4c5f5a}td.over{color:#b43e3c;font-weight:600}tr{page-break-inside:avoid}.note{color:#5b6b67;margin:4px 0 8px}
  .sign{display:flex;gap:18px;margin-top:34px}.sign div{flex:1;border-top:1px solid #8a9a96;padding-top:5px;text-align:center;color:#5b6b67}
  .foot{margin-top:14px;color:#8a9a96;font-size:8.5px;display:flex;justify-content:space-between}
  @media screen{body{padding:20px;max-width:1150px;margin:auto}}</style></head><body>
  <div class="top"><div style="display:flex;gap:12px;align-items:center"><img src="${esc(location.origin)}/logo.png" alt="" onerror="this.style.display='none'"><div><h1>Consolidated payment</h1><p>${esc(batch.title)}</p></div></div>
    <div class="meta"><b>${esc(batch.cpNo)}</b>Created ${esc(when(batch.createdAt))} by ${esc(batch.createdBy)}</div></div>
  ${batch.note?`<p class="note">${esc(batch.note)}</p>`:""}${partial}
  <div class="cards"><div class="card"><span>Payment requests</span><b>${s.count}</b></div>${s.byKind.filter(k=>k.kind!=="other"||k.count).map(k=>`<div class="card"><span>${esc(k.label)} (${k.count})</span><b>${esc(moneyList(k.totals))}</b></div>`).join("")}
    <div class="card"><span>Total</span><b>${esc(moneyList(s.totals))}</b></div>
    <div class="card"><span>Companies · vendors</span><b>${s.byCompany.length} · ${s.byVendor.length}</b></div>${s.tds.length?`<div class="card"><span>TDS</span><b>${esc(moneyList(s.tds))}</b></div>`:""}</div>
  <div class="groups">${groups("By payment type",s.byNature)}${groups("By company",s.byCompany)}${groups("By vendor",s.byVendor)}${groups("By status",s.byStatus)}</div>
  <h3>Payment requests</h3><table><thead><tr><th class="n">#</th><th>Request</th><th>Company / Dept</th><th>Vendor</th><th>Project / PO</th><th>Invoice</th><th>Due</th><th>Status</th><th class="r">Amount</th><th class="r">Job budget</th><th class="r">Job raised</th></tr></thead>
  <tbody>${body}</tbody><tfoot>${foot}</tfoot></table>
  <div class="sign"><div>Prepared by (Accounts)</div><div>Verified by (Audit)</div><div>Approved by</div><div>Released by (Finance)</div></div>
  <div class="foot"><span>${esc(batch.cpNo)} · ${rows.length} payment request(s)</span><span>Printed ${esc(stamp(new Date().toISOString()))}</span></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
  const w=window.open("","_blank");
  if(!w){alert("Allow pop-ups for this site to print or save the PDF.");return}
  w.document.open();w.document.write(html);w.document.close()}
