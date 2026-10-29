"use client";
import MultiSelect from"./MultiSelect";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ArrowLeft,Check,Store,Bell,AlertTriangle,Building2,CalendarClock,CalendarDays,CheckCircle2,ChevronDown,CircleDollarSign,ClipboardCheck,FileBarChart,FileText,History,Import,LayoutDashboard,LogOut,Menu,MessageSquareText,Plus,ReceiptText,Search,Settings,ShieldCheck,SlidersHorizontal,Users,X,GraduationCap,Upload} from "lucide-react";
import PaymentDetail from "./PaymentDetail";
import{matchesPayment}from"../lib/payment-search";
import FilePicker from "./FilePicker";
import {asDataUrl} from "./Attachments";
import PaymentWorkbench from "./PaymentWorkbench";
import RequestorWorkspace from "./RequestorWorkspace";
import AccessSetup from "./AccessSetup";
import RoleDashboard from "./RoleDashboard";
import LoginOverlay,{type Actor} from "./LoginOverlay";
import ImportCentre from "./ImportCentre";
import AuditTaskQueue from "./AuditTaskQueue";
import CompanySetup from "./CompanySetup";
import AccountsReceived from "./AccountsReceived";
import VendorMaster from "./VendorMaster";
import ScheduledPayments from "./ScheduledPayments";
import ObservationDesk from "./ObservationDesk";
import SettingsDesk from "./SettingsDesk";
import{ExtraFields,packExtra,refreshFields,useExtraFields}from"./ExtraFields";
import{FIELD_ORDER,labelFor,ruleFor}from"../lib/payment-fields";
import{distinct,jobFor,parseJobs}from"../lib/jobs";
import{defaultCurrencyFor,needsManagementApproval}from"../lib/payment-stages";
import type{Job}from"../lib/jobs";
import{refreshOptions}from"./options-store";
import ReportsCentre from "./ReportsCentre";
import {WorkforceProvider} from "./workforce-store";
import OrgChart from "./OrgChart";
import EmployeeDirectory from "./EmployeeDirectory";
import {EmployeeProfile} from "./EmployeeProfile";
import {WorkforceOverview,WorkforceReports} from "./WorkforceReports";
import {auditTasksApi,companiesApi} from "./audit-api";
import {MaterialProvider,MaterialScreen} from "../modules/material/MaterialApp";
import {MaterialLanding,MaterialSideNav,MaterialTitle} from "../modules/material/ShellParts";
import {hasPaymentAccess,isPaymentRole,materialCodeFor} from "../lib/roles";
import ResponsiveTables from "./ResponsiveTables";
import{pillClass,toneOf}from"../lib/status-tone";
import{stageIndex}from"../lib/payment-stages";
type Payment={deptPriority?:string;deptPriorityBy?:string;deptPriorityAt?:string;createdAt?:string;tds?:string;nature?:string;poNumber?:string;resubmitNote?:string;resubmittedAt?:string;rejectionNote?:string;rejectedBy?:string;rejectedAt?:string;raisedBy?:string;id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;due:string;urgency:string;status:string;owner:string;department:string};
export type AuditTask={ref?:string;remarks?:string;category?:string;entity?:string;dueRule?:string;frequency?:string;recurDay?:string;recurUntil?:string;seriesId?:string;attendees?:string;id:string;title:string;company:string;department:string;kind:"Pre-Audit"|"Post-Audit"|"Meeting"|"Special Audit"|"Task"|"Token"|"Training";status:"Available"|"Accepted"|"In Progress"|"Observation Submitted"|"Response Received"|"Completed";due?:string;assignedTo?:string;plannedStart?:string;plannedEnd?:string;notes?:string;dataProvider?:string};
type Module="material"|"dashboard"|"requests"|"payments"|"scheduled"|"accountsreceived"|"preaudit"|"postaudit"|"specialaudit"|"observations"|"meetings"|"reports"|"companies"|"settings"|"users"|"imports"|"organisation"|"employees"|"vendors";
const seed:Payment[]=[];
const auditSeed:AuditTask[]=[];
const specialAuditSeed:AuditTask[]=[];
/* Only screens whose data is stored in D1 appear here. Scheduled payments, companies,
   the audit queues, meetings and the scorecard still read browser
   state — their tables and APIs are ready but the screens are not yet wired, so they
   are held back rather than shown as if they saved. */
/* This order is the menu order: `visible` filters this list, so every role sees the
   screens in the same sequence and only the ones it may reach. The work people do
   daily comes first; setup and reference screens sit below. */
const nav:{id:Module;label:string;icon:any}[]=([
  ["dashboard","Dashboard",LayoutDashboard],
  ["requests","My payment requests",FileText],
  ["payments","Accounts / Audit queues",CircleDollarSign],
  ["scheduled","Scheduled payment",CalendarClock],
  ["accountsreceived","Accounts Receivable",ReceiptText],
  ["vendors","Vendor master",Store],
  ["preaudit","Pre-audit tasks",ClipboardCheck],
  ["postaudit","Post-audit tasks",ShieldCheck],
  ["specialaudit","Special audits",AlertTriangle],
  ["meetings","Meetings/Tasks",CalendarDays],
  // below here: reference and setup, reached far less often
  ["observations","Observations register",MessageSquareText],
  ["reports","Report centre",FileBarChart],
  ["companies","Companies",Building2],
  ["users","Users & access",Users],
  ["imports","Import centre",Import],
  ["organisation","Organisation",Building2],
  ["employees","Employees",Users],
  ["settings","Settings",SlidersHorizontal]] as [Module,string,any][])
  .map(([id,label,icon])=>({id,label,icon}));

/* The workforce screens as a set. Management's access is defined as "the workforce
   modules" rather than a list, so the group is still named even though the menu no
   longer keeps them together. */
const workforceIds:Module[]=["organisation","employees","reports"];
/* The menu's groups. The order inside each is still the order of `nav`, and a role still
   sees only what `access` gives it - a heading whose group is empty is not drawn. */
const NAV_GROUP:Record<Module,"Payments"|"Audit"|"Administration">={dashboard:"Payments",requests:"Payments",payments:"Payments",
  scheduled:"Payments",accountsreceived:"Payments",vendors:"Payments",preaudit:"Audit",postaudit:"Audit",specialaudit:"Audit",
  meetings:"Audit",observations:"Audit",reports:"Administration",companies:"Administration",users:"Administration",
  imports:"Administration",organisation:"Administration",employees:"Administration",settings:"Administration",material:"Payments"};
const tone:Record<string,string>={"Rejected":"red","Query Raised":"amber","Requested":"blue","Accountant Review":"amber","Pre-Audit Queue":"blue","Management Approval":"amber","Management Approval: Yes":"green","Management Approval: No":"red","Audit Rejected":"red","Audit Query":"amber","Finance Queue":"violet","Approved by Auditor – Ready to Release":"green","Payment Released":"green","Expenses Booked":"green","Reconciliation":"green","Audit Accepted":"blue","Audit Cleared":"green"};
const access:Record<string,Module[]>={"Cost Control":["dashboard","accountsreceived","reports","organisation","employees"],Administrator:nav.map(x=>x.id),Requestor:["dashboard","requests","organisation","employees","meetings","reports"],"Department Head":["dashboard","requests","organisation","employees","meetings","reports"],Accountant:["dashboard","requests","payments","scheduled","organisation","employees","meetings","reports","observations","accountsreceived","vendors"],Auditor:["dashboard","requests","payments","scheduled","organisation","employees","preaudit","postaudit","specialaudit","meetings","reports","observations","accountsreceived","vendors"],Finance:["meetings","dashboard","payments","organisation","employees","reports","vendors"],Management:["meetings","dashboard","payments","accountsreceived","vendors",...workforceIds],
  /* Material roles that work the Vendor Master: procurement registers and verifies, and
     management (material) may give the final approval. */
  Procurement:["vendors"],"Procurement Manager":["vendors"],"Management (Material)":["vendors"],"Audit Head":nav.filter(x=>x.id!=="settings").map(x=>x.id)};
type Note={id:string;title:string;body:string;module:string;recordId:string;createdAt:string;readAt:string};
export default function Home(){
 const[active,setActive]=useState<Module>("dashboard"),[payments,setPayments]=useState(seed),[auditTasks,setAuditTasks]=useState([...auditSeed,...specialAuditSeed]),[companyPicks,setCompanyPicks]=useState<string[]>([]),[companies,setCompanies]=useState<{id:string;name:string}[]>([]),[departments,setDepartments]=useState<string[]>([]),[natures,setNatures]=useState<string[]>([]),[currencies,setCurrencies]=useState<string[]>([]),[tdsChoices,setTdsChoices]=useState<string[]>([]),[termsChoices,setTermsChoices]=useState<string[]>([]),[modeChoices,setModeChoices]=useState<string[]>([]),[jobs,setJobs]=useState<Job[]>([]),[masterVersion,setMasterVersion]=useState(0),[role,setRole]=useState("Audit Head"),[allowedRoles,setAllowedRoles]=useState<string[]>([]),[userName,setUserName]=useState(""),[userEmail,setUserEmail]=useState(""),[search,setSearch]=useState(""),[drawer,setDrawer]=useState<Payment|null>(null),[form,setForm]=useState(false),[passwordOpen,setPasswordOpen]=useState(false),[profileOpen,setProfileOpen]=useState(false),[mobile,setMobile]=useState(false),[profile,setProfile]=useState<string|null>(null),[toast,setToast]=useState(""),[todayLabel,setTodayLabel]=useState(""),[booting,setBooting]=useState(true),[expired,setExpired]=useState(false),[notes,setNotes]=useState<Note[]>([]),[unread,setUnread]=useState(0),[noteOpen,setNoteOpen]=useState(false);
 /* One login may hold payment roles, material roles or both. The role chosen in the
    header decides which menu shows; Administrator has both. */
 const payUser=hasPaymentAccess(allowedRoles);
 const matCode=materialCodeFor(role);
 const materialOnly=!!matCode&&!isPaymentRole(role);
 /* Audit tasks store a companyId; the screens show a company name, so the names are
    resolved once here rather than looked up per row. */
 const loadAuditTasks=async()=>{try{
   const[d,co]=await Promise.all([auditTasksApi.load({limit:200}),companiesApi.load().catch(()=>[])]);
   const name=new Map(co.map(c=>[c.id,c.name]));
   setAuditTasks(d.tasks.map(t=>({id:t.id,ref:t.ref,title:t.title,company:name.get(t.companyId)||t.companyId||"—",
     department:t.department,kind:t.kind as AuditTask["kind"],status:t.status as AuditTask["status"],
     due:t.due,assignedTo:t.assignedTo,attendees:t.attendees,frequency:t.frequency,plannedStart:t.plannedStart,plannedEnd:t.plannedEnd,
     notes:t.notes,dataProvider:t.dataProvider,category:t.category,entity:t.entity,dueRule:t.dueRule,remarks:t.remarks})))}catch{}};
 useEffect(()=>{if(!userEmail||!payUser)return;loadAuditTasks()},[userEmail,payUser]);
 // the company selector is driven by the companies actually in the database, not a fixed list
 useEffect(()=>{if(!userEmail||!payUser)return;companiesApi.load().then(c=>setCompanies(c.filter(x=>x.active).map(x=>({id:x.id,name:x.name})))).catch(()=>{})},[userEmail]);
 /* The dropdown choices and the extra fields an administrator maintains under
    Settings. Re-read whenever they change something, so a new option is on the form
    without a reload. */
 useEffect(()=>{if(!userEmail||!payUser)return;
   fetch("/api/settings/options").then(r=>r.json()).then((d:any)=>{
     const on=(list:string)=>(d.options||[]).filter((o:any)=>o.listId===list&&o.active)
       .map((o:any)=>o.name);
     setNatures(on("payment.nature"));setCurrencies(on("payment.currency"));
     setTdsChoices(on("payment.tds"));setTermsChoices(on("payment.terms"));
    setModeChoices(on("payment.mode"));setJobs(parseJobs(on("payment.job")))}).catch(()=>{})},[userEmail,masterVersion]);
 useEffect(()=>{if(!userEmail||!payUser)return;fetch("/api/workforce/departments").then(r=>r.json()).then((d:any)=>setDepartments((d.departments||[]).map((x:any)=>x.name))).catch(()=>{})},[userEmail]);
 /* The register was read once, at sign-in, and never again. Somebody who stayed signed in
    was told by the bell that their request had come back with a query, opened it, and
    found it as it had been hours earlier - no query, so no way to resubmit it until they
    reloaded the page. It is now re-read when the window regains focus, every minute, when
    a request is opened and after every decision, and an open request follows along. */
 const loadPayments=useCallback(()=>fetch("/api/payments").then(r=>r.json() as Promise<{payments?:Payment[]}>)
   .then(x=>{if(!x.payments?.length)return;const fresh=x.payments;
     setPayments([...fresh,...seed]);
     setDrawer(d=>d?(fresh.find(f=>f.id===d.id)||d):d)}).catch(()=>{}),[]);
 useEffect(()=>{if(!userEmail||!payUser)return;loadPayments();
   const t=setInterval(loadPayments,60000);window.addEventListener("focus",loadPayments);
   return()=>{clearInterval(t);window.removeEventListener("focus",loadPayments)}},[userEmail,loadPayments]);
 const openRequest=(p:Payment)=>{setDrawer(p);loadPayments()};
 const filtered=useMemo(()=>payments.filter(p=>(!companyPicks.length||companyPicks.includes(p.company))&&matchesPayment(p,search)),[payments,companyPicks,search]);
 /* A requestor sees the requests they raised. raisedBy is written server-side from the
    session, so it cannot be spoofed by the browser. Requests created before this was
    recorded carry an empty value and belong to nobody. */
 /* A department head's register is his department's, and the server has already narrowed
    it to that - so narrowing again to his own address here would hide the very requests
    the role exists to read. Everybody else still sees only what they raised. */
 const mine=useMemo(()=>role==="Department Head"?filtered
   :filtered.filter(p=>(p.raisedBy||"")===userEmail),[filtered,userEmail,role]);
 /* Tasks, and the same work seen by day, week or month - one menu entry with the view
    chosen inside, rather than four entries onto the same register. */
 const flash=(x:string)=>{setToast(x);setTimeout(()=>setToast(""),2500)};
 const openMaterial=useCallback(()=>setActive("material"),[]);
 const leaveMaterial=useCallback(()=>{if(!materialOnly)setActive(landingFor(role))},[materialOnly,role]);
 /* Off the material panel, the address drops its #/m/... part. Not while the session is
    still being read on load, though: then "dashboard" is only the starting value, and
    clearing the address would lose the Material screen a refresh is meant to come back to. */
 useEffect(()=>{if(!booting&&active!=="material"&&window.location.hash.startsWith("#/m"))
   window.history.pushState(null,"",window.location.pathname+window.location.search)},[active,booting]);
 useEffect(()=>{const open=(e:Event)=>{const m=(e as CustomEvent<string>).detail as Module;
   if(nav.some(n=>n.id===m))setActive(m)};
   window.addEventListener("cmg:open-module",open);return()=>window.removeEventListener("cmg:open-module",open)},[]);
 const acting=useRef(false);const[busy,setBusy]=useState(false);
 const act=async(p:Payment,status:string,note?:string,fields?:Record<string,string>)=>{
  /* A decision is saved once. Saving used to take seconds with nothing on screen to say so,
     people clicked again, and the repeat was refused because the first had already moved
     the request on - so the last thing they saw was an error, after it had worked. */
  if(acting.current)return;acting.current=true;setBusy(true);
  const owner=status==="Audit Accepted"?userName||"Assigned Auditor"
    :status==="Approved by Auditor – Ready to Release"?"Accounts & Finance"
    :status==="Payment Released"||status==="Expenses Booked"?userName||"Accounts & Finance"
    :status==="Submitted"?"Accountant queue":p.owner;
  let saved:Payment|undefined;
  try{
   if(p.id>0){
    const r=await fetch("/api/payments",{method:"PATCH",headers:{"content-type":"application/json"},
      body:JSON.stringify({id:p.id,status,owner,note,fields})});
    const b=await r.json().catch(()=>({})) as {error?:string;payment?:Payment};
    if(!r.ok)throw new Error(b.error||"That change was refused");
    saved=b.payment||{...p,status,owner};
    setPayments(v=>v.map(x=>x.id===p.id?{...x,...saved}:x));
    setDrawer(d=>d&&d.id===p.id?{...d,...saved}:d);
   }else{
    setPayments(v=>v.map(x=>x.id===p.id?{...x,status,owner}:x));
    setDrawer(d=>d?{...d,status,owner}:d);
   }
   /* The server may route a resubmission to audit rather than accounts, so the message
      follows the status it actually saved. */
   const landed=p.id>0?(saved?.status||status):status;
   flash(status==="Rejected"?`${p.requestNo} rejected and closed`
     :status==="Query Raised"?`${p.requestNo} sent back to the requestor with a query`
     :status==="Audit Query"?`${p.requestNo} sent to Accounts with a query`
     :status==="Submitted"?`${p.requestNo} resubmitted to ${landed==="Pre-Audit Queue"?"Audit":"Accounts"}`
     :`${p.requestNo} moved to ${status}`);
  }catch(e){flash(e instanceof Error?e.message:"That change was refused");loadPayments()}
  finally{acting.current=false;setBusy(false);loadPayments()}};
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
 const createAuditTask=async(kind:AuditTask["kind"],t:{title:string;department:string;companyId:string;due:string;notes:string;attendees?:string;extra?:string;kind?:string;frequency?:string;recurDay?:string;recurUntil?:string;
   category?:string;entity?:string;dueRule?:string;catalogueId?:string;assignedTo?:string;status?:string})=>{
  /* The status a pre-audit task starts in comes from its form; the server holds every
     other kind to Available. */
  try{await auditTasksApi.create({...t,kind:t.kind||kind,status:t.status||"Available"});await loadAuditTasks();
   flash(`${t.kind&&t.kind!=="Meeting"?t.kind:kind==="Meeting"?"Meeting":kind+" task"} created`)}
  /* Passed on as well, so a form can keep what was typed and say what was refused. */
  catch(e){flash(e instanceof Error?e.message:"Could not create it");throw e}};
 /* A pre-audit task is known by its number (Pre-Aud-Task-001); the others by their id. */
 const taskName=(id:string)=>{const t=auditTasks.find(x=>x.id===id);return t?.kind==="Pre-Audit"&&t.ref?t.ref:id};
 const acceptAuditTask=async(id:string)=>{
   try{await auditTasksApi.update({id,action:"accept"});await loadAuditTasks();
     flash(`${taskName(id)} accepted and moved to My Tasks`)}
   catch(e){flash(e instanceof Error?e.message:"Could not accept that task")}};
 const updateAuditTask=async(id:string,status:AuditTask["status"])=>{
   try{await auditTasksApi.update({id,status,...(status==="Completed"?{action:"complete"}:{})});
     await loadAuditTasks();flash(`${taskName(id)} moved to ${status}`)}
   catch(e){flash(e instanceof Error?e.message:"Could not update that task")}};
 /* The Accountant reads the organisation chart and the employee register but does not
    change them. The API enforces the same rule, so this only hides controls that would
    be refused anyway rather than being the rule itself. */
 const viewOnly=role==="Accountant"||role==="Requestor"||role==="Auditor";
 /* A project manager on a plan reaches Accounts Receivable through that plan even when
    their role would not show it - the module then shows them their plans alone. */
 const[managesPlans,setManagesPlans]=useState(false);
 useEffect(()=>{if(!userEmail||!payUser){setManagesPlans(false);return}
   const count=(u:string)=>fetch(u).then(r=>(r.ok?r.json():{count:0}) as Promise<{count?:number}>).then(b=>b.count||0).catch(()=>0);
   Promise.all([count("/api/planning?assigned=me"),count("/api/completion?assigned=me")])
     .then(([plans,jobs])=>setManagesPlans(plans+jobs>0))},[userEmail]);
 const visible=nav.filter(n=>(access[role]||[]).includes(n.id)||(n.id==="accountsreceived"&&managesPlans));
 /* Which role and screen this person was on, so a refresh - or reopening the app - lands
    back there instead of on their first role. Kept in this browser only, per person, and
    used only when that role is still theirs; a screen the role cannot open falls back to
    the role's own first screen. Storage can be unavailable (private window), so every
    read and write is allowed to fail quietly. */
 const viewKey=(email:string)=>`cmg.view.${email.trim().toLowerCase()}`;
 const savedView=(email:string,roles:string[]):{role:string;active:Module}|null=>{
   try{
     const v=JSON.parse(localStorage.getItem(viewKey(email))||"null") as {role?:string;active?:string}|null;
     if(!v?.role||!roles.includes(v.role))return null;
     const screen=v.active as Module|undefined;
     const opens=!!screen&&((access[v.role]||[]).includes(screen)||(screen==="material"&&!!materialCodeFor(v.role)));
     return{role:v.role,active:opens?screen!:landingFor(v.role)};
   }catch{return null}};
 const login=(u:Actor)=>{setExpired(false);setUserName(u.name);setUserEmail(u.email);setAllowedRoles(u.roles);
   const back=savedView(u.email,u.roles);
   setRole(back?.role??u.roles[0]);setActive(back?.active??landingFor(u.roles[0]))};
 useEffect(()=>{if(!userEmail||!role)return;
   try{localStorage.setItem(viewKey(userEmail),JSON.stringify({role,active}))}catch{}},[userEmail,role,active]);
 /* Ask the server who this is. The session cookie is HttpOnly, so the browser cannot
    read it; only this call can say whether it is still valid, which is what makes a
    revoked or expired session take effect on a refresh. */
 useEffect(()=>{fetch("/api/auth/session").then(r=>r.json() as Promise<{actor?:Actor|null}>)
   .then(x=>{if(x.actor)login(x.actor)}).catch(()=>{}).finally(()=>setBooting(false));
  // rendered after mount so the server and client markup cannot disagree on the date
  setTodayLabel(new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}).toUpperCase())},[]);
 /* Every screen makes its own requests, so a session that has stopped working shows
    up wherever the person happens to be - as the server's "Sign in to continue" text
    inside whatever panel asked, with a Try again that asks the same dead session.
    Catching it in one place puts the sign-in screen up instead. */
 /* Notifications for whoever is signed in. There is no push channel on this server,
    so the list is read on sign-in, every thirty seconds, and whenever the window is
    brought back to the front - which is when somebody looks for news. */
 const loadNotes=async()=>{try{const r=await fetch("/api/notifications");if(!r.ok)return;
   const d=await r.json() as{notifications?:Note[];unread?:number};
   setNotes(d.notifications||[]);setUnread(d.unread||0)}catch{}};
 useEffect(()=>{if(!userName||!payUser){setNotes([]);setUnread(0);setNoteOpen(false);return}
   loadNotes();const t=setInterval(loadNotes,30000);
   const onFocus=()=>loadNotes();window.addEventListener("focus",onFocus);
   return()=>{clearInterval(t);window.removeEventListener("focus",onFocus)}},[userName]);
 const openNote=(n:Note)=>{setNoteOpen(false);
   if(!n.readAt){setNotes(v=>v.map(x=>x.id===n.id?{...x,readAt:new Date().toISOString()}:x));
     setUnread(u=>Math.max(0,u-1));
     fetch("/api/notifications",{method:"PATCH",headers:{"content-type":"application/json"},
       body:JSON.stringify({id:n.id})}).catch(()=>{})}
   // a Requestor follows a payment from their own requests, not the accounts queue
   const target=(n.module==="payments"&&role==="Requestor"?"requests":n.module) as Module;
   if(visible.some(v=>v.id===target))setActive(target)};
 const readAll=()=>{setNotes(v=>v.map(x=>x.readAt?x:{...x,readAt:new Date().toISOString()}));setUnread(0);
   fetch("/api/notifications",{method:"PATCH",headers:{"content-type":"application/json"},
     body:JSON.stringify({all:true})}).catch(()=>{})};
 const signedIn=useRef(false);
 signedIn.current=!!userName;
 useEffect(()=>{
   const real=window.fetch;
   window.fetch=async(...args)=>{
     const res=await real(...args);
     const url=typeof args[0]==="string"?args[0]:(args[0] as Request)?.url||"";
     /* Only a person who was signed in can have had a session end. Before sign-in a
        401 is simply expected, and treating it as expiry put "Your session has ended"
        on a first visit. */
     if(res.status===401&&signedIn.current&&url.includes("/api/")&&!url.includes("/api/auth/")&&!url.includes("/material/api/")){
       setUserName("");setUserEmail("");setAllowedRoles([]);
       setExpired(true);                 // say why, rather than a bare login box
     }
     return res};
   return()=>{window.fetch=real};
 },[]);

 const signOut=async()=>{setProfileOpen(false);await fetch("/api/auth/session",{method:"DELETE"}).catch(()=>{});setUserName("");setUserEmail("");setAllowedRoles([]);setPayments(seed);setRole("Audit Head");setActive("dashboard")};
 /* A procurement-side login works in Material first; its own screens (Vendor master) follow the Material menu. */
 const link=(n:typeof nav[number])=><button key={n.id} className={active===n.id?"active":""} onClick={()=>{setActive(n.id);setMobile(false)}}><n.icon/>{n.label}</button>;
 const group=(g:"Payments"|"Audit"|"Administration")=>{const items=visible.filter(n=>NAV_GROUP[n.id]===g);
   return items.length?[<small key={`h-${g}`} className="nav-head">{g}</small>,...items.map(link)]:[]};
 const links=[...group("Payments"),...group("Audit")];
 const adminLinks=group("Administration");
 /* Ctrl+K (or Cmd+K) puts the cursor in the search box at the top. */
 const searchBox=useRef<HTMLInputElement>(null);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchBox.current?.focus()}};
   window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[]);
 const initials=userName?userName.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase():"CM";
 const screenGroup=active==="material"?"Material":NAV_GROUP[active];
 return <WorkforceProvider actor={payUser?userName:""}><MaterialProvider role={userName?matCode:null} person={userEmail}><ResponsiveTables/><div className={drawer&&active==="payments"?"shell docked":"shell"}>{!userName&&!booting&&<LoginOverlay onLogin={login} note={expired?"Your session has ended. Please sign in again.":""}/>} {mobile&&<button className="scrim" onClick={()=>setMobile(false)}/>}<aside className={mobile?"side open":"side"}><div className="brand"><b>CMG</b><div><strong>CMG Control</strong><span>Payments · Audit · Material</span></div><button aria-label="Close menu" onClick={()=>setMobile(false)}><X/></button></div>{userName&&allowedRoles.length>1&&<div className="mobile-controls"><label>ROLE<select value={role} onChange={e=>{const next=e.target.value;setRole(next);setActive(landingFor(next));setMobile(false)}}>{allowedRoles.map(x=><option key={x}>{x}</option>)}</select></label></div>}<nav>{!materialOnly&&links}{userName&&<MaterialSideNav active={active==="material"} heading onOpen={()=>{setActive("material");setMobile(false)}}/>}{materialOnly&&links}{adminLinks}</nav>{userName&&<div className="side-user"><b>{initials}</b><div><strong>{userName}</strong><small>{role}</small></div></div>}<footer className="side-credit"><small>Developed By</small><img src="/developed-by-lof-light.png" alt="LOF - Lab of Future"/></footer></aside><main><header><div className="heading"><button className="hamb" aria-label="Open menu" onClick={()=>setMobile(true)}><Menu/></button><div><small className="top-crumb" title={todayLabel||undefined}>{screenGroup} / {active==="material"?<MaterialTitle/>:nav.find(n=>n.id===active)?.label}</small><h1>{active==="material"?<MaterialTitle/>:nav.find(n=>n.id===active)?.label}</h1></div>{payUser&&active!=="material"&&<label className="top-search"><Search/><input ref={searchBox} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search request no., vendor, PO or invoice" aria-label="Search payment requests"/><kbd>Ctrl K</kbd></label>}</div><div className="head-actions">{active!=="material"&&<div className="head-co"><Building2/><MultiSelect options={companies.map(c=>c.name)} value={companyPicks} onChange={setCompanyPicks} allLabel="All companies" noun="companies"/></div>}<label className="role-pill"><span>Role</span><select aria-label="Role" value={role} onChange={e=>{const next=e.target.value;setRole(next);setActive(landingFor(next))}}>{allowedRoles.map(x=><option key={x}>{x}</option>)}</select></label>{payUser&&<div className="note-menu"><button className="bell" aria-label={unread?`Notifications, ${unread} unread`:"Notifications"} onClick={()=>{setNoteOpen(v=>!v);setProfileOpen(false)}}><Bell/>{unread>0&&<i>{unread>99?"99+":unread}</i>}</button>{noteOpen&&<><button className="profile-scrim" aria-label="Close notifications" onClick={()=>setNoteOpen(false)}/><div className="note-panel" role="menu"><header><b>Notifications</b>{unread>0&&<button onClick={readAll}>Mark all read</button>}</header>{notes.length?notes.map(n=><button key={n.id} className={n.readAt?"":"unread"} onClick={()=>openNote(n)}><b>{n.title}</b>{n.body&&<small>{n.body}</small>}<time>{new Date(n.createdAt).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></button>):<p className="note-empty">Nothing yet. Requests and updates meant for you will appear here.</p>}</div></>}</div>}<div className="profile-menu"><button className="avatar" title={userName||"Profile"} aria-label="Profile menu" aria-haspopup="menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(v=>!v)}>{initials}</button>{profileOpen&&<><button className="profile-scrim" aria-label="Close profile menu" onClick={()=>setProfileOpen(false)}/><div className="profile-dropdown" role="menu"><div className="profile-who"><b>{userName||"Signed in"}</b><small>{userEmail}</small>{!!role&&<i>{role}</i>}</div><button role="menuitem" onClick={()=>{setProfileOpen(false);setPasswordOpen(true)}}><Settings/>Change password</button>{userName&&<button role="menuitem" className="profile-signout" onClick={()=>{setProfileOpen(false);signOut()}}><LogOut/>Sign out</button>}</div></>}</div></div></header>{userName&&<>
 <MaterialLanding code={matCode} active={active==="material"} onOpen={openMaterial} onLeave={leaveMaterial}/>
 {active==="material"&&<MaterialScreen/>}
 
 {active==="dashboard"&&(role==="Requestor"?<RequestorDashboard rows={mine} open={openRequest} create={()=>setForm(true)} go={setActive}/>:role==="Accountant"||role==="Auditor"?<RoleDashboard role={role} payments={filtered} auditTasks={auditTasks} open={openRequest} go={setActive}/>:<Dashboard payments={filtered} go={setActive} open={openRequest}/>)}
 {active==="dashboard"&&visible.some(n=>n.id==="organisation")&&<div className="page wf-dash-wrap"><WorkforceOverview openProfile={setProfile} go={()=>setActive("organisation")}/></div>}
 {active==="requests"&&<RequestorWorkspace rows={role==="Requestor"?mine:filtered} open={openRequest} create={()=>setForm(true)} scope={role==="Department Head"?"department":"own"}/>}
 {active==="payments"&&<PaymentWorkbench departments={departments} companies={companies.map(c=>c.name)} onDelete={removeRequest} rows={filtered} role={role} search={search} setSearch={setSearch} open={openRequest} create={()=>setForm(true)}/>}
 {active==="scheduled"&&<ScheduledPayments role={role} flash={flash}/>}
 {active==="accountsreceived"&&<AccountsReceived role={role} userEmail={userEmail} companies={companies} flash={flash}/>}
 {active==="vendors"&&<VendorMaster flash={flash}/>}
  {active==="preaudit"&&<AuditTaskQueue title="Pre-audit tasks" kind="Pre-Audit" companies={companies} departments={departments} userName={userName} refresh={loadAuditTasks} flash={flash} create={(t)=>createAuditTask("Pre-Audit",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask}/>} 
 {active==="postaudit"&&<AuditTaskQueue title="Post-audit tasks" kind="Post-Audit" companies={companies} create={(t)=>createAuditTask("Post-Audit",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask}/>} 
 {active==="specialaudit"&&<AuditTaskQueue title="Special audit tasks" kind="Special Audit" companies={companies} create={(t)=>createAuditTask("Special Audit",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask}/>} 
 {active==="observations"&&<ObservationDesk openProfile={setProfile} flash={flash} canManage={role!=="Requestor"}/>}

 {active==="meetings"&&<AuditTaskQueue title="Meetings/Tasks" kind="Meeting" companies={companies} create={(t)=>createAuditTask("Meeting",t)} tasks={auditTasks} role={role} accept={acceptAuditTask} update={updateAuditTask}/>} 
 {active==="reports"&&<ReportCentre role={role} payments={payments} tasks={auditTasks} openProfile={setProfile} flash={flash}/>}
 {active==="companies"&&<CompanySetup />}
 {active==="settings"&&<SettingsDesk changed={()=>{refreshOptions();refreshFields();setMasterVersion(n=>n+1)}}/>}
 {active==="users"&&<AccessSetup/>}
 {active==="organisation"&&<OrgChart readOnly={viewOnly} openProfile={setProfile} flash={flash}/>}
 {active==="employees"&&<EmployeeDirectory readOnly={viewOnly} openProfile={setProfile} flash={flash}/>}
 
 
 
 {active==="imports"&&<ImportCentre flash={flash} onImport={async(kind,assigned,dataProvider)=>{
   try{await auditTasksApi.create({title:`Imported ${kind} task`,kind,department:"Finance",
     status:assigned?"Accepted":"Available",assignedTo:assigned||"",dataProvider:dataProvider||"",
     notes:"Created from the import centre"});await loadAuditTasks();flash("Audit task created")}
   catch(e){flash(e instanceof Error?e.message:"Could not create the task")}}}/>}
 </>}</main>{profile&&<EmployeeProfile id={profile} close={()=>setProfile(null)} flash={flash} openProfile={setProfile}/>}{/* Keyed by status, so each stage opens with empty boxes - the panel stays open as a request moves on, and a remark typed at one decision was being saved again with the next. */}{drawer&&<PaymentDetail key={`${drawer.id}:${drawer.status}`} busy={busy} payment={drawer} role={role} onDelete={()=>removeRequest(drawer)} onClose={()=>setDrawer(null)} onPriority={(saved:any)=>{setPayments((v:any[])=>v.map(x=>x.id===saved.id?{...x,...saved}:x));setDrawer((d:any)=>d&&d.id===saved.id?{...d,...saved}:d);flash(saved.deptPriority?`Priority set to ${saved.deptPriority}`:"Priority removed")}} onAction={(s:string,note?:string,fields?:Record<string,string>)=>act(drawer,s,note,fields)} userName={userName} userEmail={userEmail} companies={companies} departments={departments} natures={natures} currencies={currencies} tdsChoices={tdsChoices} termsChoices={termsChoices} modeChoices={modeChoices} jobs={jobs}/>} {form&&<PaymentForm companies={companies} departments={departments} natures={natures} currencies={currencies} tdsChoices={tdsChoices} termsChoices={termsChoices} modeChoices={modeChoices} jobs={jobs} close={()=>setForm(false)} added={(p:Payment)=>{setPayments(v=>[p,...v]);setForm(false);flash(`${p.requestNo} submitted successfully`)}}/>}{passwordOpen&&<PasswordReset name={userName} email={userEmail} close={()=>setPasswordOpen(false)} done={()=>{setPasswordOpen(false);flash("Password updated. Please sign in again.");signOut()}}/>}{toast&&<div className="toast"><CheckCircle2/>{toast}</div>}</div></MaterialProvider></WorkforceProvider>
}
/* Where a role starts: its material home for a material role, else the payment one. */
const landingFor=(role:string):Module=>materialCodeFor(role)&&!isPaymentRole(role)?"material":role==="Requestor"?"requests":"dashboard";
function PasswordReset({name,email,close,done}:{name:string;email:string;close:()=>void;done:()=>void}){const[current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false);const valid=current.length>=1&&next.length>=10&&/[A-Za-z]/.test(next)&&/[0-9]/.test(next)&&next===confirm;const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid)return;setSaving(true);setError("");try{const r=await fetch("/api/auth/change-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({current,next})});const data=(await r.json()) as {error?:string};if(!r.ok)throw new Error(data.error||"Unable to update password.");done()}catch(err){setError(err instanceof Error?err.message:"Unable to update password.")}finally{setSaving(false)}};return <><button className="overlay" onClick={close}/><form className="modal password-reset" onSubmit={submit}><header><div><small>ACCOUNT SECURITY</small><h2>Change my password</h2></div><button type="button" onClick={close}><X/></button></header><div className="form"><p className="wide">Signed in as <b>{name}</b></p><label className="wide">Current password<input required autoComplete="current-password" type="password" value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input required minLength={10} autoComplete="new-password" type="password" value={next} onChange={e=>setNext(e.target.value)}/></label><label>Confirm new password<input required minLength={10} autoComplete="new-password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{confirm&&next!==confirm&&<p className="wide login-error">Passwords do not match.</p>}{error&&<p className="wide login-error">{error}</p>}</div><footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={!valid||saving}>{saving?"Updating…":"Update administrator password"}</button></footer></form></>}
function RequestorDashboard({rows,open,create,go}:{rows:Payment[];open:(p:Payment)=>void;create:()=>void;go:(m:Module)=>void}){
 const total=rows.length,released=rows.filter(r=>r.status==="Payment Released"||r.status==="Expenses Booked").length;
 const rejected=rows.filter(r=>r.status==="Query Raised").length;
 const closed=rows.filter(r=>r.status==="Rejected"||r.status==="Audit Rejected").length;
 const open_=total-released-rejected-closed;
 return <div className="page">
  <Intro eyebrow="MY REQUESTS" title="Your payment requests"
    sub="Everything you have raised, and where each one has reached."
    action={<button className="primary" onClick={create}><Plus/>New payment request</button>}/>
  <div className="metrics">
   {([["Raised",String(total),"in total","blue"],["In progress",String(open_),"awaiting a decision","amber"],
     ["Released",String(released),"paid out","green"],["Query raised",String(rejected),"correct and resubmit","red"]] as string[][])
     .map(x=><article className={x[3]} key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><small>{x[2]}</small></article>)}
  </div>
  <section className="panel table-panel">
   <div className="panel-head"><div><small>MY REQUESTS</small><h2>Latest first</h2></div>
     <button onClick={()=>go("requests")}>View all</button></div>
   {!rows.length&&<p className="queue-empty">You have not raised a payment request yet.</p>}
   {!!rows.length&&<div className="table-wrap"><table><thead><tr><th>Request</th><th>Vendor</th>
     <th className="num">Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>
     {rows.slice(0,8).map(r=><tr key={r.id} onClick={()=>open(r)}><td><b>{r.requestNo}</b></td>
       <td>{r.vendor}</td><td><b>{r.currency} {r.amount.toLocaleString()}</b></td><td>{r.due}</td>
       <td><span className={pillClass(r.status)}>{r.status}</span></td></tr>)}
     </tbody></table></div>}
  </section></div>;
}
function Intro({eyebrow,title,sub,action}:{eyebrow:string;title:string;sub:string;action?:React.ReactNode}){return <div className="intro"><div><small>{eyebrow}</small><h2>{title}</h2><p>{sub}</p></div>{action}</div>}
/* Overdue by how many days, from a YYYY-MM-DD due date; 0 when not overdue. */
const overdueDays=(due:string|undefined,today:string)=>{const d=String(due||"").slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d>=today)return 0;
  return Math.round((Date.parse(today)-Date.parse(d))/86400000)};
const STAGE_TONE=["neutral","accounts","audit","correction","audit","released"];
function Dashboard({payments,go,open:openRequest}:{payments:Payment[];go:(m:Module)=>void;open:(p:Payment)=>void}){
 /* Every figure here is counted from the payment requests actually in the database.
    This panel used to show a fixed 82/100 with invented metrics, which on a live
    system reads as real reporting rather than placeholder art. */
 const closed=payments.filter(p=>p.status==="Rejected");
 const open=payments.filter(p=>p.status!=="Payment Released"&&p.status!=="Expenses Booked"&&p.status!=="Audit Rejected"&&p.status!=="Rejected");
 const released=payments.filter(p=>p.status==="Payment Released"||p.status==="Expenses Booked");
 const needsApproval=payments.filter(p=>/Approval|Review|Queue/.test(p.status));
 const available=payments.filter(p=>p.status==="Pre-Audit Queue");
 const rejected=payments.filter(p=>/Audit Rejected|Query|Observation/.test(p.status));
 const value=(rows:Payment[])=>rows.reduce((n,p)=>n+(Number(p.amount)||0),0);
 const money=(n:number)=>n>=1000000?`${(n/1000000).toFixed(2)}M`:n>=1000?`${Math.round(n/1000)}K`:String(n);
 const companiesIn=(rows:Payment[])=>new Set(rows.map(p=>p.company)).size;
 const across=(rows:Payment[])=>{const n=companiesIn(rows);return n>1?` across ${n} companies`:""};
 const settled=released.length+closed.length;
 const pct=(n:number)=>payments.length?Math.round(n/payments.length*100):0;
 const health=pct(released.length);
 const today=new Date().toISOString().slice(0,10);
 const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
 const byCompany=Array.from(new Set(payments.map(p=>p.company))).map(c=>{
   const rows=payments.filter(p=>p.company===c);
   const done=rows.filter(p=>p.status==="Payment Released"||p.status==="Expenses Booked").length;
   const live=open.filter(p=>p.company===c);
   return{name:c,pct:rows.length?Math.round(done/rows.length*100):0,open:live.length,openValue:value(live),
     stuck:rows.filter(p=>/Audit Rejected|Query|Observation/.test(p.status)).length}});
 /* The six stages of lib/payment-stages, each with what sits in it now. Rejected requests
    are closed and belong to no stage. */
 const live=payments.filter(p=>p.status!=="Rejected"&&p.status!=="Audit Rejected");
 const stagesNow=["Requested","Accounts","Audit","Correction","Recheck","Release"].map((label,i)=>{
   const rows=live.filter(p=>stageIndex(p.status)===i);return{label,n:rows.length,v:value(rows)}});
 const kpis:[string,Payment[],string,string,string][]=[
   ["Awaiting approval",needsApproval,"Approval","neutral",needsApproval.length?`AED ${money(value(needsApproval))}${across(needsApproval)}`:"Nothing waiting"],
   ["Needs attention",rejected,"Action","correction",rejected.length?"Query or observation raised":"None"],
   ["Pre-audit queue",available,"Audit","audit",available.length?"Available to accept":"Queue is clear"],
   ["Open requests",open,"Open","accounts",open.length?`AED ${money(value(open))}${across(open)}`:"All settled"],
   ["Released",released,"Done","released",released.length?`AED ${money(value(released))}`:"None yet"]];
 const dated=open.filter(p=>/^\d{4}-\d{2}-\d{2}/.test(String(p.due||"")));
 const coming=dated.filter(p=>String(p.due).slice(0,10)>=today).sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,5);
 const late=dated.filter(p=>String(p.due).slice(0,10)<today).length;
 return <div className="page dash">
  <div className="metrics">{kpis.map(([label,rows,tag,tone,sub])=><article className="kpi" key={label}>
    <span className="kpi-label">{label}</span><i className={`pill tone-${tone}`}>{tag}</i>
    <b className="kpi-value">{rows.length}</b><small className="kpi-sub">{sub}</small></article>)}</div>
  <div className="dash-grid">
   <section className="panel span-2"><div className="card-head"><div><h2>Request pipeline</h2><p>Where every live request sits right now</p></div>
     {!!payments.length&&<button className="secondary" onClick={()=>go("payments")}>Open queues →</button>}</div>
    <div className="pipeline">{stagesNow.map((st,i)=><div key={st.label}>
      <i style={{background:STAGE_TONE[i]==="neutral"?"var(--tone-neutral-bar)":`var(--tone-${STAGE_TONE[i]}-bar)`}}/>
      <span>{i+1} · {st.label}</span><b>{st.n}</b><small>{st.n?`AED ${money(st.v)}`:"—"}</small></div>)}</div></section>
   <section className="panel"><div className="card-head"><div><h2>Completion</h2><p>Released or booked, of everything raised</p></div></div>
    <div className="completion"><b>{health}%</b>
     <p>{payments.length?`${released.length} of ${payments.length} requests released or booked${rejected.length?` · ${rejected.length} needing attention`:""}`:"No payment requests raised yet"}</p>
     {([["Released",pct(released.length)],["Settled",pct(settled)],["In progress",pct(open.length)]] as [string,number][])
       .map(([label,n])=><label key={label}><span>{label}<b>{n}%</b></span><div className="bar"><i style={{width:`${n}%`}}/></div></label>)}</div></section>
  </div>
  <div className="dash-grid">
   <section className="panel span-2"><div className="card-head"><div><h2>Needs attention now</h2><p>The newest open requests</p></div>
     {!!payments.length&&<button className="secondary" onClick={()=>go("payments")}>View all</button>}</div>
    {!open.length?<p className="queue-empty">Nothing in the queue. Raise a payment request to begin.</p>
    :<div className="table-wrap"><table><thead><tr><th>Request</th><th>Vendor</th><th className="num">Amount</th><th>Stage</th><th>Due</th></tr></thead>
      <tbody>{open.slice(0,6).map(p=>{const late=overdueDays(p.due,today);
        return <tr key={p.id} className="clickable" onClick={()=>openRequest(p)}>
        <td><span className="ref">{p.requestNo}</span><small>{p.company}</small></td>
        <td><b>{p.vendor}</b><small>{p.nature||p.department}</small></td>
        <td className="num"><b>{p.currency} {Number(p.amount).toLocaleString()}</b></td>
        <td><span className={pillClass(p.status)}>{p.status}</span></td>
        <td className="nowrap">{late?<span className="overdue">Overdue {late}d</span>:(p.due||"—")}</td></tr>})}</tbody></table></div>}</section>
   <section className="panel"><div className="card-head"><div><h2>Falling due</h2><p>Soonest first, from today</p></div></div>
    <div className="due-list">{coming.map(p=>{const due=String(p.due).slice(0,10);
      return <div key={p.id} className="clickable" onClick={()=>openRequest(p)} title={due===today?`Due today (${due})`:`Due ${due}`}>
        <time><small>{MONTHS[Number(due.slice(5,7))-1]||"Due"}</small><b>{due.slice(8,10)}</b></time>
        <span><b>{p.vendor}</b><small>{p.company}{due===today?" · due today":""}</small></span>
        <em>{p.currency} {Number(p.amount).toLocaleString()}</em></div>})}</div>
    {!coming.length&&<p className="queue-empty">{open.length?"Nothing falls due from today onward.":"Nothing scheduled."}</p>}
    {late>0&&<p className="due-note">{late} open {late===1?"request is":"requests are"} already past the due date.</p>}</section>
  </div>
  <div className="section-title"><h2>Position by entity</h2><p>Released share of each company's requests</p></div>
  {!byCompany.length?<section className="panel"><p className="queue-empty">No requests raised yet.</p></section>
  :<div className="entities">{byCompany.map(r=><article className="entity" key={r.name}>
    <div><b title={r.name}>{r.name}</b><span>{r.pct}%</span></div><div className="bar"><i style={{width:`${r.pct}%`}}/></div>
    <p>{r.open} open · {r.stuck} flagged{r.open?` · AED ${money(r.openValue)} open`:""}</p></article>)}</div>}
 </div>}

function Payments({rows,search,setSearch,open,create}:any){return <div className="page"><div className="toolbar"><label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payment, vendor or status"/></label><button>Status: All <ChevronDown/></button><button className="primary" onClick={create}><Plus/>New payment request</button></div><section className="panel table-panel"><div className="panel-head"><div><small>PAYMENT CONTROL</small><h2>All requests</h2></div><span>{rows.length} records</span></div><div className="table-wrap"><table><thead><tr><th>REQUEST</th><th>COMPANY / DEPARTMENT</th><th>VENDOR</th><th>AMOUNT</th><th>DUE</th><th>STATUS</th><th>OWNER</th></tr></thead><tbody>{rows.map((p:Payment)=><tr key={p.id} onClick={()=>open(p)}><td><b>{p.requestNo}</b></td><td>{p.company}<small>{p.department}</small></td><td>{p.vendor}</td><td><b>{p.currency} {p.amount.toLocaleString()}</b></td><td>{p.due}<small>{p.urgency}</small></td><td><span className={`badge ${tone[p.status]||"blue"}`}>{p.status}</span></td><td>{p.owner}</td></tr>)}</tbody></table></div></section></div>}
function Queue({tasks,accept,role,go}:{tasks:AuditTask[];accept:(id:string)=>void;role:string;go:(m:Module)=>void}){const[dept,setDept]=useState("All departments");const rows=tasks.filter(t=>t.kind==="Pre-Audit"&&(dept==="All departments"||t.department===dept)),available=rows.filter(t=>t.status==="Available"),mine=rows.filter(t=>t.status!=="Available");return <div className="page"><Intro eyebrow="AUDITOR WORKSPACE" title="Pre-audit tasks by department" sub="Accept available work; accepted items leave the queue and appear in My Tasks." action={<div className="audit-actions">{role==="Audit Head"&&<button className="primary" onClick={()=>go("imports")}><Import/>Import Excel</button>}<select value={dept} onChange={e=>setDept(e.target.value)}><option>All departments</option>{Array.from(new Set(tasks.filter(t=>t.kind==="Pre-Audit").map(t=>t.department))).map(x=><option key={x}>{x}</option>)}</select></div>}/><AuditTaskCards title="Available pre-audit queue" rows={available} accept={accept}/><AuditTaskCards title="My accepted pre-audit tasks" rows={mine}/></div>}
function AuditTaskCards({title,rows,accept}:{title:string;rows:AuditTask[];accept?:(id:string)=>void}){return <section className="panel audit-task-section"><div className="panel-head"><h2>{title}</h2><span>{rows.length}</span></div><div className="cards">{rows.map((t,i)=><article className="task" key={t.id}><div><span className={i===1?"badge red":"badge amber"}>{t.department}</span><small>{t.company}</small></div><h3>{t.title}</h3><p>{(t.kind==="Pre-Audit"&&t.ref)||t.id} · {t.kind} · Evidence required</p><footer><span><FileText/> {i+2} documents</span>{accept?<button onClick={()=>accept(t.id)}>Accept to start</button>:<button>Open my task</button>}</footer></article>)}</div>{!rows.length&&<p className="queue-empty">No tasks in this queue.</p>}</section>}
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
function PaymentForm({close,added,companies,departments,natures,currencies,tdsChoices,termsChoices,modeChoices,jobs}:{close:()=>void;added:(p:Payment)=>void;companies:{id:string;name:string}[];departments:string[];natures:string[];currencies:string[];tdsChoices:string[];termsChoices:string[];modeChoices:string[];jobs:Job[]}){
 const extraFields=useExtraFields("payment");const[v,setV]=useState({company:companies[0]?.name||"",vendor:"",amount:"",currency:defaultCurrencyFor(companies[0]?.name||"",currencies)||currencies[0]||"",department:departments[0]||"",due:"",description:"",poNumber:"",nature:natures[0]||"",tds:"No",projectCode:"",invoiceNumber:"",invoiceDate:"",paymentTerms:"",period:"",
  /* Declared rather than left to appear when first typed in. The generic handler writes
     any field by key, so these worked without being here - but only at runtime, and the
     type then disagreed with what the form actually holds. paymentMode was in that state
     too. */
  paymentMode:"",jbCode:"",project:"",jobLocation:""});const[extra,setExtra]=useState<Record<string,string>>({});const[vendorHints,setVendorHints]=useState<string[]>([]);const[failed,setFailed]=useState("");const[vendorOpen,setVendorOpen]=useState(false);const[files,setFiles]=useState<File[]>([]);const[saving,setSaving]=useState(false);
 /* Whether this company goes to management first. The setting is an administrator's to
    read; anybody else gets no answer, and the form then says the step may apply rather
    than guessing. The server decides the route either way. */
 const[mgmtSetting,setMgmtSetting]=useState<{enabled:boolean;companies:string[]}|null>(null);
 useEffect(()=>{fetch("/api/settings/workflow").then(r=>r.ok?r.json():null)
   .then((d:any)=>{if(d?.managementApproval)setMgmtSetting(d.managementApproval)}).catch(()=>{})},[]);
 const mgmtFirst:boolean|null=mgmtSetting?needsManagementApproval(v.company,mgmtSetting):null;
 useEffect(()=>{if(natures.length&&!natures.includes(v.nature))
  setV(c=>({...c,nature:natures[0]}))},[natures,v.nature]);
 useEffect(()=>{if(currencies.length&&!currencies.includes(v.currency))
  setV(c=>({...c,currency:defaultCurrencyFor(c.company,currencies)||currencies[0]}))},[currencies,v.currency]);
 /* The TDS effect that sat here is gone with the field. It kept writing a value into the
    form for something no longer asked for, and the form would have gone on posting it. */
 useEffect(()=>{if(departments.length&&!departments.includes(v.department))setV(c=>({...c,department:departments[0]}))},[departments,v.department]);/* Changing the type clears what that type does not use, so a PO number typed under one
   type is not carried into another that hides it. The server clears them too. */
 useEffect(()=>{setV(c=>{const next={...c} as Record<string,string>;let touched=false;
   for(const f of FIELD_ORDER)if(ruleFor(c.nature,f)==="H"&&next[f]){next[f]="";touched=true}
   return touched?(next as typeof c):c})},[v.nature]);
 /* Suggestions for the vendor field, from the register. The field stays an ordinary
    text box - a vendor nobody has paid before has to be typeable, and whatever is typed
    is remembered for the next person. */
 useEffect(()=>{const q=(v.vendor||"").trim();
   if(q.length<2){setVendorHints([]);return}
   let live=true;
   const t=setTimeout(()=>{fetch(`/api/vendors?q=${encodeURIComponent(q)}&limit=12`)
     .then(r=>r.json() as Promise<{vendors?:{name:string}[]}>)
     .then(d=>{if(live)setVendorHints((d.vendors||[]).map(x=>x.name))}).catch(()=>{})},200);
   return()=>{live=false;clearTimeout(t)}},[v.vendor]);
  const submit=async(e:any)=>{e.preventDefault();if(saving)return;setSaving(true);setFailed("");
 /* The number comes back from the server, which owns it. */
 let p:any={...v,extra:packExtra(extraFields,extra),amount:Number(v.amount),
   status:"Submitted",owner:"Accountant queue",urgency:"Normal"};
 try{
   const r=await fetch("/api/payments",{method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify(p)});
   const answer=await r.json().catch(()=>({})) as {payment?:Payment;error?:string};
   /* A failure used to be swallowed: the request was reported as submitted and added to
      the list from the browser's own copy, so it looked raised until the page was
      reloaded and it was not there. */
   if(!r.ok||!answer.payment){
     setFailed(answer.error||"The request could not be saved. Nothing has been submitted.");
     setSaving(false);return;
   }
   p=answer.payment;
 }catch{
   setFailed("Could not reach the server. Nothing has been submitted.");
   setSaving(false);return;
 }/* The documents were collected and then dropped: the input had no handler, so nothing
   ever reached the server and Accounts and Audit opened the request to find it empty.
   They upload here, once the request exists and has the id they hang off, so everyone
   who opens it afterwards sees the same list. */
for(const file of files){try{const dataUrl=await asDataUrl(file);await fetch("/api/attachments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entityType:"payment",entityId:String(p.id),kind:"Other",fileName:file.name,dataUrl})});}catch{}}setSaving(false);added(p)};
 /* Which section of the form each field sits in. Anything not named here - a field added
    to FIELD_ORDER later - falls into "Project & payment", so nothing can go missing. */
 const SECTION:Record<string,1|2|3>={company:1,department:1,nature:1,currency:1,
   vendor:2,invoiceNumber:2,invoiceDate:2,poNumber:2,amount:2};
 const HELP:Record<string,string>={nature:"Changes which fields below are required",currency:"Set from the company"};
 const field=(key:typeof FIELD_ORDER[number])=>{
   const need=ruleFor(v.nature,key);
   if(need==="H"||key==="description")return null;
   const must=need==="M";
   const choices=key==="company"?companies.map(c=>c.name):key==="department"?departments
     :key==="nature"?natures:key==="tds"?tdsChoices:key==="currency"?currencies
     :key==="paymentMode"?modeChoices:key==="paymentTerms"?termsChoices
     /* The job register drives all three. A code names one project at one site, so
        choosing the code fills the other two rather than leaving them to be matched by
        hand; they stay dropdowns so a job the register does not hold can still be picked
        from what it does. */
     :key==="jbCode"?jobs.map(j=>j.code)
     :key==="project"?distinct(jobs,"project")
     :key==="jobLocation"?distinct(jobs,"location"):null;
   return <label className={key==="vendor"?"wide vendor-field":""} key={key}>
     <span className="field-label">{labelFor(v.nature,key)}{must?<i className="req-star" aria-hidden="true">*</i>:<i className="field-optional">optional</i>}</span>
     {choices
       ?<select required={must} value={(v as any)[key]}
          onChange={e=>{
           const picked=e.target.value;
           /* Choosing a JB code carries its project and location with it. The register is
              the authority on which site a code belongs to, so filling them here stops a
              payment being booked against a project the code does not run at. Both stay
              editable afterwards. */
           const job=key==="jbCode"?jobFor(jobs,picked):undefined;
           /* Choosing the company sets the currency its payments are made in (INR for
              TOP ROCK GLOBAL); another company goes back to the list's first currency. */
           const currency=key==="company"?(defaultCurrencyFor(picked,currencies)||currencies[0]||v.currency):v.currency;
           setV(job?{...v,jbCode:picked,project:job.project,jobLocation:job.location}
             :{...v,[key]:picked,...(key==="company"?{currency}:{})})}}>
          {(!must||!(v as any)[key])&&<option value="">— choose —</option>}
          {choices.map(o=><option key={o}>{o}</option>)}</select>
       :key==="amount"
         ?<span className="amount-input"><b>{v.currency||"—"}</b><input required={must} type="number" value={v.amount}
            onChange={e=>setV({...v,amount:e.target.value})}/></span>
         :<input required={must} value={(v as any)[key]}
          autoComplete={key==="vendor"?"off":undefined}
          onFocus={key==="vendor"?()=>setVendorOpen(true):undefined}
          onBlur={key==="vendor"?()=>setTimeout(()=>setVendorOpen(false),120):undefined}
          type={key==="due"||key==="invoiceDate"?"date":"text"}
          onChange={e=>{setV({...v,[key]:e.target.value});if(key==="vendor")setVendorOpen(true)}}/>}
     {HELP[key]&&<small className="field-help">{HELP[key]}</small>}
     {/* Drawn here rather than left to the browser's own suggestion box, which filters
         the list again by its own rules and is inconsistent about capitals. Whatever the
         register matched is what is offered. */}
     {key==="vendor"&&vendorOpen&&!!vendorHints.length&&
       <div className="wf-picker vendor-picker">{vendorHints.map(n=>
         <button type="button" key={n}
           onMouseDown={e=>{e.preventDefault();setV({...v,vendor:n});setVendorOpen(false)}}>
           <b>{n}</b></button>)}</div>}
   </label>};
 const inSection=(n:1|2|3)=>FIELD_ORDER.filter(k=>(SECTION[k]||3)===n).map(field);
 const section=(n:number,title:string,sub:string,body:React.ReactNode)=><section className="form-section">
   <header><i>{n}</i><div><h2>{title}</h2><p>{sub}</p></div></header><div className="form">{body}</div></section>;
 const route=[...(mgmtFirst!==false?[{label:"Management approval",note:mgmtFirst===null?"If the company needs it":""}]:[]),
   {label:"Accounts review",note:""},{label:"Pre-audit",note:""},{label:"Finance release",note:""}];
 const checks:[string,boolean][]=[["Vendor",!!v.vendor.trim()],["Amount",Number(v.amount)>0],
   ["Invoice no. & date",ruleFor(v.nature,"invoiceNumber")==="H"||(!!v.invoiceNumber.trim()&&(ruleFor(v.nature,"invoiceDate")==="H"||!!v.invoiceDate))],
   ["Documents",ruleFor(v.nature,"documents")!=="M"||files.length>0]];
 return <div className="sheet" role="dialog" aria-label="New payment request"><form className="sheet-inner" onSubmit={submit}>
  <div className="sheet-head"><button type="button" className="icon-btn" aria-label="Back" onClick={close}><ArrowLeft/></button>
   <div><small className="top-crumb">Payments / New payment request</small><h1>New payment request</h1></div>
   <div className="sheet-actions"><button type="button" className="secondary" onClick={close}>Cancel</button></div></div>
  <div className="sheet-body">
   <div className="sheet-main">
    {section(1,"Request basics","Who is paying, and for what",inSection(1))}
    {section(2,"Vendor & invoice","Who is being paid, against which invoice",inSection(2))}
    {section(3,"Project & payment","Where it is booked and how it is paid",<>{inSection(3)}
      <ExtraFields form="payment" values={extra} onChange={setExtra}/>
      <label className="wide"><span className="field-label">{labelFor(v.nature,"description")}{ruleFor(v.nature,"description")==="M"?<i className="req-star" aria-hidden="true">*</i>:<i className="field-optional">optional</i>}</span>
        <textarea required={ruleFor(v.nature,"description")==="M"} value={v.description}
          onChange={e=>setV({...v,description:e.target.value})}/></label></>)}
    {section(4,"Supporting documents","Invoice, PO and anything accounts will need",
      <FilePicker className="wide" files={files} onChange={setFiles} label={labelFor(v.nature,"documents")}
        required={ruleFor(v.nature,"documents")==="M"}/>)}
   </div>
   <aside className="sheet-side">
    <section className="card summary-card"><small className="eyebrow">Summary</small>
     <b className="summary-amount">{v.currency} {v.amount?Number(v.amount).toLocaleString():"0"}</b>
     <p>{v.vendor||"No vendor yet"} · {v.company||"No company"}</p>
     <hr/><small className="eyebrow">Approval route</small>
     <ol className="route">{route.map((r,i)=><li key={r.label} className={i===0?"on":""}><i/><span>{r.label}{r.note&&<small>{r.note}</small>}</span></li>)}</ol></section>
    <section className="card summary-card"><h2>Before you submit</h2>
     <ul className="checklist">{checks.map(([label,ok])=><li key={label} className={ok?"ok":""}><i>{ok?<Check/>:null}</i>{label}</li>)}</ul>
     {!!failed&&<p className="form-error">{failed}</p>}
     <button className="primary submit-btn" disabled={saving}>{saving?"Submitting…":mgmtFirst===true?"Submit to management":mgmtFirst===false?"Submit to accountant":"Submit request"}</button>
     <p className="summary-note">A request number is issued when it is saved.</p></section>
   </aside>
  </div></form></div>}

/* Report centre: the payment and audit report, and the workforce report, under one
   menu entry.

   They used to be two modules reaching different people. Payments and audit went to
   Requestors, Accountants and Auditors; the workforce report - every employee's task
   position across the group - went to Finance and Management. Merging them must not
   hand the workforce figures to a Requestor, whose own tasks are private to them, so
   each tab stays with the roles that could open it before. A role with both sees tabs;
   a role with one goes straight to it. */
const PAYMENT_REPORT_ROLES=["Administrator","Audit Head","Requestor","Accountant","Auditor","Department Head"];
const WORKFORCE_REPORT_ROLES=["Administrator","Audit Head","Finance","Management"];
function ReportCentre({role,payments,tasks,openProfile,flash}:{role:string;payments:Payment[];
  tasks:AuditTask[];openProfile:(id:string)=>void;flash:(m:string)=>void}){
 const pay=PAYMENT_REPORT_ROLES.includes(role),work=WORKFORCE_REPORT_ROLES.includes(role);
 const[tab,setTab]=useState<"payments"|"workforce">(pay?"payments":"workforce");
 const shown=tab==="payments"&&pay?"payments":work?"workforce":pay?"payments":null;
 return <div className="report-centre">
  {pay&&work&&<div className="report-centre-tabs"><div className="settings-tabs">
   <button className={shown==="payments"?"active":""} onClick={()=>setTab("payments")}>Payments &amp; audit</button>
   <button className={shown==="workforce"?"active":""} onClick={()=>setTab("workforce")}>Workforce</button>
  </div></div>}
  {shown==="payments"&&<ReportsCentre payments={payments} tasks={tasks} flash={flash}/>}
  {shown==="workforce"&&<WorkforceReports openProfile={openProfile} flash={flash}/>}
 </div>}
