"use client";
import{Building2,Plus,Settings2,Trash2,X}from"lucide-react";import{useCallback,useEffect,useState}from"react";
import{companiesApi,type Company}from"./audit-api";

/* Companies are rows in wf_companies, shared by everyone. This screen used to keep
   them in localStorage, so each person saw a different list and nothing survived a
   change of browser. Deleting a company that already carries audit history is refused
   by the server, which deactivates the record instead so the history stays readable. */

export default function CompanySetup(){
 const[rows,setRows]=useState<Company[]>([]),[edit,setEdit]=useState<Company|null>(null);
 const[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);

 const load=useCallback(async()=>{
   setLoading(true);setError("");
   try{setRows(await companiesApi.load())}
   catch(e){setError(e instanceof Error?e.message:"Could not load companies")}
   finally{setLoading(false)}},[]);
 useEffect(()=>{load()},[load]);

 const persist=async(c:Company,isNew:boolean)=>{
   setBusy(true);setError("");
   try{await(isNew?companiesApi.create(c):companiesApi.update(c));setEdit(null);await load()}
   catch(e){setError(e instanceof Error?e.message:"Could not save the company")}
   finally{setBusy(false)}};

 const remove=async(c:Company)=>{
   if(!confirm(`Delete ${c.name}? Where audit history exists the record is deactivated instead.`))return;
   setBusy(true);setError("");
   try{await companiesApi.remove(c.id);await load()}
   catch(e){setError(e instanceof Error?e.message:"Could not delete the company")}
   finally{setBusy(false)}};

 const blank=():Company=>({id:"",name:"",code:"",country:"",currency:"AED",
   reminderDays:2,escalationDays:5,managementEmail:"",active:true,position:rows.length});

 return <div className="page company-page">
  <div className="access-head"><div><small>COMPANY MASTER</small><h2>Companies and controls</h2>
    <p>Add entities and configure currencies, reminders, escalations and management contacts.</p></div>
   <button className="primary" disabled={busy} onClick={()=>setEdit(blank())}><Plus/>Add company</button></div>
  {error&&<div className="panel company-empty">{error} <button onClick={load}>Try again</button></div>}
  {loading?<div className="panel company-empty">Loading companies…</div>:<>
   <section className="company-grid">{rows.map(c=><article className="panel" key={c.id}>
     <div><i><Building2/></i><span><h3>{c.name}</h3><small>{c.code}{c.country?` · ${c.country}`:""}</small></span>
      <em className={c.active?"badge green":"badge"}>{c.active?"Active":"Inactive"}</em></div>
     <dl><div><dt>Currency</dt><dd>{c.currency}</dd></div>
      <div><dt>Reminder</dt><dd>{c.reminderDays} days</dd></div>
      <div><dt>Escalation</dt><dd>{c.escalationDays} days</dd></div>
      <div><dt>Management</dt><dd>{c.managementEmail||"—"}</dd></div></dl>
     <footer><button disabled={busy} onClick={()=>setEdit({...c})}><Settings2/>Configure</button>
      <button className="delete-company" disabled={busy} onClick={()=>remove(c)}><Trash2/>Delete</button></footer>
    </article>)}</section>
   {!rows.length&&!error&&<div className="panel company-empty">No companies configured. Use Add company to begin.</div>}
  </>}
  {edit&&<CompanyEditor company={edit} busy={busy} close={()=>setEdit(null)}
    saveCompany={c=>persist(c,!rows.some(x=>x.id===c.id))}/>}
 </div>}

function CompanyEditor({company,busy,close,saveCompany}:{company:Company;busy:boolean;close:()=>void;saveCompany:(c:Company)=>void}){const[c,setC]=useState(company);return <><button className="overlay" onClick={close}/><form className="modal" onSubmit={e=>{e.preventDefault();saveCompany(c)}}><header><div><small>COMPANY CONTROL</small><h2>{c.name||"Add company"}</h2></div><button type="button" onClick={close}><X/></button></header><div className="form"><label>Company name<input required value={c.name} onChange={e=>setC({...c,name:e.target.value})}/></label><label>Company code<input required value={c.code} onChange={e=>setC({...c,code:e.target.value.toUpperCase()})}/></label><label>Country<input required value={c.country} onChange={e=>setC({...c,country:e.target.value})}/></label><label>Currency<select value={c.currency} onChange={e=>setC({...c,currency:e.target.value})}><option>AED</option><option>SAR</option><option>INR</option><option>USD</option></select></label><label>Reminder after days<input type="number" min="0" value={c.reminderDays} onChange={e=>setC({...c,reminderDays:Number(e.target.value)})}/></label><label>Escalation after days<input type="number" min="0" value={c.escalationDays} onChange={e=>setC({...c,escalationDays:Number(e.target.value)})}/></label><label className="wide">Management email<input type="email" required value={c.managementEmail} onChange={e=>setC({...c,managementEmail:e.target.value})}/></label></div><footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":"Save company controls"}</button></footer></form></>}
