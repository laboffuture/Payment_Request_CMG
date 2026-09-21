"use client";
import{Check,Download,KeyRound,Plus,Power,Search,SlidersHorizontal,Trash2,UserRound,X}from"lucide-react";
import{useCallback,useEffect,useState}from"react";

/* Walks the register's pages. It returns at most 200 rows at a time, and there are
   more people than that, so a single request would leave logins showing no name. */
async function loadEveryEmployee(){
  const out:Person[]=[];
  for(let offset=0;offset<5000;offset+=200){
    const r=await fetch(`/api/workforce/employees?active=1&limit=200&offset=${offset}`);
    const d=await r.json() as{employees?:Person[]};
    const got=d.employees||[];
    out.push(...got);
    if(got.length<200)break;
  }
  return{employees:out}}
import{accountsApi,type Account}from"./audit-api";
import{csv}from"./workforce-store";

/* Real logins, from wf_users through /api/auth/users.

   This screen used to keep a list in localStorage with a clear-text password on each
   row. It looked like user administration and created no login at all, which is the
   most dangerous kind of screen to leave in a menu.

   Two rules come from the server and are surfaced here rather than hidden:
   a login can only be created for somebody already on an organisation chart, and the
   first password is generated, shown once, and must be changed at first sign-in. */

const allRoles=["Requestor","Department Head","Accountant","Auditor","Finance","Management","Audit Head","Administrator"];

type Person={id:string;name:string;code:string;department:string;email:string};

export default function AccessSetup(){
 const[users,setUsers]=useState<Account[]>([]),[people,setPeople]=useState<Person[]>([]);
 const[show,setShow]=useState(false),[tab,setTab]=useState<"users"|"matrix">("users");
 const[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const[issued,setIssued]=useState<{email:string;password:string}|null>(null);
 const[me,setMe]=useState("");
 /* There was no way to change a login once it existed - only reset, disable and delete -
    so roles and the requestors a department head may read could never be set on the
    accounts already in use. This holds the account being edited. */
 const[editing,setEditing]=useState<Account|null>(null);

 /* Every account, not the visible tab: the other tab lists roles rather than people, and
    a report that quietly followed the tab would be read as the whole register. The values
    are the ones the table shows - the person with their department, "Never" for an account
    that has not signed in - so the file and the screen cannot disagree. Blank, not the "—"
    the table draws: that is a placeholder for the eye, not a value for a spreadsheet. */
 const download=()=>csv([
   ["Name","Email","Roles","Person","Department","Employee ID","Last sign-in","Status",
    "Must change password"],
   ...users.map(u=>{
     const person=people.find(p=>p.id===u.employeeId);
     return [u.name,u.email,u.roles.join(", "),person?.name||"",person?.department||"",
       u.employeeId||"",
       u.lastLoginAt?new Date(u.lastLoginAt).toLocaleDateString("en-GB",
         {day:"2-digit",month:"short",year:"numeric"}):"Never",
       u.active?"Active":"Disabled",u.mustChange?"Yes":"No"]})],
   `user-access-${new Date().toISOString().slice(0,10)}.csv`);
 useEffect(()=>{fetch("/api/auth/session").then(r=>r.json() as Promise<{actor?:{email:string}|null}>)
   .then(d=>setMe(d.actor?.email||"")).catch(()=>{})},[]);

 const load=useCallback(async()=>{
   setLoading(true);setError("");
   try{
     const[u,p]=await Promise.all([
       accountsApi.load(),
       loadEveryEmployee()]);
     setUsers(u.users);setPeople(p.employees||[])}
   catch(e){setError(e instanceof Error?e.message:"Could not load accounts")}
   finally{setLoading(false)}},[]);
 useEffect(()=>{load()},[load]);

 /* Reports whether the change went through. It used to swallow the failure into a banner
   and return nothing, so a caller could not tell a refused save from a saved one - and the
   edit drawer closed either way, which reads as "saved" when it was not. */
 const act=async(body:Record<string,unknown>,after?:(r:Record<string,unknown>)=>void)=>{
   setBusy(true);setError("");
   try{const r=await accountsApi.update(body) as Record<string,unknown>;after?.(r);await load();return true}
   catch(e){setError(e instanceof Error?e.message:"That change was refused");return false}
   finally{setBusy(false)}};

 /* Deleting a login is separate from disabling one: disable suspends somebody you may
    want back, delete is for a login raised by mistake or a person who has left. The
    person stays on the organisation chart either way. */
 const removeUser=async(u:Account)=>{
   if(!confirm(`Delete the login for ${u.email}?\n\nThey are signed out immediately and `+
     `cannot sign in again. Their employee record and history are kept.\n\nThis cannot be undone.`))return;
   setBusy(true);setError("");
   try{await accountsApi.remove(u.id);await load()}
   catch(e){setError(e instanceof Error?e.message:"That login could not be deleted")}
   finally{setBusy(false)}};

 const create=async(row:{name:string;email:string;employeeId:string;roles:string[]})=>{
   setBusy(true);setError("");
   try{
     const r=await accountsApi.create(row);
     setIssued({email:r.email,password:r.temporaryPassword});   // shown once, then gone
     setShow(false);await load()}
   catch(e){setError(e instanceof Error?e.message:"Could not create the login")}
   finally{setBusy(false)}};

 const withLogin=new Set(users.map(u=>u.employeeId).filter(Boolean));

 return <div className="page access-page">
  <div className="access-head"><div><small>ACCESS CONTROL</small><h2>Users and role configuration</h2>
    <p>Create a login for somebody on an organisation chart and assign their roles. The first
     password is generated and must be changed at first sign-in.</p></div>
   <div className="access-head-actions">
    <button className="wf-small" onClick={download} disabled={!users.length}
      title={users.length?`Download all ${users.length} accounts as a spreadsheet`
        :"There are no accounts to download"}><Download/>Download report</button>
    <button className="primary" disabled={busy||loading} onClick={()=>setShow(true)}><Plus/>Add user</button></div></div>

  {error&&<div className="panel company-empty">{error}</div>}
  {issued&&<div className="panel company-empty"><b>Login created for {issued.email}</b>
    <p>Temporary password: <code>{issued.password}</code> — copy it now, it is not shown again.
     They must change it at first sign-in.</p>
    <button onClick={()=>setIssued(null)}>Done</button></div>}

  <div className="access-tabs">
   <button className={tab==="users"?"active":""} onClick={()=>setTab("users")}>Users &amp; assignments</button>
   <button className={tab==="matrix"?"active":""} onClick={()=>setTab("matrix")}>Role permission matrix</button></div>

  {tab==="users"?(loading?<div className="panel company-empty">Loading accounts…</div>:
   <section className="panel user-table"><table><thead><tr>
     <th>USER</th><th>ROLES</th><th>PERSON</th><th>LAST SIGN-IN</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>{users.map(u=>{
      const person=people.find(p=>p.id===u.employeeId);
      return <tr key={u.id}>
       <td><div className="user-cell"><i><UserRound/></i><span><b>{u.name}</b><small>{u.email}</small></span></div></td>
       <td>{u.roles.join(", ")||"—"}</td>
       <td>{person?`${person.name}${person.department?` · ${person.department}`:""}`:u.employeeId||"—"}</td>
       <td>{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"Never"}</td>
       <td><span className={u.active?"badge green":"badge red"}>{u.active?"Active":"Disabled"}</span>
        {u.mustChange&&<small> must change password</small>}</td>
       <td><button disabled={busy} title="Change roles, and who this person may see"
         onClick={()=>setEditing(u)}><SlidersHorizontal/>Edit</button>
       <button disabled={busy} title="Issue a new temporary password"
          onClick={()=>{if(confirm(`Reset the password for ${u.email}? Their sessions end immediately.`))
            act({id:u.id,action:"reset"},r=>setIssued({email:String(r.email),password:String(r.temporaryPassword)}))}}>
          <KeyRound/>Reset</button>
        {u.email===me?<span className="you-marker" title="You cannot disable the account you are signed in with">
           <Power/>This is you</span>
         :<button disabled={busy} title={u.active?"Disable this login":"Enable this login"}
           onClick={()=>{if(!u.active||confirm(`Disable ${u.email}? They are signed out immediately `+
             `and cannot sign in again until re-enabled.`))
             act({id:u.id,action:u.active?"deactivate":"activate"})}}>
           <Power/>{u.active?"Disable":"Enable"}</button>}
        {u.email!==me&&<button className="delete" disabled={busy} title="Delete this login permanently"
           onClick={()=>removeUser(u)}><Trash2/>Delete</button>}</td></tr>})}
     {!users.length&&<tr><td colSpan={6}>No logins yet. Use Add user to create the first one.</td></tr>}
    </tbody></table></section>):<RoleMatrix/>}

  {show&&<Editor taken={withLogin} busy={busy} close={()=>setShow(false)} saveUser={create}/>}
 {editing&&<RoleEditor account={editing} everyone={users} busy={busy}
   close={()=>setEditing(null)}
   save={async(roles,visibleRaisers)=>{
     /* Two writes because the API takes one change at a time. Roles first, and the list
        only if that succeeded - assigning requestors to somebody whose Department Head
        role was just refused would store a list that grants nothing.

        The drawer stays open if either is refused, so the error is read beside the work
        rather than after it has vanished. */
     if(!await act({id:editing.id,roles}))return;
     if(visibleRaisers&&!await act({id:editing.id,visibleRaisers}))return;
     setEditing(null)}}/>}
 </div>}

/* Creating a login. The person is chosen from the register rather than typed, because
   the server refuses an account that is not attached to an employee record. */
function Editor({taken,busy,close,saveUser}:{taken:Set<string>;busy:boolean;close:()=>void;
  saveUser:(u:{name:string;email:string;employeeId:string;roles:string[]})=>void}){
 const[employeeId,setEmployeeId]=useState(""),[email,setEmail]=useState(""),[roles,setRoles]=useState<string[]>([]);
 /* There are more people on the chart than one dropdown can hold, and the register
    caps a page at 200, so the whole list can no longer be handed to this screen. The
    search runs on the server - name, employee code or department - so it reaches
    everybody however many there are. */
 const[term,setTerm]=useState(""),[found,setFound]=useState<Person[]>([]);
 const[person,setPerson]=useState<Person|null>(null);
 const[looking,setLooking]=useState(false);
 useEffect(()=>{
  const q=term.trim();
  if(q.length<2){setFound([]);return}
  let live=true;setLooking(true);
  const t=setTimeout(()=>{          // one request per pause, not per keystroke
    fetch(`/api/workforce/employees?active=1&limit=25&q=${encodeURIComponent(q)}`)
      .then(r=>r.json() as Promise<{employees?:Person[]}>)
      .then(d=>{if(live){setFound((d.employees||[]).filter(x=>!taken.has(x.id)));setLooking(false)}})
      .catch(()=>{if(live)setLooking(false)});
  },250);
  return()=>{live=false;clearTimeout(t)};
 },[term,taken]);
 const toggle=(v:string)=>setRoles(r=>r.includes(v)?r.filter(x=>x!==v):[...r,v]);
 const pick=(p:Person)=>{setEmployeeId(p.id);setPerson(p);setTerm("");setFound([]);
   if(p.email&&!email)setEmail(p.email)};     // prefill from the employee record
 const ready=!!employeeId&&/.+@.+\..+/.test(email)&&roles.length>0;
 return <><button className="overlay" onClick={close}/>
  <aside className="access-editor">
   <header><div><small>USER ACCESS</small><h2>{person?.name||"Add new user"}</h2></div>
    <button onClick={close}><X/></button></header>
   <div>
       <label>Person on the organisation chart
        {person
          ?<span className="access-picked"><b>{person.name}</b>
             <small>{[person.department,person.code].filter(Boolean).join(" · ")}</small>
             <button type="button" onClick={()=>{setPerson(null);setEmployeeId("")}}>Change</button></span>
          :<input value={term} onChange={e=>setTerm(e.target.value)}
             placeholder="Search by name, employee code or department"/>}
        {!person&&!!found.length&&<div className="wf-picker">{found.map(p=>
          <button type="button" key={p.id} onClick={()=>pick(p)}>
            <b>{p.name}</b><small>{[p.department,p.code].filter(Boolean).join(" · ")}</small></button>)}</div>}
       </label>
       {!person&&term.trim().length>=2&&!found.length&&!looking&&
         <p className="queue-empty">Nobody without a login matches that. They may already have one, or
           need adding under Employees first.</p>}
       {!person&&term.trim().length<2&&
         <p className="queue-empty">Type two letters or more to search everybody on the chart.</p>}
    <label>Work email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}
      placeholder="name@company.com"/></label>
    <p className="queue-empty">A temporary password is generated when you save, shown once, and
     must be changed at first sign-in.</p>
    <Group title="Assign roles" values={allRoles} selected={roles} toggle={toggle}/>
   </div>
   <footer><button onClick={close}>Cancel</button>
    <button className="primary" disabled={!ready||busy}
      onClick={()=>saveUser({name:person?.name||"",email:email.trim().toLowerCase(),employeeId,roles})}>
      {busy?"Creating…":"Create login"}</button></footer></aside></>}

/* Changing an existing login: its roles, and for a department head the requestors he may
   read. The list is people, not a rule - the department on a request and the department of
   whoever raised it disagree across the register, so an administrator picks the names.

   Only shown when Department Head is among the roles, because it means nothing otherwise,
   and it appears the moment that role is ticked rather than after saving. */
function RoleEditor({account,everyone,busy,close,save}:{account:Account;everyone:Account[];
  busy:boolean;close:()=>void;save:(roles:string[],visibleRaisers?:string[])=>void}){
  const[roles,setRoles]=useState<string[]>(account.roles||[]);
  /* Guarded rather than trusted. The type says string[], but this arrives as JSON from
     the API and TypeScript cannot check across that boundary - when it came back as the
     string "[]" the spread below turned it into its own characters. Anything that is not
     an array starts empty. */
  const[picked,setPicked]=useState<string[]>(
    Array.isArray(account.visibleRaisers)?account.visibleRaisers:[]);
  const[term,setTerm]=useState("");
  const toggleRole=(v:string)=>setRoles(r=>r.includes(v)?r.filter(x=>x!==v):[...r,v]);
  const toggleRaiser=(e:string)=>setPicked(p=>p.includes(e)?p.filter(x=>x!==e):[...p,e]);
  const head=roles.includes("Department Head");
  /* Anybody with a login except this account: a head cannot be assigned to himself, and
     his own requests are always visible to him anyway. */
  const candidates=everyone.filter(u=>u.email!==account.email&&u.active);
  const q=term.trim().toLowerCase();
  const shown=q?candidates.filter(u=>`${u.name} ${u.email}`.toLowerCase().includes(q)):candidates;
  return <><button className="overlay" onClick={close}/>
   <aside className="access-editor">
    <header><div><small>USER ACCESS</small><h2>{account.name}</h2></div>
     <button onClick={close}><X/></button></header>
    <div>
     <p className="queue-empty">{account.email}</p>
     <Group title="Assign roles" values={allRoles} selected={roles} toggle={toggleRole}/>
     {head&&<fieldset><legend>Requests this head may see</legend>
       <p className="queue-empty">Pick the requestors. With nobody picked he sees only the
         requests he raised himself.</p>
       <label className="recv-search"><Search/>
         <input value={term} onChange={e=>setTerm(e.target.value)}
           placeholder="Search name or email"/></label>
       <div className="access-raisers">{shown.map(u=>
         <button type="button" key={u.id} className={picked.includes(u.email)?"selected":""}
           onClick={()=>toggleRaiser(u.email)}>
           {/* The tick keeps its place whether or not it is drawn. Rendered only when
               selected, it pushed the name sideways on every row that was picked, so the
               left edge of the list moved as it was used. */}
           <i className="raiser-tick">{picked.includes(u.email)&&<Check/>}</i>
           <span><b>{u.name}</b><small>{u.email}</small></span>
           {/* Said plainly rather than hidden: most logins have never raised a request, and
               assigning one of them is what makes a head's register look broken. */}
           <i className={u.requestCount?"raiser-count has":"raiser-count"}>
             {u.requestCount?`${u.requestCount} request${u.requestCount===1?"":"s"}`:"none yet"}</i>
           </button>)}
         {!shown.length&&<p className="queue-empty">Nobody matches that.</p>}</div>
       <p className="queue-empty">{picked.length
         ?`${picked.length} requestor${picked.length===1?"":"s"} selected`
         :"Nobody selected yet"}</p></fieldset>}
    </div>
    <footer><button onClick={close}>Cancel</button>
     <button className="primary" disabled={busy||!roles.length}
       onClick={()=>save(roles,head?picked:[])}>{busy?"Saving…":"Save changes"}</button></footer>
   </aside></>}

function Group({title,values,selected,toggle}:{title:string;values:string[];selected:string[];toggle:(v:string)=>void}){return <fieldset><legend>{title}</legend><div>{values.map(v=><button type="button" className={selected.includes(v)?"selected":""} onClick={()=>toggle(v)} key={v}>{selected.includes(v)&&<Check/>}{v}</button>)}</div></fieldset>}
function RoleMatrix(){const rows=[["Payment Requestor","Create own requests","Own requests only","No"],["Department Head","Create own requests; no workflow actions","Every request raised by his own department, and his own","Read only"],["Accountant","Accept, verify, reconcile, send to Audit","All payments; work mapped departments","Yes"],["Management","Approve and view exceptions","All companies mapped","Yes"],["Finance","Release approved payments — the final step","All approved payments","Yes"],["Audit Head","Configure programs, users and reports","All audit data","Yes"],["Administrator","Act at any workflow stage; manage logins, roles and passwords","Everything, all companies","Yes"]];return <section className="panel user-table matrix"><table><thead><tr><th>ROLE</th><th>CAN ACT</th><th>VISIBILITY</th><th>DEPARTMENT CONTROL</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table></section>}
