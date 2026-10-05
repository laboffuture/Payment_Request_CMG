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
import{MATERIAL_ROLE_NAMES,PAYMENT_ROLES,type MaterialScope}from"../lib/roles";
import{csv}from"./workforce-store";
import{Pager}from"./WorkforceShared";

/* Real logins, from wf_users through /api/auth/users.

   This screen used to keep a list in localStorage with a clear-text password on each
   row. It looked like user administration and created no login at all, which is the
   most dangerous kind of screen to leave in a menu.

   Two rules come from the server and are surfaced here rather than hidden:
   a person on an organisation chart has at most one login, and the first password is
   generated, shown once, and must be changed at first sign-in.

   One login per person for the whole application: payment roles and Material Management
   roles are ticked on the same account, and someone with both switches between them in
   the header. Vendors and site staff who are not on the chart get a login too. */

const allRoles=[...PAYMENT_ROLES];
const materialRoles=[...MATERIAL_ROLE_NAMES];
const NO_SCOPE:MaterialScope={projectIds:[],vendorId:""};

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
 /* The table pages; three other things must not. Assigning a requestor, guarding against
    a second login for the same person, and the report all need every account, so the
    roster is fetched once at the server's maximum and kept beside the page being shown.
    With sixty-two logins against a default page of fifty, twelve were already invisible
    here - including to the requestor picker, which could not offer them at all. */
 const[roster,setRoster]=useState<Account[]>([]);
 const[term,setTerm]=useState(""),[offset,setOffset]=useState(0),[total,setTotal]=useState(0);
 const PER_PAGE=25;

 /* Every account, not the visible tab: the other tab lists roles rather than people, and
    a report that quietly followed the tab would be read as the whole register. The values
    are the ones the table shows - the person with their department, "Never" for an account
    that has not signed in - so the file and the screen cannot disagree. Blank, not the "—"
    the table draws: that is a placeholder for the eye, not a value for a spreadsheet. */
 const download=()=>csv([
   ["Name","Email","Roles","Person","Department","Employee ID","Last sign-in","Status",
    "Must change password"],
   ...roster.map(u=>{
     const person=people.find(p=>p.id===u.employeeId);
     return [u.name,u.email,u.roles.join(", "),person?.name||"",person?.department||"",
       u.employeeId||"",
       u.lastLoginAt?new Date(u.lastLoginAt).toLocaleDateString("en-GB",
         {day:"2-digit",month:"short",year:"numeric"}):"Never",
       u.active?"Active":"Disabled",u.mustChange?"Yes":"No"]})],
   `user-access-${new Date().toISOString().slice(0,10)}.csv`);
 useEffect(()=>{fetch("/api/auth/session").then(r=>r.json() as Promise<{actor?:{email:string}|null}>)
   .then(d=>setMe(d.actor?.email||"")).catch(()=>{})},[]);

 /* Two requests: the page being read, and the whole roster the rest of the screen needs.
    The search and the page number reach the server rather than filtering what happens to
    have been downloaded, so a name on page three is found from page one. */
 const load=useCallback(async()=>{
   setLoading(true);setError("");
   try{
     const[u,all,p]=await Promise.all([
       accountsApi.load({q:term.trim(),limit:PER_PAGE,offset}),
       accountsApi.load({limit:200}),
       loadEveryEmployee()]);
     setUsers(u.users);setTotal(u.total??u.users.length);
     setRoster(all.users);setPeople(p.employees||[])}
   catch(e){setError(e instanceof Error?e.message:"Could not load accounts")}
   finally{setLoading(false)}},[term,offset]);
 /* One request per pause rather than per keystroke, and typing returns to the first page:
    staying on page three of a two-page result would look like nothing matched. */
 useEffect(()=>{const t=setTimeout(()=>{load()},250);return()=>clearTimeout(t)},[load]);

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

 const create=async(row:{name:string;email:string;employeeId:string;roles:string[];material:MaterialScope})=>{
   setBusy(true);setError("");
   try{
     const r=await accountsApi.create(row);
     setIssued({email:r.email,password:r.temporaryPassword});   // shown once, then gone
     setShow(false);await load()}
   catch(e){setError(e instanceof Error?e.message:"Could not create the login")}
   finally{setBusy(false)}};

 /* From the roster, not the page. Taken from the page it would have offered people who
    already hold a login simply because they were listed further down. */
 const withLogin=new Set(roster.map(u=>u.employeeId).filter(Boolean));

 return <div className="page access-page">
  <div className="access-head"><div><small>ACCESS CONTROL</small><h2>Users and role configuration</h2>
    <p>One login per person for payments and Material Management. Assign their roles; the first
     password is generated and must be changed at first sign-in.</p></div>
   <div className="access-head-actions">
    <button className="wf-small" onClick={download} disabled={!roster.length}
      title={roster.length?`Download all ${roster.length} accounts as a spreadsheet`
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

  {tab==="users"&&<div className="access-tools">
    <label className="recv-search"><Search/>
      {/* Searched on the server, so a name on the last page is found from the first.
          Typing returns to page one: staying on page three of a shorter result would
          look like nothing matched. */}
      <input value={term} onChange={e=>{setTerm(e.target.value);setOffset(0)}}
        placeholder="Search name or email"/>
      {term&&<button type="button" onClick={()=>{setTerm("");setOffset(0)}} aria-label="Clear search"><X/></button>}</label>
    <span className="access-count">{term.trim()
      ?`${total} match${total===1?"":"es"}`
      :`${total} login${total===1?"":"s"}`}</span></div>}

  {tab==="users"?(loading?<div className="panel company-empty">Loading accounts…</div>:
   <section className="panel user-table"><table><thead><tr>
     <th>USER</th><th>ROLES</th><th>PERSON</th><th>LAST SIGN-IN</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>{users.map(u=>{
      const person=people.find(p=>p.id===u.employeeId);
      return <tr key={u.id}>
       <td><div className="user-cell"><i><UserRound/></i><span><b>{u.name}</b><small>{u.email}</small></span></div></td>
       <td>{u.roles.join(", ")||"—"}</td>
       <td>{person?`${person.name}${person.department?` · ${person.department}`:""}`:u.employeeId||"Not on the chart"}</td>
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
     {!users.length&&<tr><td colSpan={6}>{term.trim()
      ?`No login matches “${term.trim()}”.`
      :"No logins yet. Use Add user to create the first one."}</td></tr>}
    </tbody></table>
   {/* Paged on the server against the total it reports, so the count is the whole
       register and not merely what was downloaded. Hides itself when everything fits. */}
   <Pager total={total} limit={PER_PAGE} offset={offset} setOffset={setOffset}/>
   </section>):<RoleMatrix/>}

  {show&&<Editor taken={withLogin} busy={busy} close={()=>setShow(false)} saveUser={create}/>}
 {editing&&<RoleEditor account={editing} everyone={roster} busy={busy}
   close={()=>setEditing(null)}
   save={async(roles,visibleRaisers,material)=>{
     /* Two writes because the API takes one change at a time. Roles first, and the list
        only if that succeeded - assigning requestors to somebody whose Department Head
        role was just refused would store a list that grants nothing.

        The drawer stays open if either is refused, so the error is read beside the work
        rather than after it has vanished. */
     if(!await act({id:editing.id,roles,material}))return;
     if(visibleRaisers&&!await act({id:editing.id,visibleRaisers}))return;
     setEditing(null)}}/>}
 </div>}

/* Creating a login. Staff are chosen from the register, so the login and the person are
   tied together; a vendor or site staff member who is not on the chart is named instead. */
function Editor({taken,busy,close,saveUser}:{taken:Set<string>;busy:boolean;close:()=>void;
  saveUser:(u:{name:string;email:string;employeeId:string;roles:string[];material:MaterialScope})=>void}){
 const[employeeId,setEmployeeId]=useState(""),[email,setEmail]=useState(""),[roles,setRoles]=useState<string[]>([]);
 const[offChart,setOffChart]=useState(false),[plainName,setPlainName]=useState("");
 const[scope,setScope]=useState<MaterialScope>(NO_SCOPE);
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
 const ready=(offChart?plainName.trim().length>1:!!employeeId)&&/.+@.+\..+/.test(email)&&roles.length>0
   &&(!roles.includes("Vendor")||!!scope.vendorId);
 return <><button className="overlay" onClick={close}/>
  <aside className="access-editor">
   <header><div><small>USER ACCESS</small><h2>{(offChart?plainName:person?.name)||"Add new user"}</h2></div>
    <button onClick={close}><X/></button></header>
   <div>
       <label className="access-offchart"><input type="checkbox" checked={offChart}
         onChange={e=>{setOffChart(e.target.checked);setPerson(null);setEmployeeId("")}}/>
         Not on the organisation chart (a vendor, or site staff)</label>
       {offChart?<label>Full name<input value={plainName} onChange={e=>setPlainName(e.target.value)}
         placeholder="Name as it should appear"/></label>:<>
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
         <p className="queue-empty">Type two letters or more to search everybody on the chart.</p>}</>}
    <label>Work email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}
      placeholder="name@company.com"/></label>
    <p className="queue-empty">A temporary password is generated when you save, shown once, and
     must be changed at first sign-in.</p>
    <Group title="Payment roles" values={allRoles} selected={roles} toggle={toggle}/>
    <Group title="Material Management roles" values={materialRoles} selected={roles} toggle={toggle}/>
    <MaterialScopeFields roles={roles} scope={scope} setScope={setScope}/>
   </div>
   <footer><button onClick={close}>Cancel</button>
    <button className="primary" disabled={!ready||busy}
      onClick={()=>saveUser({name:offChart?plainName.trim():person?.name||"",email:email.trim().toLowerCase(),
        employeeId:offChart?"":employeeId,roles,material:scope})}>
      {busy?"Creating…":"Create login"}</button></footer></aside></>}

/* Changing an existing login: its roles, and for a department head the requestors he may
   read. The list is people, not a rule - the department on a request and the department of
   whoever raised it disagree across the register, so an administrator picks the names.

   Only shown when Department Head is among the roles, because it means nothing otherwise,
   and it appears the moment that role is ticked rather than after saving. */
function RoleEditor({account,everyone,busy,close,save}:{account:Account;everyone:Account[];
  busy:boolean;close:()=>void;save:(roles:string[],visibleRaisers:string[]|undefined,material:MaterialScope)=>void}){
  const[roles,setRoles]=useState<string[]>(account.roles||[]);
  const[scope,setScope]=useState<MaterialScope>(account.material||NO_SCOPE);
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
     <Group title="Payment roles" values={allRoles} selected={roles} toggle={toggleRole}/>
     <Group title="Material Management roles" values={materialRoles} selected={roles} toggle={toggleRole}/>
     <MaterialScopeFields roles={roles} scope={scope} setScope={setScope}/>
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
     <button className="primary" disabled={busy||!roles.length||(roles.includes("Vendor")&&!scope.vendorId)}
       onClick={()=>save(roles,head?picked:[],scope)}>{busy?"Saving…":"Save changes"}</button></footer>
   </aside></>}

/* Material scope on the login. A Site Engineer works on chosen projects (none chosen means
   every project); a Vendor login belongs to exactly one supplier, and sees only that
   supplier's enquiries and orders. The lists come from Material Management. */
function MaterialScopeFields({roles,scope,setScope}:{roles:string[];scope:MaterialScope;
  setScope:(s:MaterialScope)=>void}){
  const site=roles.includes("Site Engineer"),vendor=roles.includes("Vendor");
  const[lists,setLists]=useState<{projects:{id:string;code:string;name:string}[];vendors:{id:string;name:string}[]}|null>(null);
  const[failed,setFailed]=useState(false);
  useEffect(()=>{if(!(site||vendor)||lists)return;
    fetch("/material/api/reference",{headers:{"x-cm-role":"ADMIN"}})
      .then(r=>r.ok?r.json():Promise.reject())
      .then((d:any)=>setLists({projects:d.projects||[],vendors:d.vendors||[]}))
      .catch(()=>setFailed(true))},[site,vendor,lists]);
  if(!site&&!vendor)return null;
  if(failed)return <p className="queue-empty">Projects and suppliers could not be loaded from Material Management.</p>;
  if(!lists)return <p className="queue-empty">Loading projects and suppliers…</p>;
  const toggle=(id:string)=>setScope({...scope,projectIds:scope.projectIds.includes(id)
    ?scope.projectIds.filter(x=>x!==id):[...scope.projectIds,id]});
  return <>
   {site&&<fieldset><legend>Site Engineer — projects</legend>
     <p className="queue-empty">{scope.projectIds.length?`${scope.projectIds.length} selected`:"None selected: every project"}</p>
     <div>{lists.projects.map(p=><button type="button" key={p.id}
       className={scope.projectIds.includes(p.id)?"selected":""} onClick={()=>toggle(p.id)}>
       {scope.projectIds.includes(p.id)&&<Check/>}{p.code} · {p.name}</button>)}
     {!lists.projects.length&&<p className="queue-empty">No projects yet. Add them under Material → Projects.</p>}</div></fieldset>}
   {vendor&&<label>Vendor — supplier this login belongs to
     <select value={scope.vendorId} onChange={e=>setScope({...scope,vendorId:e.target.value})}>
       <option value="">— choose the supplier —</option>
       {lists.vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
  </>}

function Group({title,values,selected,toggle}:{title:string;values:string[];selected:string[];toggle:(v:string)=>void}){return <fieldset><legend>{title}</legend><div>{values.map(v=><button type="button" className={selected.includes(v)?"selected":""} onClick={()=>toggle(v)} key={v}>{selected.includes(v)&&<Check/>}{v}</button>)}</div></fieldset>}
function RoleMatrix(){const rows=[["Payment Requestor","Create own requests","Own requests only","No"],["Department Head","Create own requests; no workflow actions","Every request raised by his own department, and his own","Read only"],["Accountant","Accept, verify, reconcile, send to Audit","All payments; work mapped departments","Yes"],["Management","Approve and view exceptions","All companies mapped","Yes"],["Finance","Release approved payments — the final step","All approved payments","Yes"],["Audit Head","Configure programs, users and reports","All audit data","Yes"],["Administrator","Act at any workflow stage; manage logins, roles and passwords; run Material Management","Everything, all companies","Yes"],["Site Engineer","Raise material requests; receive at site","Own projects","—"],["Project Manager","Approve material requests","All projects","—"],["QS","Check requests, split store and PO, validate POs","All projects","—"],["Procurement","Consolidate, enquire, raise POs, verify invoices","All projects","—"],["Procurement Manager","Approve POs, and all procurement work","All projects","—"],["Store","Receive POs (GRN), issue to site","All projects","—"],["Management (Material)","Approve POs above the limit; view everything","All projects","Read only"],["Material Admin","Material masters: vendors, projects, items, settings","Material Management","—"],["Vendor","Quote enquiries, acknowledge POs, upload invoices","Own supplier only","—"]];return <section className="panel user-table matrix"><table><thead><tr><th>ROLE</th><th>CAN ACT</th><th>VISIBILITY</th><th>DEPARTMENT CONTROL</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table></section>}
