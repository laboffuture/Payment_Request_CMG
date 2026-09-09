"use client";
import{ExtraFields,packExtra,useExtraFields}from"./ExtraFields";
import{useCallback,useEffect,useState}from"react";
import{Check,GraduationCap,Paperclip,Plus,Star,Trash2,X,Upload}from"lucide-react";
import Attachments,{asDataUrl}from"./Attachments";

type Training={id:string;ref:string;topic:string;reason:string;employeeName:string;department:string;
  requestedBy:string;status:string;requestedAt:string;acceptedBy:string;acceptedAt:string;
  completedBy:string;completedAt:string;rating:number;feedback:string};

const stamp=(v:string)=>v?new Date(v).toLocaleDateString("en-GB",
  {day:"2-digit",month:"short",year:"numeric"}):"—";
const tone=(s:string)=>s==="Completed"?"green":s==="Accepted"?"blue":"amber";

export default function TrainingDesk({flash}:{flash:(m:string)=>void}){
  const[rows,setRows]=useState<Training[]>([]);
  const[me,setMe]=useState("");
  const[canDeliver,setCanDeliver]=useState(false);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const[open,setOpen]=useState(false);
  const[topic,setTopic]=useState("");
  const[reason,setReason]=useState("");
  const[deptId,setDeptId]=useState("");
  const[employeeId,setEmployeeId]=useState("");
  const[depts,setDepts]=useState<{id:string;name:string}[]>([]);
  const[people,setPeople]=useState<{id:string;name:string;designation:string}[]>([]);
  const xFields=useExtraFields("training");
  const[xVals,setXVals]=useState<Record<string,string>>({});
  const[busy,setBusy]=useState(false);
  const[rating,setRating]=useState<{id:string;stars:number;note:string}|null>(null);
  const[files,setFiles]=useState<File[]>([]);
  const[docsFor,setDocsFor]=useState<Training|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/workforce/training?limit=100");
      const b=await r.json() as{trainings?:Training[];me?:string;canDeliver?:boolean;error?:string};
      if(!r.ok)throw new Error(b.error||"Could not load training requests");
      setRows(b.trainings||[]);setMe(b.me||"");setCanDeliver(!!b.canDeliver);
    }catch(e){setError(e instanceof Error?e.message:"Could not load training requests")}
    finally{setLoading(false)}},[]);
  useEffect(()=>{load()},[load]);
  useEffect(()=>{fetch("/api/workforce").then(r=>r.json() as Promise<{departments?:{id:string;name:string}[]}>)
    .then(b=>setDepts(b.departments||[])).catch(()=>{})},[]);
  /* The employee list follows the department, so a long register never has to be
     scrolled in full. With no department chosen it shows everyone. */
  useEffect(()=>{
    const q=deptId?`?active=1&limit=200&deptId=${encodeURIComponent(deptId)}`:"?active=1&limit=200";
    fetch("/api/workforce/employees"+q)
      .then(r=>r.json() as Promise<{employees?:{id:string;name:string;designation:string}[]}>)
      .then(b=>setPeople(b.employees||[])).catch(()=>setPeople([]));
    setEmployeeId(v=>v&&(deptId?"":v)||"");
  },[deptId]);

  const send=async(body:Record<string,unknown>,ok:string)=>{
    setBusy(true);
    try{
      const r=await fetch("/api/workforce/training",{method:"PATCH",
        headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const b=await r.json().catch(()=>({})) as{error?:string};
      if(!r.ok)throw new Error(b.error||"That change was refused");
      flash(ok);await load();
    }catch(e){flash(e instanceof Error?e.message:"That change was refused")}
    finally{setBusy(false)}};

  const raise=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(topic.trim().length<3)return;
    setBusy(true);
    try{
      const r=await fetch("/api/workforce/training",{method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({topic:topic.trim(),reason:reason.trim(),employeeId,deptId,
            extra:packExtra(xFields,xVals)})});
      const b=await r.json().catch(()=>({})) as{error?:string;training?:{id:string}};
      if(!r.ok)throw new Error(b.error||"Could not raise the request");
      /* Uploaded after the request exists, because that is when it has the id the
         documents hang off. A file that is refused does not lose the request. */
      const id=b.training?.id;
      if(id)for(const file of files){
        try{const dataUrl=await asDataUrl(file);
          await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},
            body:JSON.stringify({entityType:"training",entityId:id,kind:"Other",fileName:file.name,dataUrl})});
        }catch{}}
      setOpen(false);setTopic("");setReason("");setDeptId("");setEmployeeId("");setFiles([]);
      flash(files.length?`Training request raised with ${files.length} document${files.length===1?"":"s"}`:"Training request raised");await load();
    }catch(e){flash(e instanceof Error?e.message:"Could not raise the request")}
    finally{setBusy(false)}};

  const mine=rows.filter(r=>r.requestedBy===me);
  const others=rows.filter(r=>r.requestedBy!==me);

  const table=(list:Training[],own:boolean)=><div className="table-wrap"><table><thead><tr>
    <th>REFERENCE</th><th>TOPIC</th><th>FOR</th><th>{own?"RAISED":"ASKED BY"}</th>
    <th>STATUS</th><th>RATING</th><th>ACTIONS</th></tr></thead>
    <tbody>{list.map(t=><tr key={t.id}>
      <td><b>{t.ref}</b><small>{stamp(t.requestedAt)}</small></td>
      <td>{t.topic}{t.reason&&<small>{t.reason}</small>}</td>
      <td>{t.employeeName||"—"}{t.department&&<small>{t.department}</small>}</td><td>{own?stamp(t.requestedAt):(t.employeeName||t.requestedBy)}</td>
      <td><span className={`badge ${tone(t.status)}`}>{t.status}</span>
        {t.acceptedBy&&<small>{t.status==="Completed"?"delivered by ":"taken by "}{t.completedBy||t.acceptedBy}</small>}</td>
      <td>{t.rating?<span className="tr-stars">{"★".repeat(t.rating)}<i>{"★".repeat(5-t.rating)}</i></span>:"—"}</td>
      <td><div className="wf-actions">
        {canDeliver&&t.status==="Requested"&&
          <button disabled={busy} onClick={()=>send({id:t.id,action:"accept"},"Training request taken on")}>Take on</button>}
        {canDeliver&&t.status==="Accepted"&&
          <button disabled={busy} onClick={()=>send({id:t.id,action:"complete"},"Training marked delivered")}><Check/>Delivered</button>}
        {own&&t.status==="Completed"&&!t.rating&&
          <button disabled={busy} onClick={()=>setRating({id:t.id,stars:5,note:""})}><Star/>Rate it</button>}
        <button disabled={busy} title="Documents" onClick={()=>setDocsFor(t)}><Paperclip/></button>
        {own&&t.status!=="Completed"&&
          <button className="wf-danger-icon" disabled={busy} title="Withdraw this request"
            onClick={()=>{if(confirm("Withdraw this training request?"))send({id:t.id,action:"cancel"},"Request withdrawn")}}><Trash2/></button>}
      </div></td></tr>)}</tbody></table></div>;

  return <div className="page">
    <div className="intro"><div><small>LEARNING</small><h2>Training</h2>
      <p>Ask to be taught something you need for the work. A colleague takes it on, marks it
      delivered, and you say whether it helped.</p></div>
      <button className="primary intro-action" onClick={()=>setOpen(true)}><Plus/>Request training</button></div>

    {error&&<div className="panel company-empty">{error}</div>}
    {loading&&!rows.length&&<div className="panel company-empty">Loading…</div>}

    <section className="panel table-panel">
      <div className="panel-head"><div><small>MY REQUESTS</small><h2>What I have asked for</h2></div></div>
      {mine.length?table(mine,true)
        :<p className="queue-empty">You have not asked for any training yet.</p>}
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>EVERYONE ELSE</small><h2>Open across the team</h2></div></div>
      {others.length?table(others,false)
        :<p className="queue-empty">Nobody else has an open training request.</p>}
    </section>

    {open&&<><button className="overlay" onClick={()=>setOpen(false)}/>
      <form className="modal" onSubmit={raise}>
        <header><div><small>LEARNING</small><h2>Request training</h2></div>
          <button type="button" onClick={()=>setOpen(false)}><X/></button></header>
        <div className="form">
          <label>Department
            <select value={deptId} onChange={e=>setDeptId(e.target.value)}>
              <option value="">All departments</option>
              {depts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Who is it for?
            <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
              <option value="">Myself</option>
              {people.map(x=><option key={x.id} value={x.id}>{x.name}{x.designation?` — ${x.designation}`:""}</option>)}</select></label>
          <label className="wide">What do you want to be trained on?
            <input required minLength={3} value={topic} onChange={e=>setTopic(e.target.value)}
              placeholder="e.g. Raising a payment request with the right documents"/></label>
          <label className="wide">Why do you need it? <small className="wf-hint">Optional, but it helps whoever picks it up.</small>
            <textarea value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="What are you stuck on, or what would you do differently afterwards?"/></label>
          <label className="wide upload">
            <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
              onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
            <Upload/><b>Attach anything that helps</b><small>Images, PDF, Word, Excel, CSV or ZIP — up to 15 MB each</small>
            {files.length>0&&<small className="upload-list">{files.length} file{files.length===1?"":"s"}: {files.map(f=>f.name).join(", ")}</small>}</label>
              <ExtraFields form="training" values={xVals} onChange={setXVals}/>
    </div>
        <footer><button type="button" onClick={()=>setOpen(false)}>Cancel</button>
          <button className="primary" disabled={busy||topic.trim().length<3}>
            <GraduationCap/>{busy?"Sending…":"Raise request"}</button></footer>
      </form></>}

    {docsFor&&<><button className="overlay" onClick={()=>setDocsFor(null)}/>
      <div className="modal">
        <header><div><small>{docsFor.ref}</small><h2>Documents</h2></div>
          <button type="button" onClick={()=>setDocsFor(null)}><X/></button></header>
        <div className="form"><div className="wide">
          <Attachments entityType="training" entityId={docsFor.id} flash={flash}/></div></div>
        <footer><button type="button" onClick={()=>setDocsFor(null)}>Close</button></footer>
      </div></>}

    {rating&&<><button className="overlay" onClick={()=>setRating(null)}/>
      <form className="modal" onSubmit={e=>{e.preventDefault();
        send({id:rating.id,action:"feedback",rating:rating.stars,feedback:rating.note},"Thank you - feedback saved")
          .then(()=>setRating(null))}}>
        <header><div><small>FEEDBACK</small><h2>Did the training help?</h2></div>
          <button type="button" onClick={()=>setRating(null)}><X/></button></header>
        <div className="form">
          <label className="wide">Rating
            <div className="tr-rate">{[1,2,3,4,5].map(n=>
              <button type="button" key={n} className={n<=rating.stars?"on":""}
                onClick={()=>setRating({...rating,stars:n})} aria-label={`${n} of 5`}>★</button>)}</div></label>
          <label className="wide">Anything to add?
            <textarea value={rating.note} onChange={e=>setRating({...rating,note:e.target.value})}
              placeholder="What was useful, or what is still unclear?"/></label>
        </div>
        <footer><button type="button" onClick={()=>setRating(null)}>Cancel</button>
          <button className="primary" disabled={busy}><Star/>Save feedback</button></footer>
      </form></>}
  </div>;
}
