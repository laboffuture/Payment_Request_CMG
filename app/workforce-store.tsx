"use client";
import{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState}from"react";

export type RoleType="Group"|"Vertical"|"Function"|"Support";
export type Frequency="Daily"|"Weekly"|"Monthly"|"One Time";
export type Priority="Low"|"Medium"|"High"|"Critical";
export type WorkStatus="Not Started"|"In Progress"|"On Hold"|"Completed"|"Overdue"|"Cancelled";
export type QueryStatus="Open"|"Followed Up"|"Resolved"|"Closed";
export const statuses:WorkStatus[]=["Not Started","In Progress","On Hold","Completed","Overdue","Cancelled"];
export const queryStatuses:QueryStatus[]=["Open","Followed Up","Resolved","Closed"];
export const priorities:Priority[]=["Low","Medium","High","Critical"];
export const frequencies:Frequency[]=["Daily","Weekly","Monthly","One Time"];
export const roleTypes:RoleType[]=["Group","Vertical","Function","Support"];

export type Dept={id:string;name:string;code:string;color:string;position:number};
export type Role={id:string;deptId:string;name:string;type:RoleType;parentId:string|null;color:string;jd:string};
export type Employee={id:string;code:string;name:string;designation:string;roleId:string;deptId:string;
  department:string;reportsTo:string|null;email:string;phone:string;jd:string;photoAt:string;active:boolean;joined:string};
export type Task={id:string;seriesId:string;name:string;description:string;frequency:Frequency;period:string;
  start:string;due:string;priority:Priority;employeeId:string;deptId:string;assignedBy:string;expectedOutput:string;
  remarks:string;status:WorkStatus;progress:number;qty:number;done:number;blocker:string;nextAction:string;
  completedAt:string;endsAt:string;updatedAt:string};
export type Token={id:string;number:string;taskType:string;created:string;createdBy:string;employeeId:string;
  functionRoleId:string;deptId:string;priority:Priority;reference:string;qty:number;done:number;status:WorkStatus;remarks:string};
export type Query={id:string;ref:string;title:string;detail:string;raisedBy:string;employeeId:string;taskId:string;
  deptId:string;priority:Priority;status:QueryStatus;raisedAt:string;dueAt:string;followUps:number;
  lastFollowUpAt:string;resolvedAt:string;resolution:string};
export type ObsTag={id:string;name:string};
export type Observation={id:string;ref:string;title:string;detail:string;deptId:string;taskId:string;
  risk:Priority;status:"Open"|"Acknowledged"|"Resolved"|"Closed";raisedBy:string;raisedAt:string;
  target:string;resolvedAt:string;resolution:string;replyCount:number;lastReplyAt:string;tags:ObsTag[]};
export type ObsReply={id:string;observationId:string;employeeId:string;authorName:string;text:string;at:string};
export type ImportRow={line:number;name:string;employee:string;frequency:string;due:string;
  ends?:string;jd?:string;priority?:string;status?:string;qty?:number;done?:number;
  progress?:number;expectedOutput?:string;remarks?:string};
export type ImportResult={imported:number;rejected:number;employees:number;jdUpdated?:number;
  errors:{row:number;reason:string}[]};
export const obsStatuses=["Open","Acknowledged","Resolved","Closed"] as const;
export type Dossier={employee:Employee;role:Role|null;department:Dept|null;manager:{id:string;name:string}|null;
  directReports:{id:string;name:string;code:string;photoAt:string}[];
  performance:{total:number;completed:number;open:number;onTime:number;late:number;delayed:number;
    onTimeRate:number;completionRate:number;byFrequency:Record<string,number>};
  queryStats:{raised:number;open:number;followed:number;resolved:number;followUpCount:number;resolutionRate:number};
  tokenStats:{tokens:number;qty:number;done:number;pending:number};
  observationStats:{tagged:number;open:number;closed:number;overdue:number;replies:number;responseRate:number};
  observations:{id:string;ref:string;title:string;risk:string;status:string;target:string;
    replyCount:number;raisedBy:string;raisedAt:string}[];
  tasks:Task[];queries:Query[];tokens:Token[]};
export type Summary={
  totals:Record<string,number>;
  departments:Record<string,unknown>[];roles:Record<string,unknown>[];
  queries:Record<string,unknown>;tokens:Record<string,unknown>;watchlist:Record<string,unknown>[]};

/* ---------- date + status helpers ---------- */
/* Every date here is a plain YYYY-MM-DD day, and all of the arithmetic is done in UTC.
   Parsing "2026-08-27T00:00:00" gives local midnight while toISOString() reports UTC, so
   in any zone ahead of UTC — Dubai at +4, India at +5:30, both of them ours — the two
   cancelled out and shift(d,+1) returned the day it was given. A daily series then
   generated the same due date over and over until it hit the catch-up cap. Anchoring the
   parse to UTC keeps a day a day, and matches the server, which builds today's date the
   same way. */
export const iso=(d:Date)=>d.toISOString().slice(0,10);
export const today=()=>iso(new Date());
export const shift=(date:string,days:number)=>{const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return iso(d)};
export const addMonth=(date:string)=>{const d=new Date(date+"T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+1);return iso(d)};
export const weekKey=(date:string)=>{const d=new Date(date+"T00:00:00Z");const t=new Date(d);
  t.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y0=Date.UTC(t.getUTCFullYear(),0,1);
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime()-y0)/86400000+1)/7)).padStart(2,"0")}`};
export const periodOf=(f:Frequency,date:string)=>f==="Daily"?date:f==="Weekly"?weekKey(date):f==="Monthly"?date.slice(0,7):date;
export const dayLabel=(d:string)=>d?new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short"}):"—";
export const monthLabel=(d:string)=>d?new Date(d+"T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"numeric"}):"—";
export const stamp=(v:string)=>v?new Date(v).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";

export const liveStatus=(t:{status:string;due:string}):WorkStatus=>
  t.status==="Completed"||t.status==="Cancelled"?t.status as WorkStatus
  :t.due&&t.due<today()?"Overdue":t.status as WorkStatus;
export const statusTone=(s:string)=>s==="Completed"||s==="Resolved"?"green":s==="Overdue"?"red"
  :s==="In Progress"||s==="Followed Up"?"blue":s==="On Hold"||s==="Open"?"amber":s==="Cancelled"?"violet":"";
/* Finished on time, finished late, or still running past its date. */
export const timeliness=(t:{status:string;due:string;completedAt:string})=>
  t.status==="Completed"?(t.completedAt&&t.completedAt>t.due?"Late":"On time")
  :t.status==="Cancelled"?"Cancelled":t.due&&t.due<today()?"Delayed":"On track";
export const timelinessTone=(v:string)=>v==="On time"?"green":v==="Late"?"amber":v==="Delayed"?"red":"";
export const readable=(hex:string)=>{const h=(hex||"#0b725d").replace("#","");
  const n=h.length===3?h.split("").map(c=>c+c).join(""):h;
  const r=parseInt(n.slice(0,2),16)||0,g=parseInt(n.slice(2,4),16)||0,b=parseInt(n.slice(4,6),16)||0;
  return (r*299+g*587+b*114)/1000>150?"#17312b":"#ffffff"};
export const initials=(name:string)=>name.split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase();
/* Photo URLs carry the update stamp, so an immutable cache header is safe and a new
   photo busts the cache without any purge. */
export const photoUrl=(e:{id:string;photoAt:string})=>
  e.photoAt?`/api/workforce/photo?employeeId=${encodeURIComponent(e.id)}&v=${encodeURIComponent(e.photoAt)}`:"";

export const csv=(rows:(string|number)[][],name:string)=>{
  const body=rows.map(r=>r.map(c=>{const v=String(c??"");return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}).join(",")).join("\n");
  const url=URL.createObjectURL(new Blob([body],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)};

/* Resize in the browser before upload. A 4 MB phone photo becomes roughly 20 KB,
   which is what keeps 10,000 employee photos inside D1's storage budget. */
export const resizeImage=(file:File,max=256):Promise<string>=>new Promise((resolve,reject)=>{
  if(!file.type.startsWith("image/"))return reject(new Error("That file is not an image"));
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error("Could not read the file"));
  reader.onload=()=>{
    const img=new Image();
    img.onerror=()=>reject(new Error("Could not decode the image"));
    img.onload=()=>{
      const scale=Math.min(max/img.width,max/img.height,1);
      const w=Math.max(Math.round(img.width*scale),1),h=Math.max(Math.round(img.height*scale),1);
      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d");
      if(!ctx)return reject(new Error("Canvas is unavailable in this browser"));
      ctx.drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL("image/jpeg",0.82))};
    img.src=String(reader.result)};
  reader.readAsDataURL(file)});

/* ---------- fetch helpers ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asJson=async<T=any>(res:Response):Promise<T>=>{
  const body=await res.json().catch(()=>({} as Record<string,unknown>)) as Record<string,unknown>;
  if(!res.ok)throw new Error(String(body?.error||`Request failed (${res.status})`));
  return body as T};
const qs=(params:Record<string,string|number|undefined|null>)=>{
  const u=new URLSearchParams();
  for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=="")u.set(k,String(v));
  const s=u.toString();return s?`?${s}`:""};

export type ListParams={q?:string;deptId?:string;roleId?:string;employeeId?:string;frequency?:string;
  status?:string;from?:string;to?:string;active?:string;limit?:number;offset?:number};

type Api={
  employees:(p?:ListParams)=>Promise<{employees:Employee[];total:number}>;
  employee:(id:string)=>Promise<Employee>;
  dossier:(id:string)=>Promise<Dossier>;
  summary:()=>Promise<Summary>;
  tasks:(p?:ListParams)=>Promise<{tasks:Task[];total:number}>;
  tokens:(p?:ListParams)=>Promise<{tokens:Token[];total:number}>;
  queries:(p?:ListParams)=>Promise<{queries:Query[];total:number}>;
  saveEmployee:(e:Partial<Employee>,isNew:boolean)=>Promise<Employee>;
  removeEmployee:(id:string)=>Promise<{deleted?:boolean;deactivated?:boolean}>;
  saveRole:(r:Partial<Role>,isNew:boolean)=>Promise<Role>;
  removeRole:(id:string)=>Promise<unknown>;
  saveDept:(d:Partial<Dept>,isNew:boolean)=>Promise<Dept>;
  removeDept:(id:string)=>Promise<unknown>;
  saveTask:(t:Partial<Task>,isNew:boolean)=>Promise<Task>;
  removeTask:(id:string)=>Promise<unknown>;
  bulkTasks:(tasks:Partial<Task>[])=>Promise<unknown>;
  saveToken:(t:Partial<Token>,isNew:boolean)=>Promise<Token>;
  removeToken:(id:string)=>Promise<unknown>;
  saveQuery:(q:Partial<Query>,isNew:boolean)=>Promise<Query>;
  queryAction:(id:string,action:"follow-up"|"resolve"|"reopen",resolution?:string)=>Promise<Query>;
  removeQuery:(id:string)=>Promise<unknown>;
  uploadPhoto:(employeeId:string,dataUrl:string)=>Promise<{photoAt:string}>;
  removePhoto:(employeeId:string)=>Promise<unknown>;
  observations:(p?:ListParams&{taggedTo?:string})=>Promise<{observations:Observation[];total:number}>;
  observation:(id:string)=>Promise<{observation:Observation;replies:ObsReply[]}>;
  saveObservation:(o:Partial<Omit<Observation,"tags">>&{tags?:string[];action?:string},isNew:boolean)=>Promise<Observation>;
  removeObservation:(id:string)=>Promise<unknown>;
  addReply:(observationId:string,text:string,employeeId?:string)=>Promise<ObsReply>;
  seed:(force?:boolean)=>Promise<unknown>};

type Ctx={ready:boolean;loading:boolean;error:string;
  departments:Dept[];allRoles:Role[];roles:Role[];headcount:number;
  dept:string;setDept:(id:string)=>void;deptById:(id:string)=>Dept|undefined;
  actor:string;version:number;refresh:()=>void;roleById:(id:string)=>Role|undefined;api:Api};

const WfContext=createContext<Ctx|null>(null);
export const useWorkforce=()=>{const c=useContext(WfContext);
  if(!c)throw new Error("useWorkforce must be used inside <WorkforceProvider>");return c};

const BASE="/api/workforce";

export function WorkforceProvider({actor,children}:{actor:string;children:React.ReactNode}){
  const [departments,setDepartments]=useState<Dept[]>([]);
  const [allRoles,setAllRoles]=useState<Role[]>([]);
  const [headcount,setHeadcount]=useState(0);
  const [dept,setDept]=useState("");
  const [ready,setReady]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [version,setVersion]=useState(0);
  const who=useRef(actor);
  who.current=actor;

  const refresh=useCallback(()=>setVersion(v=>v+1),[]);

  /* Bootstrap pulls only departments, roles and a headcount. Tasks, tokens, queries
     and photos are never part of page load; they are fetched per screen. */
  useEffect(()=>{
    let dead=false;
    (async()=>{
      setLoading(true);setError("");
      try{
        const data=await asJson<{departments?:Dept[];roles?:Role[];headcount?:number;ready?:boolean}>(await fetch(BASE));
        if(dead)return;
        setDepartments(data.departments||[]);
        setAllRoles(data.roles||[]);
        setHeadcount(data.headcount||0);
        setReady(!!data.ready);
        setDept(d=>d&&(data.departments||[]).some((x:Dept)=>x.id===d)?d:(data.departments?.[0]?.id||""));
      }catch(e){if(!dead)setError(e instanceof Error?e.message:"Could not load the workforce structure")}
      finally{if(!dead)setLoading(false)}})();
    return()=>{dead=true}},[version]);

  const send=useCallback(async(path:string,method:string,body?:unknown)=>{
    const res=await fetch(`${BASE}${path}`,{method,headers:{"content-type":"application/json"},
      body:JSON.stringify({...(body as object),actor:who.current})});
    const out=await asJson(res);
    setVersion(v=>v+1);
    return out},[]);

  const drop=useCallback(async(path:string,params:Record<string,string>)=>{
    const body=await asJson(await fetch(`${BASE}${path}${qs(params)}`,{method:"DELETE"}));
    setVersion(v=>v+1);return body},[]);

  const api=useMemo<Api>(()=>({
    employees:async p=>await asJson(await fetch(`${BASE}/employees${qs({limit:50,...p})}`)),
    employee:async id=>(await asJson(await fetch(`${BASE}/employees${qs({id})}`))).employee,
    dossier:async id=>await asJson(await fetch(`${BASE}/dossier${qs({employeeId:id})}`)),
    summary:async()=>await asJson(await fetch(`${BASE}/summary`)),
    tasks:async p=>await asJson(await fetch(`${BASE}/tasks${qs({limit:50,...p})}`)),
    tokens:async p=>await asJson(await fetch(`${BASE}/tokens${qs({limit:50,...p})}`)),
    queries:async p=>await asJson(await fetch(`${BASE}/queries${qs({limit:50,...p})}`)),
    saveEmployee:async(e,isNew)=>(await send("/employees",isNew?"POST":"PATCH",e)).employee,
    removeEmployee:async id=>await drop("/employees",{id}),
    saveRole:async(r,isNew)=>(await send("/roles",isNew?"POST":"PATCH",r)).role,
    removeRole:async id=>await drop("/roles",{id}),
    saveDept:async(d,isNew)=>(await send("/departments",isNew?"POST":"PATCH",d)).department,
    removeDept:async id=>await drop("/departments",{id}),
    saveTask:async(t,isNew)=>(await send("/tasks",isNew?"POST":"PATCH",t)).task,
    removeTask:async id=>await drop("/tasks",{id}),
    bulkTasks:async tasks=>await send("/tasks","PUT",{tasks}),
    saveToken:async(t,isNew)=>(await send("/tokens",isNew?"POST":"PATCH",t)).token,
    removeToken:async id=>await drop("/tokens",{id}),
    saveQuery:async(q,isNew)=>(await send("/queries",isNew?"POST":"PATCH",q)).query,
    queryAction:async(id,action,resolution)=>(await send("/queries","PATCH",{id,action,resolution})).query,
    removeQuery:async id=>await drop("/queries",{id}),
    uploadPhoto:async(employeeId,dataUrl)=>await send("/photo","PUT",{employeeId,dataUrl}),
    removePhoto:async employeeId=>await drop("/photo",{employeeId}),
    observations:async p=>await asJson(await fetch(`${BASE}/observations${qs({limit:25,...p})}`)),
    observation:async id=>await asJson(await fetch(`${BASE}/observations${qs({id})}`)),
    saveObservation:async(o,isNew)=>(await send("/observations",isNew?"POST":"PATCH",o)).observation,
    removeObservation:async id=>await drop("/observations",{id}),
    addReply:async(observationId,text,employeeId)=>(await send("/observations/replies","POST",
      {observationId,text,employeeId,authorName:who.current})).reply,
    seed:async force=>{const body=await asJson(await fetch(`${BASE}/seed${force?"?force=1":""}`,{method:"POST"}));
      setVersion(v=>v+1);return body}}),[send,drop]);

  const roles=useMemo(()=>dept?allRoles.filter(r=>r.deptId===dept):allRoles,[allRoles,dept]);
  const roleIndex=useMemo(()=>new Map(allRoles.map(r=>[r.id,r])),[allRoles]);
  const deptIndex=useMemo(()=>new Map(departments.map(d=>[d.id,d])),[departments]);

  const value:Ctx={ready,loading,error,departments,allRoles,roles,headcount,dept,setDept,
    deptById:id=>deptIndex.get(id),actor:actor||"system",version,refresh,
    roleById:id=>roleIndex.get(id),api};

  return <WfContext.Provider value={value}>{children}</WfContext.Provider>}

/* Shared fetch-on-mount helper so every screen has the same loading and error shape. */
export function useAsync<T>(fn:()=>Promise<T>,deps:unknown[],enabled=true){
  const [data,setData]=useState<T|null>(null);
  const [loading,setLoading]=useState(enabled);
  const [error,setError]=useState("");
  const run=useRef(fn);run.current=fn;
  useEffect(()=>{
    if(!enabled){setLoading(false);return}
    let dead=false;setLoading(true);setError("");
    run.current().then(d=>{if(!dead)setData(d)})
      .catch(e=>{if(!dead)setError(e instanceof Error?e.message:"Request failed")})
      .finally(()=>{if(!dead)setLoading(false)});
    return()=>{dead=true};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[...deps,enabled]);
  return{data,loading,error}}

/* ---------- recurring occurrences ---------- */
const nextDue=(f:Frequency,due:string)=>f==="Daily"?shift(due,1):f==="Weekly"?shift(due,7):addMonth(due);
/* Given the latest task in each series, returns the occurrences still missing. The
   server inserts them in one batch; the cap stops a long-dormant series from
   generating hundreds of rows in a single call. */
export function pendingOccurrences(latest:Task[],cap=12):Task[]{
  const out:Task[]=[];
  const now=today();
  for(const task of latest){
    if(task.frequency==="One Time"||task.status==="Cancelled")continue;
    let cursor=task;let guard=0;
    while(cursor.due<now&&guard<cap){
      const due=nextDue(cursor.frequency,cursor.due);
      const next:Task={...cursor,
        id:`T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,
        due,start:due,period:periodOf(cursor.frequency,due),status:"Not Started",progress:0,done:0,
        blocker:"",nextAction:"",remarks:"",completedAt:""};
      out.push(next);cursor=next;guard++}}
  return out}

export const normalise=(t:Task):Task=>{
  const next={...t};
  if(next.status==="Completed"){next.progress=100;if(!next.completedAt)next.completedAt=today();if(next.qty)next.done=next.qty}
  else{next.completedAt="";if(next.progress===100)next.progress=75}
  return next};
