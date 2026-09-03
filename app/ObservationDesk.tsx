"use client";
import{useEffect,useState}from"react";
import{MessageSquareWarning,Search,Send,Trash2,X}from"lucide-react";
import{csv,priorities,shift,stamp,today,useAsync,useWorkforce}from"./workforce-store";
import type{Employee,Observation,Priority}from"./workforce-store";
import{Empty,ErrorBlock,Loading,Pager}from"./WorkforceShared";
import Attachments from"./Attachments";

const LIMIT=25;
const OBS_STATUS=["Open","Acknowledged","Resolved","Closed"];
const obsTone=(s:string)=>s==="Resolved"||s==="Closed"?"green":s==="Acknowledged"?"blue":"amber";

export default function ObservationDesk({openProfile,flash}:{openProfile:(id:string)=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [raw,setRaw]=useState("");
  const [q,setQ]=useState("");
  const [status,setStatus]=useState("");
  const [mine,setMine]=useState("");
  const [offset,setOffset]=useState(0);
  const [open,setOpen]=useState<string|null>(null);
  const [compose,setCompose]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>{setQ(raw);setOffset(0)},300);return()=>clearTimeout(t)},[raw]);

  const{data,loading,error}=useAsync(()=>wf.api.observations({q,status:status||undefined,
    deptId:wf.dept||undefined,taggedTo:mine||undefined,limit:LIMIT,offset}),
    [q,status,mine,wf.dept,offset,wf.version]);
  const rows=data?.observations||[];
  const total=data?.total||0;

  return <div className="page">
    <div className="intro"><div><small>OBSERVATIONS</small><h2>Raised and answered</h2>
      <p>Tag the people who need to answer. Everyone tagged sees the thread and can reply.</p></div>
      <div className="wf-head-tools">
        <button onClick={()=>csv([["Ref","Observation","Risk","Status","Tagged","Raised by","Raised",
          "Target","Replies","Resolution"],
          ...rows.map(o=>[o.ref,o.title,o.risk,o.status,o.tags.map(t=>t.name).join("; "),
            o.raisedBy,stamp(o.raisedAt),o.target,o.replyCount,o.resolution])],"observations.csv")}>
          Export page</button>
        <button className="primary" onClick={()=>setCompose(true)}><MessageSquareWarning/>Raise observation</button>
      </div></div>

    <div className="toolbar">
      <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Search observation or reference"/></label>
      <select className="wf-select" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}>
        <option value="">All statuses</option>{OBS_STATUS.map(s=><option key={s}>{s}</option>)}</select>
      <TaggedToPicker value={mine} onChange={v=>{setMine(v);setOffset(0)}}/>
    </div>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>OBSERVATION REGISTER</small>
        <h2>{total.toLocaleString()} observations</h2></div>{loading&&<span>Loading…</span>}</div>
      {error?<ErrorBlock message={error} retry={wf.refresh}/>
      :loading&&!rows.length?<Loading/>
      :!rows.length?<Empty label="No observations match this filter."/>
      :<><div className="table-wrap"><table className="wf-wide"><thead><tr>
        <th>REF</th><th>OBSERVATION</th><th>TAGGED TO</th><th>RISK</th><th>TARGET</th>
        <th>REPLIES</th><th>STATUS</th><th>ACTION</th></tr></thead>
        <tbody>{rows.map(o=><tr key={o.id} onClick={()=>setOpen(o.id)}>
          <td><b>{o.ref}</b></td>
          <td>{o.title}{o.detail&&<small>{o.detail}</small>}</td>
          <td><div className="wf-tags">{o.tags.map(t=>
            <button key={t.id} className="wf-tag" onClick={e=>{e.stopPropagation();openProfile(t.id)}}>
              {t.name}</button>)}</div></td>
          <td><span className={`badge ${o.risk.toLowerCase()}`}>{o.risk}</span></td>
          <td>{o.target&&o.target<today()&&o.status!=="Resolved"&&o.status!=="Closed"
            ?<span className="badge red">{o.target}</span>:o.target||"—"}</td>
          <td>{o.replyCount}{o.lastReplyAt&&<small>last {stamp(o.lastReplyAt)}</small>}</td>
          <td><span className={`badge ${obsTone(o.status)}`}>{o.status}</span></td>
          <td><div className="wf-actions"><button onClick={e=>{e.stopPropagation();setOpen(o.id)}}>
            Open thread</button></div></td></tr>)}</tbody></table></div>
      <Pager total={total} limit={LIMIT} offset={offset} setOffset={setOffset}/></>}
    </section>

    {compose&&<ObservationEditor observation={null} close={()=>setCompose(false)} flash={flash}/>}
    {open&&<ObservationThread id={open} close={()=>setOpen(null)} flash={flash} openProfile={openProfile}/>}
  </div>}

/* Employee search used both for the "tagged to me" filter and for tagging. */
function TaggedToPicker({value,onChange}:{value:string;onChange:(v:string)=>void}){
  const wf=useWorkforce();
  const [term,setTerm]=useState("");
  const{data}=useAsync(()=>wf.api.employees({q:term,limit:20,active:"1"}),[term],term.length>1);
  const people=data?.employees||[];
  return <select className="wf-select" value={value} onChange={e=>onChange(e.target.value)}
    onFocus={()=>{if(!term)setTerm("a")}}>
    <option value="">Everyone</option>
    {value&&!people.some(p=>p.id===value)&&<option value={value}>Tagged to {value}</option>}
    {people.map(p=><option key={p.id} value={p.id}>Tagged to {p.name}</option>)}
  </select>}

export function ObservationEditor({observation,close,flash}:{
  observation:Observation|null;close:()=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [title,setTitle]=useState(observation?.title||"");
  const [detail,setDetail]=useState(observation?.detail||"");
  const [risk,setRisk]=useState<Priority>(observation?.risk||"Medium");
  const [target,setTarget]=useState(observation?.target||shift(today(),7));
  const [tags,setTags]=useState<{id:string;name:string}[]>(observation?.tags||[]);
  const [term,setTerm]=useState("");
  const [busy,setBusy]=useState(false);
  const isNew=!observation;
  const{data}=useAsync(()=>wf.api.employees({q:term,limit:25,active:"1"}),[term],term.length>1);
  const results=(data?.employees||[]).filter(p=>!tags.some(t=>t.id===p.id));

  const add=(p:Employee)=>{setTags(v=>v.concat([{id:p.id,name:p.name}]));setTerm("")};
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!tags.length)return flash("Tag at least one employee so somebody can respond");
    setBusy(true);
    try{
      const rest=observation?{...observation,tags:undefined}:{};
      await wf.api.saveObservation({...rest,title,detail,risk,target,
        deptId:wf.dept,raisedBy:wf.actor,tags:tags.map(t=>t.id)},isNew);
      flash(isNew?`Observation sent to ${tags.length} employee${tags.length===1?"":"s"}`:"Observation updated");
      close()}
    catch(err){flash(err instanceof Error?err.message:"Could not save")}
    finally{setBusy(false)}};

  return <><button className="overlay" onClick={close}/><form className="modal wf-tall" onSubmit={submit}>
    <header><div><small>{isNew?"RAISE OBSERVATION":"EDIT OBSERVATION"}</small>
      <h2>{title||"New observation"}</h2></div><button type="button" onClick={close}><X/></button></header>
    <div className="form">
      <label className="wide">Observation<input required value={title} onChange={e=>setTitle(e.target.value)}
        placeholder="What needs attention?"/></label>
      <label>Risk<select value={risk} onChange={e=>setRisk(e.target.value as Priority)}>
        {priorities.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Response due<input type="date" value={target} onChange={e=>setTarget(e.target.value)}/></label>
      <label className="wide">Detail<textarea value={detail} onChange={e=>setDetail(e.target.value)}
        placeholder="Give enough context for the people you tag to act on it."/></label>
      <label className="wide">Tag employees
        <input value={term} onChange={e=>setTerm(e.target.value)}
          placeholder="Type a name to search, then pick from the list"/>
        {!!results.length&&<div className="wf-picker">{results.map(p=>
          <button type="button" key={p.id} onClick={()=>add(p)}>
            <b>{p.name}</b><small>{p.designation||p.code}</small></button>)}</div>}
      </label>
      <div className="wide">
        <div className="wf-tags">
          {tags.length?tags.map(t=><span key={t.id} className="wf-tag on">{t.name}
            <button type="button" onClick={()=>setTags(v=>v.filter(x=>x.id!==t.id))}>×</button></span>)
            :<small className="wf-empty">Nobody tagged yet. Search above and pick at least one person.</small>}
        </div>
      </div>
      <p className="wide wf-note">Everyone tagged sees this in their observation list and can reply
        in the thread. The reply history is kept with the observation.</p>
    </div>
    <footer><button type="button" onClick={close}>Cancel</button>
      <button className="primary" disabled={busy||!title||!tags.length}>
        {busy?"Sending…":isNew?"Send to tagged employees":"Save"}</button></footer>
  </form></>}

function ObservationThread({id,close,flash,openProfile}:{
  id:string;close:()=>void;flash:(m:string)=>void;openProfile:(id:string)=>void}){
  const wf=useWorkforce();
  const [text,setText]=useState("");
  const [busy,setBusy]=useState(false);
  const [edit,setEdit]=useState(false);
  const{data,loading,error}=useAsync(()=>wf.api.observation(id),[id,wf.version]);
  const o=data?.observation;
  const replies=data?.replies||[];

  const send=async(e:React.FormEvent)=>{
    e.preventDefault();
    const body=text.trim();
    if(!body)return;
    setBusy(true);
    try{await wf.api.addReply(id,body);setText("");flash("Reply added")}
    catch(err){flash(err instanceof Error?err.message:"Could not reply")}
    finally{setBusy(false)}};

  const act=async(action:"resolve"|"reopen")=>{
    try{await wf.api.saveObservation({id,action},false);
      flash(action==="resolve"?"Observation resolved":"Observation reopened")}
    catch(err){flash(err instanceof Error?err.message:"Could not update")}};

  return <><button className="overlay" onClick={close}/><aside className="detail wf-profile">
    <header><div><small>OBSERVATION</small><h2>{o?.ref||"Loading"}</h2></div>
      <button onClick={close}><X/></button></header>
    <div className="detail-body">
      {loading&&!o?<Loading/>
      :error||!o?<ErrorBlock message={error||"Not found"} retry={wf.refresh}/>
      :<>
        <span className={`badge ${obsTone(o.status)}`}>{o.status}</span>{" "}
        <span className={`badge ${o.risk.toLowerCase()}`}>{o.risk}</span>
        <h3 className="wf-obs-title">{o.title}</h3>
        {o.detail&&<p className="wf-jd">{o.detail}</p>}
        <div className="facts">
          {[["Raised by",o.raisedBy||"—"],["Raised",stamp(o.raisedAt)],
            ["Response due",o.target||"—"],["Replies",String(o.replyCount)]]
            .map(f=><label key={f[0]}>{f[0]}<b>{f[1]}</b></label>)}
        </div>
        <section><h4>Tagged employees</h4>
          <div className="wf-tags">{o.tags.map(t=>
            <button key={t.id} className="wf-tag" onClick={()=>openProfile(t.id)}>{t.name}</button>)}</div>
        </section>
        <section><h4>Thread</h4>
          {!replies.length&&<p className="wf-empty">No replies yet. The people tagged above can answer here.</p>}
          <div className="wf-thread">
            {replies.map(r=><article key={r.id}>
              <b>{r.authorName||"Unknown"}</b>
              <p>{r.text}</p>
              <time>{new Date(r.at).toLocaleString("en-GB",{day:"2-digit",month:"short",
                hour:"2-digit",minute:"2-digit"})}</time>
            </article>)}
          </div>
          <form className="wf-composer" onSubmit={send}>
            <input value={text} onChange={e=>setText(e.target.value)}
              placeholder="Write a reply" disabled={busy}/>
            <button className="primary" disabled={busy||!text.trim()}><Send/>Reply</button>
          </form>
        </section>
        <Attachments entityType="observation" entityId={o.id} flash={flash}/>
        <div className="wf-profile-actions">
          {o.status==="Resolved"||o.status==="Closed"
            ?<button onClick={()=>act("reopen")}>Reopen</button>
            :<button className="primary" onClick={()=>act("resolve")}>Mark resolved</button>}
          <button onClick={()=>setEdit(true)}>Edit &amp; retag</button>
          <button className="wf-danger" onClick={async()=>{
            if(!confirm(`Delete ${o.ref}? The thread is deleted with it.`))return;
            try{await wf.api.removeObservation(id);flash("Observation deleted");close()}
            catch(e){flash(e instanceof Error?e.message:"Could not delete")}}}>
            <Trash2/>Delete</button>
        </div>
      </>}
    </div>
  </aside>
  {edit&&o&&<ObservationEditor observation={o} close={()=>setEdit(false)} flash={flash}/>}</>}
