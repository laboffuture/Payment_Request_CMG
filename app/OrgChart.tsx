"use client";
import{useState}from"react";
import{Building2,ChevronDown,ChevronRight,Pencil,Plus,UserRound}from"lucide-react";
import{readable,useAsync,useWorkforce}from"./workforce-store";
import type{Employee,Role}from"./workforce-store";
import{DeptEditor,EmployeeEditor,Empty,ErrorBlock,Loading,RoleEditor,Avatar}from"./WorkforceShared";

export default function OrgChart({openProfile,flash,readOnly}:{readOnly?:boolean;openProfile:(id:string)=>void;flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const [roleEdit,setRoleEdit]=useState<Partial<Role>|null>(null);
  const [deptEdit,setDeptEdit]=useState<Partial<{id:string;name:string;code:string;color:string;position:number}>|null>(null);
  const [empEdit,setEmpEdit]=useState<Partial<Employee>|null>(null);

  const roots=wf.roles.filter(r=>!r.parentId||!wf.roles.some(p=>p.id===r.parentId));
  const toggle=(id:string)=>setCollapsed(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n});
  const dept=wf.deptById(wf.dept);

  if(wf.loading)return <div className="page"><Loading label="Loading the organisation"/></div>;
  if(wf.error)return <div className="page"><ErrorBlock message={wf.error} retry={wf.refresh}/></div>;
  if(!wf.ready)return <div className="page"><SetupPrompt flash={flash}/></div>;

  return <div className="page">
    <div className="intro"><div><small>GROUP STRUCTURE</small><h2>Organisation charts</h2>
      <p>Each department keeps its own chart. Click any employee to open their full record.</p></div>
      <div className="wf-head-tools">
        <label className="wf-viewas">Department
          <select value={wf.dept} onChange={e=>wf.setDept(e.target.value)}>
            {wf.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
{!readOnly&&<><button onClick={()=>setDeptEdit({id:`d-${Date.now().toString(36)}`,name:"",code:"",color:"#0b725d",position:wf.departments.length})}>
          <Building2/>New chart</button>
        {dept&&<button onClick={()=>setDeptEdit({...dept})}><Pencil/>Edit chart</button>}
        <button className="primary" onClick={()=>setRoleEdit({id:`r-${Date.now().toString(36)}`,deptId:wf.dept,
          name:"",type:"Support",parentId:roots[0]?.id||null,color:"#3f70c7",jd:""})}><Plus/>Add role</button></>}
      </div></div>

    <section className="panel wf-tree">
      {!roots.length&&<Empty label="No roles in this chart yet. Use Add role to begin."/>}
      {roots.map(r=><Node key={r.id} role={r} depth={0} collapsed={collapsed} toggle={toggle}
        openProfile={openProfile} setRoleEdit={setRoleEdit} setEmpEdit={setEmpEdit} readOnly={readOnly}/>)}
    </section>

    {roleEdit&&<RoleEditor role={roleEdit} close={()=>setRoleEdit(null)} flash={flash}/>}
    {deptEdit&&<DeptEditor dept={deptEdit} close={()=>setDeptEdit(null)} flash={flash}/>}
    {empEdit&&<EmployeeEditor employee={empEdit} close={()=>setEmpEdit(null)} flash={flash}/>}
  </div>}

function SetupPrompt({flash}:{flash:(m:string)=>void}){
  const wf=useWorkforce();
  const [busy,setBusy]=useState(false);
  return <section className="panel wf-setup">
    <h2>No workforce data yet</h2>
    <p>This deployment has an empty workforce database. Load the starter structure to get both
      the Group Accounts and Audit charts, sample staff, tasks, tokens and queries — then edit
      or replace anything from the screens.</p>
    <button className="primary" disabled={busy} onClick={async()=>{setBusy(true);
      try{await wf.api.seed();flash("Starter structure loaded")}
      catch(e){flash(e instanceof Error?e.message:"Could not load")}finally{setBusy(false)}}}>
      {busy?"Loading…":"Load starter structure"}</button>
  </section>}

/* Each role node loads only the first page of its own staff. A role holding 800
   people renders 25 rows and a "show all" link, not 800 DOM nodes. */
function Node({role,depth,collapsed,toggle,openProfile,setRoleEdit,setEmpEdit,readOnly}:{readOnly?:boolean;
  role:Role;depth:number;collapsed:Set<string>;toggle:(id:string)=>void;openProfile:(id:string)=>void;
  setRoleEdit:(r:Partial<Role>)=>void;setEmpEdit:(e:Partial<Employee>)=>void}){
  const wf=useWorkforce();
  const [showAll,setShowAll]=useState(false);
  const open=!collapsed.has(role.id);
  const kids=wf.roles.filter(r=>r.parentId===role.id);
  const {data,loading}=useAsync(()=>wf.api.employees({roleId:role.id,limit:showAll?200:25}),
    [role.id,showAll,wf.version],open);
  const staff=data?.employees||[];
  const total=data?.total||0;
  const ink=readable(role.color);

  return <div className="wf-node" style={{marginLeft:depth?22:0}}>
    <div className="wf-card" style={{borderLeftColor:role.color}}>
      <button className="wf-toggle" onClick={()=>toggle(role.id)} aria-label="Expand">
        {kids.length||total?(open?<ChevronDown/>:<ChevronRight/>):<span className="wf-dot"/>}</button>
      <span className="wf-chip" style={{background:role.color,color:ink}}>{role.type}</span>
      <div className="wf-card-main"><b>{role.name}</b>
        <small>{loading?"counting…":`${total} employee${total===1?"":"s"}`} · {kids.length} sub-role{kids.length===1?"":"s"}
          {role.jd?" · JD set":" · no JD"}</small></div>
{!readOnly&&<div className="wf-node-actions">
        <button onClick={()=>setEmpEdit({id:`new-${Date.now()}`,roleId:role.id,deptId:role.deptId,name:"",code:"",
          designation:role.name,department:"",reportsTo:null,email:"",phone:"",jd:"",photoAt:"",active:true,joined:""})}>
          <UserRound/>Employee</button>
        <button onClick={()=>setRoleEdit({id:`r-${Date.now().toString(36)}`,deptId:role.deptId,name:"",
          type:"Support",parentId:role.id,color:role.color,jd:""})}><Plus/>Role</button>
        <button onClick={()=>setRoleEdit({...role})}><Pencil/></button>
      </div>}
    </div>
    {open&&<>
      {staff.map(e=><button className="wf-person" key={e.id} onClick={()=>openProfile(e.id)}
        style={{marginLeft:22,borderLeftColor:role.color}}>
        <Avatar employee={e} size={30} color={role.color}/>
        <span><b>{e.name}</b><small>{e.code} · {e.designation||role.name}{e.active?"":" · inactive"}</small></span>
      </button>)}
      {total>staff.length&&<button className="wf-more" style={{marginLeft:22}} onClick={()=>setShowAll(true)}>
        Show all {total} in this role</button>}
      {kids.map(k=><Node key={k.id} role={k} depth={depth+1} collapsed={collapsed} toggle={toggle}
        openProfile={openProfile} setRoleEdit={setRoleEdit} setEmpEdit={setEmpEdit} readOnly={readOnly}/>)}
    </>}
  </div>}
