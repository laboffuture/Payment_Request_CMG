"use client";
import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,Building2,CalendarClock,CalendarDays,CheckCircle2,ChevronDown,CircleDollarSign,ClipboardCheck,FileBarChart,FileText,History,Import,LayoutDashboard,LogOut,Menu,MessageSquareText,Plus,ReceiptText,Search,Settings,ShieldCheck,Users,X,GraduationCap,Upload} from "lucide-react";
import PaymentDetail from "./PaymentDetail";
import {asDataUrl} from "./Attachments";
import PaymentWorkbench from "./PaymentWorkbench";
import RequestorWorkspace from "./RequestorWorkspace";
import AccessSetup from "./AccessSetup";
import RoleDashboard from "./RoleDashboard";
import LoginOverlay,{type Actor} from "./LoginOverlay";
import ImportCentre from "./ImportCentre";
import AuditTaskQueue from "./AuditTaskQueue";
import CompanySetup from "./CompanySetup";
import ReportsCentre from "./ReportsCentre";
import CommunityChat from "./CommunityChat";
import ScheduledPayments from "./ScheduledPayments";
import {WorkforceProvider} from "./workforce-store";
import OrgChart from "./OrgChart";
import EmployeeDirectory from "./EmployeeDirectory";
import {EmployeeProfile} from "./EmployeeProfile";
import {TaskBoard,WorkPeriod} from "./WorkDesk";
import TokenDesk from "./TokenDesk";
import TrainingDesk from "./TrainingDesk";
import {WorkforceOverview,WorkforceReports} from "./WorkforceReports";
import {auditTasksApi,companiesApi} from "./audit-api";
import JobDescription from "./JobDescription";
type Payment={createdAt?:string;tds?:string;nature?:string;poNumber?:string;resubmitNote?:string;resubmittedAt?:string;rejectionNote?:string;rejectedBy?:string;rejectedAt?:string;raisedBy?:string;id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;due:string;urgency:string;status:string;owner:string;department:string};
export type AuditTask={attendees?:string;id:string;title:string;company:string;department:string;kind:"Pre-Audit"|"Post-Audit"|"Meeting"|"Special Audit";status:"Available"|"Accepted"|"In Progress"|"Observation Submitted"|"Response Received"|"Completed";due?:string;assignedTo?:string;plannedStart?:string;plannedEnd?:string;notes?:string;dataProvider?:string};
type Module="dashboard"|"requests"|"payments"|"scheduled"|"preaudit"|"postaudit"|"specialaudit"|"community"|"meetings"|"reports"|"companies"|"users"|"imports"|"organisation"|"employees"|"worktasks"|"training"|"worktokens"|"workjd"|"workreports";
const seed:Payment[]=[];
const auditSeed:AuditTask[]=[];
const specialAuditSeed:AuditTask[]=[];
/* Only screens whose data is stored in D1 appear here. Scheduled payments, community
   chat, companies, the audit queues, meetings and the scorecard still read browser
   state — their tables and APIs are ready but the screens are not yet wired, so they
   are held back rather than shown as if they saved. */
/* This order is the menu order: `visible` filters this list, so every role sees the
   screens in the same sequence and only the ones it may reach. The work people do
   daily comes first; setup and reference screens sit below. */
const nav:{id:Module;label:string;icon:any}[]=([
  ["dashboard","Dashboard",LayoutDashboard],
  ["requests","My payment requests",FileText],
  ["payments","Accounts / Audit queues",CircleDollarSign],
  ["scheduled","Scheduled payments",CalendarClock],
  ["preaudit","Pre-audit tasks",ClipboardCheck],
  ["postaudit","Post-audit tasks",ShieldCheck],
  ["specialaudit","Special audits",AlertTriangle],
  ["meetings","Meetings",CalendarDays],
  ["worktasks","Tasks",ClipboardCheck],
  ["worktokens","Tokens",ReceiptText],
  ["training","Training",GraduationCap],
  // below here: reference and setup, reached far less often
  ["community","Community chat",MessageSquareText],
  ["reports","Reports centre",FileBarChart],
  ["companies","Companies",Building2],
  ["users","Users & access",Users],
  ["imports","Import centre",Import],
  ["organisation","Organisation",Building2],
  ["employees","Employees",Users],
  ["workjd","Job descriptions",FileText],
  ["workreports","Workforce reports",FileBarChart]] as [Module,string,any][])
  .map(([id,label,icon])=>({id,label,icon}));

/* The workforce screens as a set. Management's access is defined as "the workforce
   modules" rather than a list, so the group is still named even though the menu no
   longer keeps them together. */
const workforceIds:Module[]=["organisation","employees","worktasks","worktokens","workjd",
  "training","workreports"];
const tone:Record<string,string>={"Rejected":"red","Requested":"blue","Accountant Review":"amber","Pre-Audit Queue":"blue","Management Approval":"amber","Management Approval: Yes":"green","Management Approval: No":"red","Audit Rejected":"red","Audit Query":"red","Finance Queue":"violet","Approved by Auditor – Ready to Release":"green","Payment Released":"green","Reconciliation":"green","Audit Accepted":"blue","Audit Cleared":"green"};
const access:Record<string,Module[]>={Administrator:nav.map(x=>x.id),Requestor:["dashboard","requests","organisation","employees","worktokens","meetings","community","training","reports"],Accountant:["dashboard","requests","payments","scheduled","organisation","employees","meetings","community","reports","worktasks","training"],Auditor:["dashboard","requests","payments","scheduled","organisation","employees","preaudit","postaudit","specialaudit","meetings","community","reports","worktasks","training"],Finance:["dashboard","payments","organisation","employees","workreports"],Management:["dashboard","payments",...workforceIds],"Audit Head":nav.map(x=>x.id)};
export default function Home(){
 const[active,setActive]=useState<Module>("dashboard"),[payments,setPayments]=useState(seed),[auditTasks,setAuditTasks]=useState([...auditSeed,...specialAuditSeed]),[company,setCompany]=useState("All companies"),[companies,setCompanies]=useState<{id:string;name:string}[]>([]),[departments,setDepartments]=useState<string[]>([]),[natures,setNatures]=useState<string[]>([]),[natureVersion,setNatureVersion]=useState(0),[role,setRole]=useState("Audit Head"),[allowedRoles,setAllowedRoles]=useState<string[]>([]),[userName,setUserName]=useState(""),[userEmail,setUserEmail]=useState(""),[search,setSearch]=useState(""),[drawer,setDrawer]=useState<Payment|null>(null),[form,setForm]=useState(false),[passwordOpen,setPasswordOpen]=useState(false),[profileOpen,setProfileOpen]=useState(false),[mobile,setMobile]=useState(false),[profile,setProfile]=useState<string|null>(null),[jdFor,setJdFor]=useState(""),[period,setPeriod]=useState<"Tasks"|"Daily"|"Weekly"|"Monthly">("Tasks"),[toast,setToast]=useState(""),[todayLabel,setTodayLabel]=useState(""),[booting,setBooting]=useState(true);
 /* Audit tasks store a companyId; the screens show a company name, so the names are
    resolved once here rather than looked up per row. */
 const loadAuditTasks=async()=>{try{
   const[d,co]=await Promise.all([auditTasksApi.load({limit:200}),companiesApi.load().catch(()=>[])]);
   const name=new Map(co.map(c=>[c.id,c.name]));
   setAuditTasks(d.tasks.map(t=>({id:t.id,title:t.title,company:name.get(t.companyId)||t.companyId||"—",
     department:t.department,kind:t.kind as AuditTask["kind"],status:t.status as AuditTask["status"],
     due:t.due,assignedTo:t.assignedTo,attendees:t.attendees,plannedStart:t.plannedStart,plannedEnd:t.plannedEnd,
     notes:t.notes,dataProvider:t.dataProvider})))}catch{}};
 useEffect(()=>{if(!userEmail)return;loadAuditTasks()},[userEmail]);
 // the company selector is driven by the companies actually in the database, not a fixed list
 useEffect(()=>{if(!userEmail)return;companiesApi.load().then(c=>setCompanies(c.filter(x=>x.active).map(x=>({id:x.id,name:x.name})))).catch(()=>{})},[userEmail]);
 useEffect(()=>{if(!userEmail)return;fetch("/api/payments/natures")
   .then(r=>r.json()).then((d:any)=>setNatures((d.natures||[])
     .filter((x:any)=>x.active).map((x:any)=>x.name))).catch(()=>{})},[userEmail,natureVersion]);
 useEffect(()=>{if(!userEmail)return;fetch("/api/workforce/departments").then(r=>r.json()).then((d:any)=>setDepartments((d.departments||[]).map((x:any)=>x.name))).catch(()=>{})},[userEmail]);
 useEffect(()=>{if(!userEmail)return;fetch("/api/payments").then(r=>r.json() as Promise<{payments?:Payment[]}>).then(x=>x.payments?.length&&setPayments([...x.payments,...seed])).catch(()=>{})},[userEmail]);
 const filtered=useMemo(()=>payments.filter(p=>(company==="All companies"||p.company===company)&&(`${p.requestNo} ${p.vendor} ${p.status}`.toLowerCase().includes(search.toLowerCase()))),[payments,company,search]);
 /* A requestor sees the requests they raised. raisedBy is written server-side from the
    session, so it cannot be spoofed by the browser. Requests created before this was
    recorded carry an empty value and belong to nobody. */
 const mine=useMemo(()=>filtered.filter(p=>(p.raisedBy||"")===userEmail),[filtered,userEmail]);
 /* Tasks, and the same work seen by day, week or month - one menu entry with the view
    chosen inside, rather than four entries onto the same register. */
 const taskTabs=<div className="wf-tabs wf-period-tabs">{(["Tasks","Daily","Weekly","Monthly"] as const)
   .map(t=><button key={t} className={period===t?"active":""} onClick={()=>setPeriod(t)}>{t}</button>)}</div>;
 const flash=(x:string)=>{setToast(x);setTimeout(()=>setToast(""),2500)};
 const act=async(p:Payment,status:string,note?:string)=>{
  const owner=status==="Audit Accepted"?userName||"Assigned Auditor"
    :status==="Approved by Auditor – Ready to Release"?"Accounts & Finance"
    :status==="Payment Released"?userName||"Accounts & Finance"
    :status==="Submitted"?"Accountant queue":p.owner;
  try{
   if(p.id>0){
    const r=await fetch("/api/payments",{method:"PATCH",headers:{"content-type":"application/json"},
      body:JSON.stringify({id:p.id,status,owner,note})});
    const b=await r.json().catch(()=>({})) as {error?:string;payment?:Payment};
    if(!r.ok)throw new Error(b.error||"That change was refused");
    const saved=b.payment||{...p,status,owner};
    setPayments(v=>v.map(x=>x.id===p.id?{...x,...saved}:x));
    setDrawer(d=>d&&d.id===p.id?{...d,...saved}:d);
   }else{
    setPayments(v=>v.map(x=>x.id===p.id?{...x,status,owner}:x));
    setDrawer(d=>d?{...d,status,owner}:d);
   }
   flash(status==="Rejected"?`${p.requestNo} sent back to the requestor`
     :status==="Submitted"?`${p.requestNo} resubmitted to Accounts`
     :`${p.requestNo} moved to ${status}`);
  }catch(e){flash(e instanceof Error?e.message:"That change was refused")}};
 /* Administrator only, and refused again by the server. Documents go with it. */
 const removeRequest=async(t:Payment)=>{
  if(!confirm(`Delete ${t.requestNo}?\n\nThe request and every document attached to it are removed for everybody. This cannot be undone.`))return;
  try{
   const r=await fetch(`/api/payments?id=${encodeURIComponent(String(t.id))}`,{method:"DELETE"});
   const body=await r.json().catch(()=>({})) as {error?:string};
   if(!r.ok)throw new Error(body.error||"That request could not be deleted");
   setPayments(v=>v.filter(x=>x.id!==t.id));setDrawer(null);flash(`${t.requestNo} deleted`);
  }catch(e){flash(e instanceof Error?e.message:"That request could not be deleted")}};
 /* Meetings and audit tasks are the same record with a different kind, so one handler
    serves every queue. */
 const createAuditTask=async(kind:AuditTask["kind"],t:{title:string;department:string;companyId:string;due:string;notes:string;attendees?:string})=>{
  try{await auditTasksApi.create({...t,kind,status:"Available"});await loadAuditTasks();
   flash(`${kind==="Meeting"?"Meeting":kind+" task"} created`)}
  catch(e){flash(e instanceof Error?e.message:"Could not create it")}};
 const acceptAuditTask=async(id:string)=>{
   try{await auditTasksApi.update({id,action:"accept"});await loadAuditTasks();
     flash(`${id} accepted and moved to My Tasks`)}
   catch(e){flash(e instanceof Error?e.message:"Could not accept that task")}};
 const updateAuditTask=async(id:string,status:AuditTask["status"])=>{
   try{await auditTasksApi.update({id,status,...(status==="Completed"?{action:"complete"}:{})});
     await loadAuditTasks();flash(`${id} moved to ${status}`)}
   catch(e){flash(e instanceof Error?e.message:"Could not update that task")}};
 /* The Accountant reads the organisation chart and the employee register but does not
    change them. The API enforces the same rule, so this only hides controls that would
    be refused anyway rather than being the rule itself. */
 const viewOnly=role==="Accountant"||role==="Requestor"||role==="Auditor";
 const visible=nav.filter(n=>(access[role]||[]).includes(n.id));
 const login=(u:Actor)=>{setUserName(u.name);setUserEmail(u.email);setAllowedRoles(u.roles);setRole(u.roles[0]);setActive(u.roles[0]==="Requestor"?"requests":"dashboard")};
 /* Ask the server who this is. The session cookie is HttpOnly, so the browser cannot
    read it; only this call can say whether it is still valid, which is what makes a
    revoked or expired session take effect on a refresh. */
 useEffect(()=>{fetch("/api/auth/session").then(r=>r.json() as Promise<{actor?:Actor|null}>)
   .then(x=>{if(x.actor)login(x.actor)}).catch(()=>{}).finally(()=>setBooting(false));
  // rendered after mount so the server and client markup cannot disagree on the date
  setTodayLabel(new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}).toUpperCase())},[]);
 const signOut=async()=>{setProfileOpen(false);await fetch("/api/auth/session",{method:"DELETE"}).catch(()=>{});setUserName("");setUserEmail("");setAllowedRoles([]);setPayments(seed);setRole("Audit Head");setActive("dashboard")};
 return <WorkforceProvider actor={userName}><div className="shell">{!userName&&!booting&&<LoginOverlay onLogin={login}/>} {mobile&&<button className="scrim" onClick={()=>setMobile(false)}/>}<aside className={mobile?"side open":"side"}><div className="brand"><b>C</b><div><strong>CMG Payment</strong><span>REQUEST</span></div><button onClick={()=>setMobile(false)}><X/></button></div><nav>{visible.map(n=><button key={n.id} className={active===n.id?"active":""} onClick={()=>{setActive(n.id);setMobile(false)}}><n.icon/>{n.label}</button>)}</nav><div className="control"><ShieldCheck/><div><b>Controls active</b><span>Last sync 2 min ago</span></div></div></aside><main><header><div className="heading"><button className="hamb" onClick={()=>setMobile(true)}><Menu/></button><div><small>{todayLabel||"\u00a0"}</small><h1>{nav.find(n=>n.id===active)?.label}</h1></div></div><div className="head-actions"><label><Building2/><select value={company} onChange={e=>setCompany(e.target.value)}>{["All companies",...companies.map(c=>c.name)].map(x=><option key={x}>{x}</option>)}</select><ChevronDown/></label><select value={role} onChange={e=>{const next=e.target.value;setRole(next);setActive(next==="Requestor"?"requests":"dashboard")}}>{allowedRoles.map(x=><option key={x}>{x}</option>)}</select><div className="profile-menu"><button className="avatar" title={userName||"Profile"} aria-haspopup="menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(v=>!v)}>{userName?userName.split(" ").map(x=>x[0]).join("").slice(0,2):"CM"}</button>{profileOpen&&<><button className="profile-scrim" aria-label="Close profile menu" onClick={()=>setProfileOpen(false)}/><div className="profile-dropdown" role="menu"><div className="profile-who"><b>{userName||"Signed in"}</b><small>{userEmail}</small>{!!role&&<i>{role}</i>}</div><button role="menuitem" onClick={()=>{setProfileOpen(false);setPasswordOpen(true)}}><Settings/>Change password</button>{userName&&<button role="menuitem" className="profile-signout" onClick={()=>{setProfileOpen(false);signOut()}}><LogOut/>Sign out</button>}</div></>}</div></div></header>
 
 {active==="dashboard"&&(role==="Requestor"?<RequestorDashboard rows={mine} open={setDrawer} create={()=>setForm(true)} go={setActive}/>:role==="Accountant"||role==="Auditor"?<RoleDashboard role={role} payments={filtered} auditTasks={auditTasks} open={setDrawer} go={setActive}/>:<Dashboard payments={filtered} go={setActive}/>)}
 {active==="dashboard"&&visible.some(n=>n.id==="organisation")&&<div className="page wf-dash-wrap"><WorkforceOverview openProfile={setProfile} go={()=>setActive("organisation")}/></div>}
 {active==="requests"&&<RequestorWorkspace rows={role==="Requestor"?mine:filtered} open={setDrawer} create={()=>setForm(true)}/>}
 {active==="payments"&&<PaymentWorkbench onDelete={removeRequest} rows={filtered} role={role} search={search} setSearch={setSearch} open={setDrawer} create={()=>setForm(true)}/>}
 {active==="scheduled"&&<ScheduledPayments role={role} flash={flash}/>}
 {active==="preaudit"&&<AuditTaskQueue departments={departments} title="Pre-audit tasks" kind="Pre-Audit" companies={companies} create={(t)=>createAuditTask("Pre-Audit",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask} openImport={()=>setActive("imports")}/>} 
 {active==="postaudit"&&<AuditTaskQueue departments={departments} title="Post-audit tasks" kind="Post-Audit" companies={companies} create={(t)=>createAuditTask("Post-Audit",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask} openImport={()=>setActive("imports")}/>} 
 {active==="specialaudit"&&<AuditTaskQueue departments={departments} title="Special audit tasks" kind="Special Audit" companies={companies} create={(t)=>createAuditTask("Special Audit",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask} openImport={()=>setActive("imports")}/>} 
 {active==="community"&&<CommunityChat user={userName} flash={flash}/>}
 {active==="meetings"&&<AuditTaskQueue departments={departments} title="Meeting tasks" kind="Meeting" companies={companies} create={(t)=>createAuditTask("Meeting",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask} openImport={()=>setActive("imports")}/>} 
 {active==="reports"&&<ReportsCentre payments={payments} tasks={auditTasks} flash={flash}/>}
 {active==="companies"&&<CompanySetup role={role} onNaturesChanged={()=>setNatureVersion(n=>n+1)}/>}
 {active==="users"&&<AccessSetup/>}
 {active==="organisation"&&<OrgChart readOnly={viewOnly} openProfile={setProfile} flash={flash}/>}
 {active==="employees"&&<EmployeeDirectory readOnly={viewOnly} openProfile={setProfile} flash={flash}
   openJd={(id:string)=>{setJdFor(id);setActive("workjd")}}/>}
 {active==="worktasks"&&(period==="Tasks"?<TaskBoard tabs={taskTabs} openProfile={setProfile} flash={flash}/>:<WorkPeriod tabs={taskTabs} frequency={period} openProfile={setProfile} flash={flash}/>)}
 
 
 
 {active==="training"&&<TrainingDesk flash={flash}/>}
 {active==="worktokens"&&<TokenDesk openProfile={setProfile} flash={flash}/>}
 {active==="workjd"&&<JobDescription employeeId={jdFor} openProfile={setProfile} flash={flash}/>}
 {active==="workreports"&&<WorkforceReports openProfile={setProfile} flash={flash}/>}
 {active==="imports"&&<ImportCentre flash={flash} onImport={async(kind,assigned,dataProvider)=>{
   try{await auditTasksApi.create({title:`Imported ${kind} task`,kind,department:"Finance",
     status:assigned?"Accepted":"Available",assignedTo:assigned||"",dataProvider:dataProvider||"",
     notes:"Created from the import centre"});await loadAuditTasks();flash("Audit task created")}
   catch(e){flash(e instanceof Error?e.message:"Could not create the task")}}}/>}
 </main>{profile&&<EmployeeProfile id={profile} close={()=>setProfile(null)} flash={flash} openProfile={setProfile}
   openJd={(id:string)=>{setProfile(null);setJdFor(id);setActive("workjd")}}/>}{drawer&&<PaymentDetail payment={drawer} role={role} onDelete={()=>removeRequest(drawer)} onClose={()=>setDrawer(null)} onAction={(s:string,note?:string)=>act(drawer,s,note)}/>} {form&&<PaymentForm companies={companies} departments={departments} natures={natures} close={()=>setForm(false)} added={(p:Payment)=>{setPayments(v=>[p,...v]);setForm(false);flash(`${p.requestNo} submitted successfully`)}}/>}{passwordOpen&&<PasswordReset name={userName} email={userEmail} close={()=>setPasswordOpen(false)} done={()=>{setPasswordOpen(false);flash("Password updated. Please sign in again.");signOut()}}/>}{toast&&<div className="toast"><CheckCircle2/>{toast}</div>}</div></WorkforceProvider>
}
function PasswordReset({name,email,close,done}:{name:string;email:string;close:()=>void;done:()=>void}){const[current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false);const valid=current.length>=1&&next.length>=10&&/[A-Za-z]/.test(next)&&/[0-9]/.test(next)&&next===confirm;const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid)return;setSaving(true);setError("");try{const r=await fetch("/api/auth/change-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({current,next})});const data=(await r.json()) as {error?:string};if(!r.ok)throw new Error(data.error||"Unable to update password.");done()}catch(err){setError(err instanceof Error?err.message:"Unable to update password.")}finally{setSaving(false)}};return <><button className="overlay" onClick={close}/><form className="modal password-reset" onSubmit={submit}><header><div><small>ACCOUNT SECURITY</small><h2>Change my password</h2></div><button type="button" onClick={close}><X/></button></header><div className="form"><p className="wide">Signed in as <b>{name}</b></p><label className="wide">Current password<input required autoComplete="current-password" type="password" value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input required minLength={10} autoComplete="new-password" type="password" value={next} onChange={e=>setNext(e.target.value)}/></label><label>Confirm new password<input required minLength={10} autoComplete="new-password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{confirm&&next!==confirm&&<p className="wide login-error">Passwords do not match.</p>}{error&&<p className="wide login-error">{error}</p>}</div><footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={!valid||saving}>{saving?"Updating…":"Update administrator password"}</button></footer></form></>}
function RequestorDashboard({rows,open,create,go}:{rows:Payment[];open:(p:Payment)=>void;create:()=>void;go:(m:Module)=>void}){
 const total=rows.length,released=rows.filter(r=>r.status==="Payment Released").length;
 const rejected=rows.filter(r=>r.status==="Rejected"||r.status==="Audit Rejected").length;
 const open_=total-released-rejected;
 return <div className="page">
  <Intro eyebrow="MY REQUESTS" title="Your payment requests"
    sub="Everything you have raised, and where each one has reached."
    action={<button className="primary" onClick={create}><Plus/>New payment request</button>}/>
  <div className="metrics">
   {([["Raised",String(total),"in total","blue"],["In progress",String(open_),"awaiting a decision","amber"],
     ["Released",String(released),"paid out","green"],["Returned",String(rejected),"need your attention","red"]] as string[][])
     .map(x=><article className={x[3]} key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><small>{x[2]}</small></article>)}
  </div>
  <section className="panel table-panel">
   <div className="panel-head"><div><small>MY REQUESTS</small><h2>Latest first</h2></div>
     <button onClick={()=>go("requests")}>View all</button></div>
   {!rows.length&&<p className="queue-empty">You have not raised a payment request yet.</p>}
   {!!rows.length&&<div className="table-wrap"><table><thead><tr><th>REQUEST</th><th>VENDOR</th>
     <th>AMOUNT</th><th>DUE</th><th>STATUS</th></tr></thead><tbody>
     {rows.slice(0,8).map(r=><tr key={r.id} onClick={()=>open(r)}><td><b>{r.requestNo}</b></td>
       <td>{r.vendor}</td><td><b>{r.currency} {r.amount.toLocaleString()}</b></td><td>{r.due}</td>
       <td><span className={`badge ${tone[r.status]||"blue"}`}>{r.status}</span></td></tr>)}
     </tbody></table></div>}
  </section></div>;
}
function Intro({eyebrow,title,sub,action}:{eyebrow:string;title:string;sub:string;action?:React.ReactNode}){return <div className="intro"><div><small>{eyebrow}</small><h2>{title}</h2><p>{sub}</p></div>{action}</div>}
function Dashboard({payments,go}:{payments:Payment[];go:(m:Module)=>void}){
 /* Every figure here is counted from the payment requests actually in the database.
    This panel used to show a fixed 82/100 with invented metrics, which on a live
    system reads as real reporting rather than placeholder art. */
 const open=payments.filter(p=>p.status!=="Payment Released"&&p.status!=="Audit Rejected");
 const released=payments.filter(p=>p.status==="Payment Released");
 const needsApproval=payments.filter(p=>/Approval|Review|Queue/.test(p.status));
 const available=payments.filter(p=>p.status==="Pre-Audit Queue");
 const rejected=payments.filter(p=>/Rejected|Query|Observation/.test(p.status));
 const value=(rows:Payment[])=>rows.reduce((n,p)=>n+(Number(p.amount)||0),0);
 const money=(n:number)=>n>=1000000?`${(n/1000000).toFixed(2)}M`:n>=1000?`${Math.round(n/1000)}K`:String(n);
 const settled=released.length+rejected.length;
 const health=payments.length?Math.round(released.length/payments.length*100):0;
 const byCompany=Array.from(new Set(payments.map(p=>p.company))).map(c=>{
   const rows=payments.filter(p=>p.company===c);
   const done=rows.filter(p=>p.status==="Payment Released").length;
   return{name:c,pct:rows.length?Math.round(done/rows.length*100):0,
     stuck:rows.filter(p=>/Rejected|Query|Observation/.test(p.status)).length}});
 return <div className="page">
  <section className="health"><div><small>PAYMENT COMPLETION</small><b>{health}</b><span>/100</span>
    <p>{payments.length?`● ${released.length} of ${payments.length} released${rejected.length?`, ${rejected.length} needing attention`:""}`:"● No payment requests raised yet"}</p></div>
   {[["Released",payments.length?Math.round(released.length/payments.length*100):0],
     ["Settled",payments.length?Math.round(settled/payments.length*100):0],
     ["In progress",payments.length?Math.round(open.length/payments.length*100):0]]
     .map(x=><label key={x[0] as string}><span>{x[0]} <b>{x[1]}%</b></span><progress value={x[1] as number} max="100"/></label>)}</section>
  <div className="metrics">{[
    ["Needs approval",String(needsApproval.length),needsApproval.length?`AED ${money(value(needsApproval))}`:"Nothing waiting","amber"],
    ["Needs attention",String(rejected.length),rejected.length?"Query or observation raised":"None","red"],
    ["Available to accept",String(available.length),available.length?"In the pre-audit queue":"Queue is clear","blue"],
    ["Open requests",String(open.length),open.length?`AED ${money(value(open))}`:"All settled","violet"],
    ["Released",String(released.length),released.length?`AED ${money(value(released))}`:"None yet","green"]]
    .map(x=><article className={x[3]} key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><small>{x[2]}</small></article>)}</div>
  <div className="grid">
   <section className="panel"><div className="panel-head"><div><small>LIVE CONTROL QUEUE</small><h2>What needs attention now</h2></div>
     {!!payments.length&&<button onClick={()=>go("payments")}>View all</button>}</div>
    {open.slice(0,6).map(p=><button className="queue-row" key={p.id} onClick={()=>go("payments")}>
      <i className={tone[p.status]}/><span><b>{p.vendor}</b><small>{p.requestNo} · {p.company}</small></span>
      <b>{p.currency} {Number(p.amount).toLocaleString()}</b><em>{p.status}</em></button>)}
    {!open.length&&<p className="queue-empty">Nothing in the queue. Raise a payment request to begin.</p>}</section>
   <section className="panel risk"><div className="panel-head"><div><small>POSITION</small><h2>Open requests</h2></div></div>
    <div className="ring"><span><b>{open.length}</b>open</span></div>
    <div className="legend"><span>🔴 Attention <b>{rejected.length}</b></span><span>🟠 Approval <b>{needsApproval.length}</b></span>
     <span>🟡 Available <b>{available.length}</b></span><span>🟢 Released <b>{released.length}</b></span></div></section>
   <section className="panel"><div className="panel-head"><div><small>COMPANY VIEW</small><h2>Position by entity</h2></div></div>
    {byCompany.map(r=><div className="company" key={r.name}><b>{r.name}</b>
      <span><progress value={r.pct} max="100"/>{r.pct}%</span>
      <em>{r.stuck?"Needs attention":r.pct===100?"Clear":"In progress"}</em><small>{r.stuck} flagged</small></div>)}
    {!byCompany.length&&<p className="queue-empty">No requests raised yet.</p>}</section>
   <section className="panel upcoming"><div className="panel-head"><div><small>UPCOMING</small><h2>By due date</h2></div></div>
    {open.slice(0,5).map(p=><div key={p.id}><time>{String(p.due||"").slice(-2)||"—"}<small>DUE</small></time>
      <span><b>{p.vendor}</b><small>{p.company} · {p.currency} {Number(p.amount).toLocaleString()}</small></span></div>)}
    {!open.length&&<p className="queue-empty">Nothing scheduled.</p>}</section></div></div>}

function Payments({rows,search,setSearch,open,create}:any){return <div className="page"><div className="toolbar"><label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payment, vendor or status"/></label><button>Status: All <ChevronDown/></button><button className="primary" onClick={create}><Plus/>New payment request</button></div><section className="panel table-panel"><div className="panel-head"><div><small>PAYMENT CONTROL</small><h2>All requests</h2></div><span>{rows.length} records</span></div><div className="table-wrap"><table><thead><tr><th>REQUEST</th><th>COMPANY / DEPARTMENT</th><th>VENDOR</th><th>AMOUNT</th><th>DUE</th><th>STATUS</th><th>OWNER</th></tr></thead><tbody>{rows.map((p:Payment)=><tr key={p.id} onClick={()=>open(p)}><td><b>{p.requestNo}</b></td><td>{p.company}<small>{p.department}</small></td><td>{p.vendor}</td><td><b>{p.currency} {p.amount.toLocaleString()}</b></td><td>{p.due}<small>{p.urgency}</small></td><td><span className={`badge ${tone[p.status]||"blue"}`}>{p.status}</span></td><td>{p.owner}</td></tr>)}</tbody></table></div></section></div>}
function Queue({tasks,accept,role,go}:{tasks:AuditTask[];accept:(id:string)=>void;role:string;go:(m:Module)=>void}){const[dept,setDept]=useState("All departments");const rows=tasks.filter(t=>t.kind==="Pre-Audit"&&(dept==="All departments"||t.department===dept)),available=rows.filter(t=>t.status==="Available"),mine=rows.filter(t=>t.status!=="Available");return <div className="page"><Intro eyebrow="AUDITOR WORKSPACE" title="Pre-audit tasks by department" sub="Accept available work; accepted items leave the queue and appear in My Tasks." action={<div className="audit-actions">{role==="Audit Head"&&<button className="primary" onClick={()=>go("imports")}><Import/>Import Excel</button>}<select value={dept} onChange={e=>setDept(e.target.value)}><option>All departments</option>{Array.from(new Set(tasks.filter(t=>t.kind==="Pre-Audit").map(t=>t.department))).map(x=><option key={x}>{x}</option>)}</select></div>}/><AuditTaskCards title="Available pre-audit queue" rows={available} accept={accept}/><AuditTaskCards title="My accepted pre-audit tasks" rows={mine}/></div>}
function AuditTaskCards({title,rows,accept}:{title:string;rows:AuditTask[];accept?:(id:string)=>void}){return <section className="panel audit-task-section"><div className="panel-head"><h2>{title}</h2><span>{rows.length}</span></div><div className="cards">{rows.map((t,i)=><article className="task" key={t.id}><div><span className={i===1?"badge red":"badge amber"}>{t.department}</span><small>{t.company}</small></div><h3>{t.title}</h3><p>{t.id} · {t.kind} · Evidence required</p><footer><span><FileText/> {i+2} documents</span>{accept?<button onClick={()=>accept(t.id)}>Accept to start</button>:<button>Open my task</button>}</footer></article>)}</div>{!rows.length&&<p className="queue-empty">No tasks in this queue.</p>}</section>}
function Calendar({tasks,accept}:{tasks:AuditTask[];accept:(id:string)=>void}){const rows=tasks.filter(t=>t.kind==="Post-Audit"),available=rows.filter(t=>t.status==="Available"),mine=rows.filter(t=>t.status!=="Available");return <div className="page"><Intro eyebrow="ANNUAL AUDIT PROGRAM" title="Post-audit task list" sub="Department-wise planned work with separate available and accepted queues." action={<button className="primary"><Plus/>New program</button>}/><AuditTaskCards title="Available post-audit queue" rows={available} accept={accept}/><AuditTaskCards title="My accepted post-audit tasks" rows={mine}/></div>}

function Meetings(){return <div className="page"><Intro eyebrow="MEETINGS & ACTIONS" title="This week" sub="6 meetings · 9 open actions" action={<button className="primary"><Plus/>Schedule meeting</button>}/><div className="cards">{["Monthly audit closing","Procurement controls review","Payroll observation follow-up","Audit team planning"].map((x,i)=><article className="task" key={x}><span className="badge blue">{i%2?"FOLLOW-UP":"MANAGEMENT"}</span><h3>{x}</h3><p>{28+i} Aug · {10+i}:00 · {i%2?"TRI UAE":"Group"}</p><footer><span><ClipboardCheck/> {i+1} actions</span><button>Open minutes</button></footer></article>)}</div></div>}
function Reports({flash}:any){return <div className="page"><Intro eyebrow="REPORTS CENTRE" title="Scheduled intelligence" sub="PDF, Excel and email delivery with full audit history" action={<button className="primary" onClick={()=>flash("Reports generated and delivery logged")}><FileBarChart/>Run now</button>}/><div className="cards">{[["Daily pre-audit report","Every day · 7:30 AM","Delivered"],["Weekly post-audit report","Mondays · 8:00 AM","Delivered"],["Monthly audit report","1st of month · 9:00 AM","Scheduled"],["Meeting action report","Fridays · 4:00 PM","Scheduled"]].map(r=><article className="report" key={r[0]}><FileBarChart/><span><h3>{r[0]}</h3><p>{r[1]}</p><i className="badge green">{r[2]}</i></span><button>Download</button></article>)}</div></div>}
function Setup({title,rows}:{title:string;rows:string[]}){return <div className="page"><Intro eyebrow="ADMINISTRATION" title={title} sub="Role and company restrictions apply to every record" action={<button className="primary"><Plus/>Add new</button>}/><section className="panel setup">{rows.map(r=><div key={r}><Building2/><b>{r}</b><span className="badge green">Active</span><button><Settings/>Configure</button></div>)}</section></div>}
function Imports({flash}:any){return <div className="page"><Intro eyebrow="BULK DATA" title="One-file import centre" sub="Import complete department masters with validation, preview and rejected-row reporting"/><div className="cards">{[["Audit Department Master","One workbook: pre-audit, post-audit, meetings, auditors, sources and escalations."],["Accounts Department Master","One workbook: companies, requestors, accountants, vendors, banks and payment requests."],["Users & Company Roles","Bulk-map multiple roles and companies for every user."],["Companies & Controls","Company, currency, reminders and management contacts."]].map(([x,d])=><article className="import" key={x}><Import/><h3>{x}</h3><p>{d}</p><button>Download template</button><label><input type="file" accept=".xlsx,.xls,.csv" onChange={()=>flash("Workbook validated: 6 sheets, 128 valid rows, 3 need correction")}/>Upload one Excel</label></article>)}</div></div>}
function AuditLog(){
 /* Real entries are written to wf_logs by every write endpoint. This screen previously
    printed four fabricated rows under the heading "immutable history", which is the
    worst possible place to show invented data. */
 return <div className="page"><Intro eyebrow="IMMUTABLE HISTORY" title="Audit log"
   sub="Every important task, document and decision, time-stamped as it happens."/>
  <section className="panel"><p className="queue-empty">No activity recorded yet.</p></section></div>}

function Detail({p,close,act}:any){const buttons=()=>{if(p.status==="Requested"||p.status==="Accountant Review")return <><button onClick={()=>act("Audit Rejected")}>Reject</button><button className="primary" onClick={()=>act("Pre-Audit Queue")}>Accept & send to audit</button></>;if(p.status==="Pre-Audit Queue")return <button className="primary" onClick={()=>act("Audit Accepted")}>Accept audit</button>;if(p.status==="Audit Accepted"||p.status==="Audit Query")return <><button onClick={()=>act("Audit Rejected")}>Reject</button><button className="primary" onClick={()=>act("Management Approval")}>Approve audit</button></>;if(p.status==="Management Approval")return <><button onClick={()=>act("Management Approval: No")}>Approval not obtained</button><button className="primary" onClick={()=>act("Management Approval: Yes")}>Approval obtained — Yes</button></>;if(p.status==="Management Approval: Yes"||p.status==="Finance Queue")return <button className="primary" onClick={()=>act("Payment Released")}>Finance: release payment</button>;if(p.status==="Management Approval: No")return <button disabled>Finance release locked</button>;return <button className="primary" onClick={()=>act("Reconciliation")}>Send to reconciliation</button>};return <><button className="overlay" onClick={close}/><aside className="detail"><header><div><small>PAYMENT REQUEST</small><h2>{p.requestNo}</h2></div><button onClick={close}><X/></button></header><div className="detail-body"><span className={`badge ${tone[p.status]||"blue"}`}>{p.status}</span><h3>{p.vendor}</h3><b className="amount">{p.currency} {p.amount.toLocaleString()}</b><div className="facts">{[["Company",p.company],["Department",p.department],["Due date",p.due],["Urgency",p.urgency],["Owner",p.owner],["Budget","Available"]].map(x=><label key={x[0]}>{x[0]}<b>{x[1]}</b></label>)}</div><section><h4>Controlled payment flow</h4><div className="flowline"><b>Requested</b><b>Accounts</b><b>Audit</b><b>Management</b><b>Finance</b></div><p>Finance release is locked until Management Approval is explicitly marked Yes.</p></section><section><h4>Verification checklist</h4>{["Invoice and PO match","Budget code confirmed","Bank details verified","Supporting evidence complete"].map((x,i)=><label className="check" key={x}><input type="checkbox" defaultChecked={i<3}/>{x}</label>)}</section><section><h4>Audit trail</h4><p>All acceptance, approval, rejection and release actions are time-stamped.</p><p>Old documents remain retained when newer versions are uploaded.</p></section></div><footer>{buttons()}</footer></aside></>}
function PaymentForm({close,added,companies,departments,natures}:{close:()=>void;added:(p:Payment)=>void;companies:{id:string;name:string}[];departments:string[];natures:string[]}){const[v,setV]=useState({company:companies[0]?.name||"",vendor:"",amount:"",currency:"AED",department:departments[0]||"",due:"2026-08-30",description:"",poNumber:"",nature:natures[0]||"",tds:"No"});const[files,setFiles]=useState<File[]>([]);const[saving,setSaving]=useState(false);useEffect(()=>{if(natures.length&&!natures.includes(v.nature))
  setV(c=>({...c,nature:natures[0]}))},[natures,v.nature]);useEffect(()=>{if(departments.length&&!departments.includes(v.department))setV(c=>({...c,department:departments[0]}))},[departments,v.department]);const submit=async(e:any)=>{e.preventDefault();if(saving)return;setSaving(true);let p:any={...v,amount:Number(v.amount),requestNo:`PAY-2026-${1050+Math.floor(Math.random()*100)}`,status:"Submitted",owner:"Accountant queue",urgency:"Normal",id:Date.now()};try{let r=await fetch("/api/payments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(p)});if(r.ok)p=((await r.json()) as {payment:Payment}).payment}catch{}/* The documents were collected and then dropped: the input had no handler, so nothing
   ever reached the server and Accounts and Audit opened the request to find it empty.
   They upload here, once the request exists and has the id they hang off, so everyone
   who opens it afterwards sees the same list. */
for(const file of files){try{const dataUrl=await asDataUrl(file);await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entityType:"payment",entityId:String(p.id),kind:"Other",fileName:file.name,dataUrl})});}catch{}}setSaving(false);added(p)};return <><button className="overlay" onClick={close}/><form className="modal" onSubmit={submit}><header><div><small>NEW REQUEST</small><h2>Create payment request</h2></div><button type="button" onClick={close}><X/></button></header><div className="form">{[["Company","company"],["Department","department"],["Nature of payment","nature"],["TDS applicable","tds"],["Vendor / beneficiary","vendor"],["PO number","poNumber"],["Amount","amount"],["Due date","due"]].map(([label,key])=><label className={key==="vendor"?"wide":""} key={key}>{label}{key==="company"?<select value={v.company} onChange={e=>setV({...v,company:e.target.value})}>{companies.map(c=><option key={c.id}>{c.name}</option>)}</select>:key==="department"?<select value={v.department} onChange={e=>setV({...v,department:e.target.value})}>{departments.map(x=><option key={x}>{x}</option>)}</select>:key==="nature"?<select value={v.nature} onChange={ev=>setV({...v,nature:ev.target.value})}>{natures.map(x=><option key={x}>{x}</option>)}</select>:key==="tds"?<select value={v.tds} onChange={ev=>setV({...v,tds:ev.target.value})}><option>No</option><option>Yes</option></select>:<input required type={key==="amount"?"number":key==="due"?"date":"text"} value={(v as any)[key]} onChange={e=>setV({...v,[key]:e.target.value})}/>}</label>)}<label>Currency<select value={v.currency} onChange={e=>setV({...v,currency:e.target.value})}><option>AED</option><option>SAR</option><option>INR</option><option>USD</option></select></label><label className="wide">Description<textarea value={v.description} onChange={e=>setV({...v,description:e.target.value})}/></label><label className="upload wide"><input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" onChange={e=>setFiles(Array.from(e.target.files||[]))}/><Upload/><b>Attach supporting documents</b><small>Images, PDF, Word, Excel, CSV or ZIP — up to 15 MB each</small>{files.length>0&&<small className="upload-list">{files.length} file{files.length===1?"":"s"}: {files.map(f=>f.name).join(", ")}</small>}</label></div><footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving?"Submitting…":"Submit to accountant"}</button></footer></form></>}
