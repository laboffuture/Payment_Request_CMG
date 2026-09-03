"use client";
import{useEffect,useState}from"react";
import{Pencil,Plus,Search,Trash2}from"lucide-react";
import{csv,useAsync,useWorkforce}from"./workforce-store";
import type{Employee}from"./workforce-store";
import{Avatar,EmployeeEditor,Empty,ErrorBlock,Loading,Pager}from"./WorkforceShared";

const LIMIT=25;

export default function EmployeeDirectory({openProfile,flash,openJd,readOnly}:{readOnly?:boolean;
  openProfile:(id:string)=>void;flash:(m:string)=>void;openJd?:(id:string)=>void}){
  const wf=useWorkforce();
  const [raw,setRaw]=useState("");
  const [q,setQ]=useState("");
  const [deptFilter,setDeptFilter]=useState("");
  const [activeOnly,setActiveOnly]=useState(false);
  const [offset,setOffset]=useState(0);
  const [edit,setEdit]=useState<Partial<Employee>|null>(null);

  // searching is debounced so typing does not fire a query per keystroke at 300 users
  useEffect(()=>{const t=setTimeout(()=>{setQ(raw);setOffset(0)},300);return()=>clearTimeout(t)},[raw]);

  const{data,loading,error}=useAsync(()=>wf.api.employees({
    q,deptId:deptFilter||undefined,active:activeOnly?"1":undefined,limit:LIMIT,offset}),
    [q,deptFilter,activeOnly,offset,wf.version]);

  const rows=data?.employees||[];
  const total=data?.total||0;

  const remove=async(e:Employee)=>{
    if(!confirm(`Delete ${e.name}? If they have task, token or query history the record is kept and marked inactive.`))return;
    try{const out=await wf.api.removeEmployee(e.id);
      flash(out.deactivated?`${e.name} marked inactive, history retained`:`${e.name} deleted`)}
    catch(err){flash(err instanceof Error?err.message:"Could not delete")}};

  const exportPage=()=>csv([["Employee ID","Name","Designation","Department","Reports to","Email","Status"],
    ...rows.map(e=>[e.code,e.name,e.designation,e.department,
      e.reportsTo||"",e.email,e.active?"Active":"Inactive"])],"employees-page.csv");

  return <div className="page">
    <div className="intro"><div><small>WORKFORCE</small><h2>Employee register</h2>
      <p>Searched and paged on the server. Click any name for the full record.</p></div>
{!readOnly&&<button className="primary" onClick={()=>setEdit({id:`new-${Date.now()}`,name:"",code:"",designation:"",
        roleId:"",deptId:wf.dept,department:"",reportsTo:null,email:"",phone:"",jd:"",photoAt:"",active:true,joined:""})}>
        <Plus/>Add employee</button>}</div>

    <div className="toolbar">
      <label><Search/><input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Search name, ID or team"/></label>
      <select className="wf-select" value={deptFilter} onChange={e=>{setDeptFilter(e.target.value);setOffset(0)}}>
        <option value="">All departments</option>
        {wf.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
      <button className={activeOnly?"wf-toggle-on":""} onClick={()=>{setActiveOnly(v=>!v);setOffset(0)}}>
        {activeOnly?"Active only":"All statuses"}</button>
      <button onClick={exportPage}>Export page</button>
    </div>

    <section className="panel table-panel">
      <div className="panel-head"><div><small>EMPLOYEE REGISTER</small><h2>{total.toLocaleString()} employees</h2></div>
        {loading&&<span>Loading…</span>}</div>
      {error?<ErrorBlock message={error} retry={wf.refresh}/>
      :loading&&!rows.length?<Loading/>
      :!rows.length?<Empty label="No employees match this filter."/>
      :<><div className="table-wrap"><table><thead><tr>
        <th>EMPLOYEE</th><th>ID</th><th>DESIGNATION</th><th>DEPARTMENT</th><th>EMAIL</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
        <tbody>{rows.map(e=>{const r=wf.roleById(e.roleId);return <tr key={e.id}>
          <td><button className="wf-link" onClick={()=>openProfile(e.id)}>
            <Avatar employee={e} size={28} color={r?.color}/>{e.name}</button></td>
          <td>{e.code}</td><td>{e.designation||"—"}</td>
          <td>{wf.deptById(e.deptId)?.name||e.department||"—"}</td>
          <td>{e.email||"—"}</td>
          <td><span className={`badge ${e.active?"green":"red"}`}>{e.active?"Active":"Inactive"}</span></td>
          <td><div className="wf-actions">
            <button onClick={()=>openProfile(e.id)}>Open</button>
            {openJd&&<button onClick={()=>openJd(e.id)}>JD</button>}
            {!readOnly&&<><button onClick={()=>setEdit({...e})}><Pencil/></button>
            <button className="wf-danger-icon" onClick={()=>remove(e)}><Trash2/></button></>}
          </div></td></tr>})}</tbody></table></div>
      <Pager total={total} limit={LIMIT} offset={offset} setOffset={setOffset}/></>}
    </section>
    {edit&&<EmployeeEditor employee={edit} close={()=>setEdit(null)} flash={flash}/>}
  </div>}
