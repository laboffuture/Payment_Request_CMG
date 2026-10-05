"use client";
import{Plus,Trash2}from"lucide-react";
import MultiSelect from"./MultiSelect";
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
  const[tab,setTab]=useState<"lists"|"fields"|"approvals">("lists");
  return <div className="page settings-page">
    <div className="intro"><div><small>ADMINISTRATION</small><h2>Settings</h2>
      <p>Maintain the choices behind the dropdowns, and add extra fields to a form,
        without waiting on a code change.</p></div></div>
    <div className="settings-tabs">
      <button className={tab==="lists"?"active":""} onClick={()=>setTab("lists")}>Dropdown lists</button>
      <button className={tab==="fields"?"active":""} onClick={()=>setTab("fields")}>Extra form fields</button>
      <button className={tab==="approvals"?"active":""} onClick={()=>setTab("approvals")}>Payment approvals</button>
    </div>
    {tab==="lists"?<Lists changed={changed}/>:tab==="fields"?<Fields changed={changed}/>:<Approvals/>}
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

/* Whether a payment request needs management approval before it reaches accounts, and for
   which companies. Switched off, every company's requests go straight to accounts; the
   requests already waiting for management stay there until management decides them. */
function Approvals(){
  type State={managementApproval:{enabled:boolean;companies:string[];approvers?:Record<string,string[]>};companies:string[];waiting:number;
    managers:{name:string;email:string}[]};
  const[saved,setSaved]=useState<State|null>(null);
  const[enabled,setEnabled]=useState(false),[picked,setPicked]=useState<string[]>([]),[who,setWho]=useState<Record<string,string[]>>({});
  const[busy,setBusy]=useState(false),[note,setNote]=useState(""),[error,setError]=useState("");
  const take=(d:State)=>{setSaved(d);setEnabled(d.managementApproval.enabled);setPicked(d.managementApproval.companies);setWho(d.managementApproval.approvers||{})};
  useEffect(()=>{call("/api/settings/workflow","GET").then(r=>{const d=r as State;
    setSaved(d);setEnabled(d.managementApproval.enabled);setPicked(d.managementApproval.companies);setWho(d.managementApproval.approvers||{})}).catch(e=>setError(e.message))},[]);
  if(error&&!saved)return <p className="settings-error">{error}</p>;
  if(!saved)return <p className="settings-empty">Loading…</p>;
  /* Approvers are kept by email; the picker shows names (with the email when two share one). */
  const label=(m:{name:string;email:string})=>saved.managers.filter(x=>x.name===m.name).length>1?`${m.name} (${m.email})`:m.name;
  const byLabel=new Map(saved.managers.map(m=>[label(m),m.email.toLowerCase()]));
  const nameOf=(e:string)=>{const m=saved.managers.find(x=>x.email.toLowerCase()===e);return m?label(m):e};
  const approverKey=(r:Record<string,string[]>)=>picked.map(c=>`${c}=${[...(r[c]||[])].sort().join(",")}`).join("|");
  const dirty=enabled!==saved.managementApproval.enabled||
    [...picked].sort().join("|")!==[...saved.managementApproval.companies].sort().join("|")||
    approverKey(who)!==approverKey(saved.managementApproval.approvers||{});
  const toggle=(c:string)=>setPicked(v=>v.includes(c)?v.filter(x=>x!==c):[...v,c]);
  const save=async()=>{setBusy(true);setNote("");setError("");
    try{take(await call("/api/settings/workflow","PATCH",{enabled,companies:picked,
      approvers:Object.fromEntries(picked.map(c=>[c,who[c]||[]]))}) as State);
      setNote(enabled?`Saved. New requests for ${picked.join(", ")} go to management first.`:"Saved. Every new request goes straight to accounts.")}
    catch(e){setError(e instanceof Error?e.message:"Could not save")}
    finally{setBusy(false)}};
  return <section className="panel settings-approvals">
    <div className="sa-row">
      <div><b>Management approval before Accounts</b>
        <p>A new payment request for a chosen company waits for management to approve it before it reaches the
          accounts queue. Management can approve, query or reject it; nobody approves their own request.</p></div>
      <button type="button" role="switch" aria-checked={enabled} className={enabled?"sa-switch on":"sa-switch"}
        onClick={()=>setEnabled(v=>!v)}><i/>{enabled?"On":"Off"}</button>
    </div>
    <div className={enabled?"sa-companies":"sa-companies off"}>
      <small>APPLIES TO</small>
      <div className="sa-grid">{saved.companies.map(c=><button type="button" key={c} role="checkbox" aria-checked={picked.includes(c)}
        disabled={!enabled} className={picked.includes(c)?"sa-co on":"sa-co"} onClick={()=>toggle(c)}>
        <span className="sa-box">{picked.includes(c)?"\u2713":""}</span>{c}</button>)}</div>
    </div>
    {enabled&&!!picked.length&&<div className="sa-approvers">
      <small>APPROVED BY</small>
      {!saved.managers.length
        ?<p className="sa-hint">Nobody has the Management role yet. Give it to your managers under Users &amp; access, then choose who
          approves each company here. Until then, administrators approve.</p>
        :<>{picked.map(c=><div className="sa-approver" key={c}><b>{c}</b>
            <MultiSelect options={saved.managers.map(label)} value={(who[c]||[]).map(nameOf)}
              onChange={v=>setWho(x=>({...x,[c]:v.map(n=>byLabel.get(n)||n)}))}
              allLabel="Any manager" noun="managers"/></div>)}
          <p className="sa-hint">Only the managers chosen for a company can approve, query or reject its requests, and they are the
            ones emailed. &ldquo;Any manager&rdquo; means everyone with the Management role.</p></>}
    </div>}
    {saved.waiting>0&&<p className="sa-note">{saved.waiting} request{saved.waiting===1?" is":"s are"} waiting for management approval now.
      {" "}They stay with management until approved, queried or rejected, whatever is chosen here.</p>}
    {error&&<p className="settings-error">{error}</p>}
    {note&&<p className="settings-note">{note}</p>}
    <div className="sa-actions">
      <button type="button" disabled={busy||!dirty} onClick={()=>take(saved)}>Cancel</button>
      <button type="button" className="primary" disabled={busy||!dirty||(enabled&&!picked.length)}
        title={enabled&&!picked.length?"Choose at least one company":""} onClick={save}>{busy?"Saving…":"Save"}</button>
    </div>
  </section>}
