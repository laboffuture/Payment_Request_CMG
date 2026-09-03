"use client";
import{useEffect,useState}from"react";
import{MessageSquareWarning,Search}from"lucide-react";
import{csv,queryStatuses,stamp,statusTone,useAsync,useWorkforce}from"./workforce-store";
import type{Query}from"./workforce-store";
import{Empty,ErrorBlock,Loading,Pager,QueryEditor}from"./WorkforceShared";

const LIMIT=25;

export default function QueryDesk({openProfile,flash}:{openProfile:(id:string)=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [raw,setRaw]=useState("");
  const [q,setQ]=useState("");
  const [status,setStatus]=useState("");
  const [offset,setOffset]=useState(0);
  const [edit,setEdit]=useState<{query:Partial<Query>;isNew:boolean}|null>(null);
  useEffect(()=>{const t=setTimeout(()=>{setQ(raw);setOffset(0)},300);return()=>clearTimeout(t)},[raw]);

  const{data,loading,error}=useAsync(()=>wf.api.queries({q,deptId:wf.dept||undefined,
    status:status||undefined,limit:LIMIT,offset}),[q,wf.dept,status,offset,wf.version]);
  const rows=data?.queries||[];
  const total=data?.total||0;

  const act=async(query:Query,action:"follow-up"|"resolve")=>{
    try{await wf.api.queryAction(query.id,action);
      flash(action==="follow-up"?`Follow-up recorded on ${query.ref}`:`${query.ref} marked resolved`)}
    catch(e){flash(e instanceof Error?e.message:"Could not update")}};

  return <div className="page">
    <div className="intro"><div><small>QUERY CONTROL</small><h2>Queries</h2>
      <p>Raised, followed up and sorted out. Every follow-up is counted against the query.</p></div>
      <button className="primary" onClick={()=>setEdit({isNew:true,query:{title:"",employeeId:"",
        deptId:wf.dept,priority:"Medium",status:"Open",raisedBy:wf.actor,followUps:0}})}>
        <MessageSquareWarning/>Raise query</button></div>

    <div className="toolbar">
      <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Search query or reference"/></label>
      <select className="wf-select" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}>
        <option value="">All statuses</option>{queryStatuses.map(s=><option key={s}>{s}</option>)}</select>
      <button onClick={()=>csv([["Ref","Query","Against","Raised by","Raised","Follow-ups","Last follow-up","Status","Resolved","Resolution"],
        ...rows.map(x=>[x.ref,x.title,x.employeeId,x.raisedBy,x.raisedAt,x.followUps,x.lastFollowUpAt,
          x.status,x.resolvedAt,x.resolution])],"queries-page.csv")}>Export page</button>
    </div>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>QUERY REGISTER</small><h2>{total.toLocaleString()} queries</h2></div>
        {loading&&<span>Loading…</span>}</div>
      {error?<ErrorBlock message={error} retry={wf.refresh}/>
      :loading&&!rows.length?<Loading/>
      :!rows.length?<Empty label="No queries match this filter."/>
      :<><div className="table-wrap"><table className="wf-wide"><thead><tr>
        <th>REF</th><th>QUERY</th><th>AGAINST</th><th>PRIORITY</th><th>RAISED</th>
        <th>FOLLOW-UPS</th><th>STATUS</th><th>RESOLUTION</th><th>ACTION</th></tr></thead>
        <tbody>{rows.map(x=><tr key={x.id} onClick={()=>setEdit({query:x,isNew:false})}>
          <td><b>{x.ref}</b></td>
          <td>{x.title}{x.detail&&<small>{x.detail}</small>}</td>
          <td><button className="wf-link plain" onClick={e=>{e.stopPropagation();openProfile(x.employeeId)}}>{x.employeeId}</button></td>
          <td><span className={`badge ${x.priority.toLowerCase()}`}>{x.priority}</span></td>
          <td>{stamp(x.raisedAt)}</td>
          <td>{x.followUps}{x.lastFollowUpAt&&<small>last {stamp(x.lastFollowUpAt)}</small>}</td>
          <td><span className={`badge ${statusTone(x.status)}`}>{x.status}</span></td>
          <td>{x.resolution||"—"}</td>
          <td onClick={e=>e.stopPropagation()}><div className="wf-actions">
            <button onClick={()=>act(x,"follow-up")}>Follow up</button>
            {x.status!=="Resolved"&&x.status!=="Closed"&&<button onClick={()=>act(x,"resolve")}>Resolve</button>}
          </div></td></tr>)}</tbody></table></div>
      <Pager total={total} limit={LIMIT} offset={offset} setOffset={setOffset}/></>}
    </section>
    {edit&&<QueryEditor query={edit.query} isNew={edit.isNew} close={()=>setEdit(null)} flash={flash}/>}
  </div>}
