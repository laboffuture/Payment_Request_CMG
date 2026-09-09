"use client";
import{Plus,Trash2}from"lucide-react";
import{useCallback,useEffect,useState}from"react";

/* Master data, for an Administrator.

   Two things live here: the choices behind the dropdowns on the forms, and extra
   fields added to a form. Both are read by everyone and changed only by an
   administrator - the server enforces that, this screen only decides what to show. */

type ListDef={id:string;label:string;where:string};
type Option={id:string;listId:string;name:string;position:number;active:number};
type FormDef={id:string;label:string};
type Field={id:string;form:string;label:string;type:string;options:string;
  required:number;position:number;active:number};

const call=async(url:string,method:string,body?:unknown)=>{
  const r=await fetch(url,{method,headers:{"content-type":"application/json"},
    body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({})) as{error?:string};
  if(!r.ok)throw new Error(d.error||"That did not work");
  return d};

export default function SettingsDesk({changed}:{changed?:()=>void}){
  const[tab,setTab]=useState<"lists"|"fields">("lists");
  return <div className="page settings-page">
    <div className="intro"><div><small>ADMINISTRATION</small><h2>Settings</h2>
      <p>Maintain the choices behind the dropdowns, and add extra fields to a form,
        without waiting on a code change.</p></div></div>
    <div className="settings-tabs">
      <button className={tab==="lists"?"active":""} onClick={()=>setTab("lists")}>Dropdown lists</button>
      <button className={tab==="fields"?"active":""} onClick={()=>setTab("fields")}>Extra form fields</button>
    </div>
    {tab==="lists"?<Lists changed={changed}/>:<Fields changed={changed}/>}
  </div>}

function Lists({changed}:{changed?:()=>void}){
  const[lists,setLists]=useState<ListDef[]>([]);
  const[options,setOptions]=useState<Option[]>([]);
  const[picked,setPicked]=useState("");
  const[name,setName]=useState("");
  const[busy,setBusy]=useState(false);
  const[note,setNote]=useState("");

  const load=useCallback(async()=>{
    try{
      const r=await fetch("/api/settings/options");
      const d=await r.json() as{lists?:ListDef[];options?:Option[]};
      setLists(d.lists||[]);setOptions(d.options||[]);
      setPicked(p=>p||(d.lists||[])[0]?.id||"");
    }catch{setNote("Could not load the lists")}},[]);
  useEffect(()=>{load()},[load]);

  const run=async(fn:()=>Promise<unknown>)=>{
    setBusy(true);setNote("");
    try{await fn();await load();changed?.()}
    catch(e){setNote(e instanceof Error?e.message:"That did not work")}
    finally{setBusy(false)}};

  const list=lists.find(l=>l.id===picked);
  const rows=options.filter(o=>o.listId===picked);

  return <div className="settings-body">
    <aside className="settings-side">
      {lists.map(l=><button key={l.id} className={picked===l.id?"active":""}
        onClick={()=>{setPicked(l.id);setNote("")}}>
        <b>{l.label}</b><small>{options.filter(o=>o.listId===l.id&&o.active).length} in use</small>
      </button>)}
    </aside>
    <section className="panel settings-main">
      {list&&<>
        <div className="panel-head"><div><small>DROPDOWN</small><h2>{list.label}</h2></div></div>
        <p className="settings-note">Shown on: {list.where}. Removing a choice takes it
          off the form from now on; records already saved keep the wording they were
          saved with.</p>
        <form className="settings-add" onSubmit={e=>{e.preventDefault();
          if(!name.trim())return;
          run(()=>call("/api/settings/options","POST",{listId:picked,name:name.trim()}))
            .then(()=>setName(""))}}>
          <input value={name} maxLength={60} onChange={e=>setName(e.target.value)}
            placeholder={`Add a choice to ${list.label.toLowerCase()}`}/>
          <button className="primary" disabled={busy||!name.trim()}><Plus/>Add</button>
        </form>
        {!!note&&<p className="settings-error">{note}</p>}
        <ul className="settings-list">
          {rows.map(o=><li key={o.id}>
            <span>{o.name}</span>
            <em className={o.active?"badge green":"badge"}>{o.active?"On the form":"Hidden"}</em>
            <button disabled={busy} onClick={()=>run(()=>call("/api/settings/options","PATCH",
              {id:o.id,active:!o.active}))}>{o.active?"Hide":"Show"}</button>
            <button className="settings-delete" disabled={busy}
              onClick={()=>{if(confirm(`Remove "${o.name}"?`))
                run(()=>call(`/api/settings/options?id=${encodeURIComponent(o.id)}`,"DELETE"))}}>
              <Trash2/></button>
          </li>)}
          {!rows.length&&<li className="settings-empty">Nothing on this list yet.</li>}
        </ul>
      </>}
    </section>
  </div>}

function Fields({changed}:{changed?:()=>void}){
  const[forms,setForms]=useState<FormDef[]>([]);
  const[types,setTypes]=useState<string[]>([]);
  const[fields,setFields]=useState<Field[]>([]);
  const[picked,setPicked]=useState("");
  const[draft,setDraft]=useState({label:"",type:"text",options:"",required:false});
  const[busy,setBusy]=useState(false);
  const[note,setNote]=useState("");

  const load=useCallback(async()=>{
    try{
      const r=await fetch("/api/settings/fields");
      const d=await r.json() as{forms?:FormDef[];types?:string[];fields?:Field[]};
      setForms(d.forms||[]);setTypes(d.types||[]);setFields(d.fields||[]);
      setPicked(p=>p||(d.forms||[])[0]?.id||"");
    }catch{setNote("Could not load the fields")}},[]);
  useEffect(()=>{load()},[load]);

  const run=async(fn:()=>Promise<unknown>)=>{
    setBusy(true);setNote("");
    try{await fn();await load();changed?.()}
    catch(e){setNote(e instanceof Error?e.message:"That did not work")}
    finally{setBusy(false)}};

  const form=forms.find(f=>f.id===picked);
  const rows=fields.filter(f=>f.form===picked);
  const label=(t:string)=>t==="yesno"?"Yes / No":t==="dropdown"?"Dropdown"
    :t.charAt(0).toUpperCase()+t.slice(1);

  return <div className="settings-body">
    <aside className="settings-side">
      {forms.map(f=><button key={f.id} className={picked===f.id?"active":""}
        onClick={()=>{setPicked(f.id);setNote("")}}>
        <b>{f.label}</b><small>{fields.filter(x=>x.form===f.id&&x.active).length} extra fields</small>
      </button>)}
    </aside>
    <section className="panel settings-main">
      {form&&<>
        <div className="panel-head"><div><small>EXTRA FIELDS</small><h2>{form.label}</h2></div></div>
        <p className="settings-note">These appear on the form below the built-in
          fields, and on the request once it is raised. Hiding one keeps everything
          already captured.</p>
        <form className="settings-field-add" onSubmit={e=>{e.preventDefault();
          if(!draft.label.trim())return;
          run(()=>call("/api/settings/fields","POST",{form:picked,...draft,
            label:draft.label.trim()}))
            .then(()=>setDraft({label:"",type:"text",options:"",required:false}))}}>
          <label>Field label<input value={draft.label} maxLength={60}
            onChange={e=>setDraft({...draft,label:e.target.value})}
            placeholder="e.g. Cost centre"/></label>
          <label>Type<select value={draft.type}
            onChange={e=>setDraft({...draft,type:e.target.value})}>
            {types.map(t=><option key={t} value={t}>{label(t)}</option>)}</select></label>
          {draft.type==="dropdown"&&<label className="wide">Choices, separated by commas
            <input value={draft.options} onChange={e=>setDraft({...draft,options:e.target.value})}
              placeholder="e.g. North, South, Central"/></label>}
          <label className="settings-check"><input type="checkbox" checked={draft.required}
            onChange={e=>setDraft({...draft,required:e.target.checked})}/>Must be filled in</label>
          <button className="primary" disabled={busy||!draft.label.trim()}><Plus/>Add field</button>
        </form>
        {!!note&&<p className="settings-error">{note}</p>}
        <ul className="settings-list">
          {rows.map(f=><li key={f.id}>
            <span>{f.label}{f.required?<i className="settings-req"> required</i>:null}
              <small>{label(f.type)}{f.type==="dropdown"?` — ${f.options}`:""}</small></span>
            <em className={f.active?"badge green":"badge"}>{f.active?"On the form":"Hidden"}</em>
            <button disabled={busy} onClick={()=>run(()=>call("/api/settings/fields","PATCH",
              {id:f.id,active:!f.active}))}>{f.active?"Hide":"Show"}</button>
            <button className="settings-delete" disabled={busy}
              onClick={()=>{if(confirm(`Remove "${f.label}" from the form?`))
                run(()=>call(`/api/settings/fields?id=${encodeURIComponent(f.id)}`,"DELETE"))}}>
              <Trash2/></button>
          </li>)}
          {!rows.length&&<li className="settings-empty">No extra fields on this form.</li>}
        </ul>
      </>}
    </section>
  </div>}
