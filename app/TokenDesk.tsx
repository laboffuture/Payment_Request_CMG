"use client";
import{useEffect,useState}from"react";
import{Plus,Search}from"lucide-react";
import{csv,dayLabel,readable,statuses,statusTone,today,useAsync,useWorkforce}from"./workforce-store";
import type{Token}from"./workforce-store";
import{Empty,ErrorBlock,Loading,Pager,TokenEditor}from"./WorkforceShared";

const LIMIT=25;

export default function TokenDesk({openProfile,flash}:{openProfile:(id:string)=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [raw,setRaw]=useState("");
  const [q,setQ]=useState("");
  const [status,setStatus]=useState("");
  const [offset,setOffset]=useState(0);
  const [edit,setEdit]=useState<{token:Partial<Token>;isNew:boolean}|null>(null);
  useEffect(()=>{const t=setTimeout(()=>{setQ(raw);setOffset(0)},300);return()=>clearTimeout(t)},[raw]);

  const{data,loading,error}=useAsync(()=>wf.api.tokens({q,deptId:wf.dept||undefined,
    status:status||undefined,limit:LIMIT,offset}),[q,wf.dept,status,offset,wf.version]);
  const rows=data?.tokens||[];
  const total=data?.total||0;
  const totals=rows.reduce((a,t)=>({qty:a.qty+t.qty,done:a.done+t.done}),{qty:0,done:0});

  return <div className="page">
    <div className="intro"><div><small>SHARED SERVICES</small><h2>Token work</h2>
      <p>Batch work issued by a functional head to support staff, tracked by quantity.</p></div>
      <button className="primary" onClick={()=>setEdit({isNew:true,token:{
        number:`TK-${Date.now().toString(36).toUpperCase().slice(-6)}`,taskType:"",created:today(),
        createdBy:wf.actor,employeeId:"",functionRoleId:"",deptId:wf.dept,priority:"Medium",
        reference:"",qty:0,done:0,status:"Not Started",remarks:""}})}><Plus/>Issue token</button></div>

    <div className="metrics wf-metrics-4">
      {[["Tokens on this page",rows.length,"blue"],["Quantity issued",totals.qty,"violet"],
        ["Completed",totals.done,"green"],["Pending",Math.max(totals.qty-totals.done,0),"amber"]]
        .map(x=><article className={String(x[2])} key={String(x[0])}><span>{x[0]}</span><b>{x[1]}</b>
          <small>{total.toLocaleString()} tokens in total</small></article>)}
    </div>

    <div className="toolbar">
      <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Search task type"/></label>
      <select className="wf-select" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}>
        <option value="">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
      <button onClick={()=>csv([["Token","Type","Created","Employee","Reference","Qty","Done","Pending","Priority","Status","Remarks"],
        ...rows.map(t=>[t.number,t.taskType,t.created,t.employeeId,t.reference,t.qty,t.done,
          Math.max(t.qty-t.done,0),t.priority,t.status,t.remarks])],"tokens-page.csv")}>Export page</button>
    </div>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>TOKEN REGISTER</small><h2>{total.toLocaleString()} tokens</h2></div>
        {loading&&<span>Loading…</span>}</div>
      {error?<ErrorBlock message={error} retry={wf.refresh}/>
      :loading&&!rows.length?<Loading/>
      :!rows.length?<Empty label="No tokens match this filter."/>
      :<><div className="table-wrap"><table className="wf-wide"><thead><tr>
        <th>TOKEN</th><th>TASK TYPE</th><th>FUNCTION</th><th>EMPLOYEE</th><th>REFERENCE</th>
        <th>QTY</th><th>DONE</th><th>PENDING</th><th>PRIORITY</th><th>STATUS</th><th>CREATED</th></tr></thead>
        <tbody>{rows.map(t=>{const fn=wf.roleById(t.functionRoleId);return <tr key={t.id} onClick={()=>setEdit({token:t,isNew:false})}>
          <td><b>{t.number}</b></td><td>{t.taskType}</td>
          <td>{fn?<span className="badge" style={{background:fn.color,color:readable(fn.color)}}>{fn.name}</span>:"—"}</td>
          <td><button className="wf-link plain" onClick={e=>{e.stopPropagation();openProfile(t.employeeId)}}>{t.employeeId}</button></td>
          <td>{t.reference||"—"}</td><td>{t.qty}</td><td>{t.done}</td><td>{Math.max(t.qty-t.done,0)}</td>
          <td><span className={`badge ${t.priority.toLowerCase()}`}>{t.priority}</span></td>
          <td><span className={`badge ${statusTone(t.status)}`}>{t.status}</span></td>
          <td>{dayLabel(t.created)}</td></tr>})}</tbody></table></div>
      <Pager total={total} limit={LIMIT} offset={offset} setOffset={setOffset}/></>}
    </section>
    {edit&&<TokenEditor token={edit.token} isNew={edit.isNew} close={()=>setEdit(null)} flash={flash}/>}
  </div>}
