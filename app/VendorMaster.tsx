"use client";

/* Vendor Master: register a vendor, upload its documents, and take it through procurement
   verification, accounts verification and final approval to Active, where POs and payment
   requests can use it. The fields, the flow and its rules live in lib/vendor-master.ts;
   the server checks every one of them again. */

import{useMemo,useState}from"react";
import{ArrowRight,CheckCircle2,FileText,Plus,RotateCcw,Search,Trash2,Upload,X}from"lucide-react";
import{useAsync}from"./workforce-store";
import{Empty,ErrorBlock,Loading}from"./WorkforceShared";
import{stamp}from"../lib/stamp";
import{ACCOUNT_TYPES,BANK_PROOF,COUNTRIES,FIELDS,FLOW,GST_REG_TYPES,HOLDS,MOVE,PAYMENT_TERMS,REQUIRED_TO_LEAVE,SECTIONS,
  STATES_BY_COUNTRY,VENDOR_SOURCES,VENDOR_TYPES,WAITING_ON,YES_NO,YES_NO_NA,isRequired,missingFields,termDays}from"../lib/vendor-master";
import type{Choices,Field,Move,Section,VendorStatus}from"../lib/vendor-master";

type Vendor=Record<string,string>&{id:string;vendorCode:string;status:VendorStatus;legalName:string};
type Doc={id:string;kind:string;fileName:string;mime:string;bytes:number;uploadedBy:string;uploadedAt:string};
type Log={id:string;at:string;actor:string;action:string;detail:string};
type Lists={companies:{id:string;name:string}[];categories:string[];tdsSections:string[];currencies:string[];docKinds:string[]};
type Detail={vendor:Vendor;history:Log[];documents:Doc[];moves:Move[];editable:Section[];canDelete:boolean};

async function call<T>(url:string,method="GET",body?:unknown):Promise<T>{
  const r=await fetch(url,{method,headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({})) as T&{error?:string};
  if(!r.ok)throw new Error(d.error||"That did not go through");
  return d}
const API="/api/vendor-master";

/* Material Management reads the active vendors every 15 minutes; after a step in the flow it is asked to
   read them now, so a vendor just approved (or suspended) shows in PO creation at once. Material acts in a
   role the login holds, so each role that may ask is tried in turn; a login with none of them waits for the timer. */
async function pullIntoMaterial(){
  for(const role of["PROC","PROC_MGR","MGMT","ADMIN"]){
    const r=await fetch("/material/api/admin/vendors/sync",{method:"POST",headers:{"content-type":"application/json","x-cm-role":role},
      body:"{}"}).catch(()=>null);
    if(r?.ok)return}}

const OTHER=["Returned","Rejected",...HOLDS] as VendorStatus[];
const tone=(s:string)=>s==="Active"?"ok":["Rejected","Blocked"].includes(s)?"bad":s==="Returned"?"warn":
  ["Suspended","Inactive","Expired"].includes(s)?"off":"wait";
const blank=():Record<string,string>=>Object.fromEntries(FIELDS.map(f=>[f.key,f.key==="country"?"India":""]));

export default function VendorMaster({flash}:{flash?:(m:string)=>void}){
  const[status,setStatus]=useState<string>(""),[q,setQ]=useState(""),[open,setOpen]=useState<string|null>(null),
    [adding,setAdding]=useState(false),[version,setVersion]=useState(0);
  const reload=()=>setVersion(v=>v+1);
  const{data,loading,error}=useAsync(()=>call<{vendors:Vendor[];choices:Lists;canCreate:boolean}>(API),[version]);
  const vendors=useMemo(()=>data?.vendors||[],[data]);
  const counts=useMemo(()=>{const c:Record<string,number>={};vendors.forEach(v=>c[v.status]=(c[v.status]||0)+1);return c},[vendors]);
  const term=q.trim().toLowerCase();
  const rows=useMemo(()=>vendors.filter(v=>(!status||v.status===status)&&(!term||[v.vendorCode,v.legalName,v.tradeName,v.companyName,
    v.vendorType,v.vendorCategory,v.city,v.contactPerson,v.mobile,v.gstin,v.pan].join(" ").toLowerCase().includes(term))),[vendors,status,term]);

  return <div className="page recv"><div className="recv-module vm">
    <div className="intro"><div><small>PROCUREMENT · ACCOUNTS</small><h2>Vendor Master</h2>
      <p>Every vendor is registered by procurement, verified by procurement and accounts, and approved before activation.
        Only an <b>Active</b> vendor is offered in POs and payment requests.</p></div>
      {data?.canCreate&&<button className="primary" onClick={()=>setAdding(true)}><Plus/>Register vendor</button>}</div>

    <div className="recv-flow">
      {FLOW.map((s,i)=><button key={s.status} className={status===s.status?"recv-stage on":"recv-stage"}
        onClick={()=>setStatus(status===s.status?"":s.status)} title={`${s.step} · ${s.who}`}>
        <b>{counts[s.status]||0}</b><span>{i+1}. {s.step}</span><small className="vm-who">{s.who}</small>
        {i<FLOW.length-1&&<ArrowRight className="recv-arrow"/>}</button>)}
    </div>
    <div className="vm-holds">{OTHER.map(s=><button key={s} className={`vm-chip ${tone(s)}${status===s?" on":""}`}
      onClick={()=>setStatus(status===s?"":s)}>{s}<b>{counts[s]||0}</b></button>)}</div>

    <section className="panel">
      <header className="recv-head">
        <h3>{status||"All vendors"}<i>{rows.length}</i></h3>
        <label className="recv-search"><Search/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Vendor ID, name, company, GSTIN or city"/>
          {q&&<button onClick={()=>setQ("")} aria-label="Clear search"><X/></button>}</label>
        {status&&<button className="ghost" onClick={()=>setStatus("")}>Show all</button>}
      </header>
      {error?<ErrorBlock message={error} retry={reload}/>
      :loading&&!data?<Loading label="Loading the vendor master"/>
      :!vendors.length?<Empty label="No vendor registered yet. Procurement registers one with Register vendor."/>
      :!rows.length?<Empty label="No vendor matches that."/>
      :<div className="recv-rows">
        <div className="recv-cols" aria-hidden="true"><span>Vendor</span><span>Company · type</span>
          <span>Contact</span><span className="num">Waiting on</span><span className="num">Status</span></div>
        {rows.map(v=><button key={v.id} className="recv-row" onClick={()=>setOpen(v.id)}>
          <div className="recv-ref"><b>{v.vendorCode}</b><small>{v.legalName}{v.tradeName?` (${v.tradeName})`:""}</small></div>
          <div className="recv-desc">{v.companyName||"—"} · {v.vendorType||"type not set"}{v.vendorCategory?` · ${v.vendorCategory}`:""}
            {v.statusNote&&<i className="recv-back"><RotateCcw/>{v.statusNote}</i>}</div>
          <div className="recv-nums"><span>{v.contactPerson||"—"}</span><span>{[v.mobile,v.city].filter(Boolean).join(" · ")}</span></div>
          <div className="recv-amt">{WAITING_ON[v.status]||"—"}<small>{stamp(v.updatedAt)}</small></div>
          <div className={`vm-tag ${tone(v.status)}`}>{v.status==="Active"&&<CheckCircle2/>}{v.status}</div>
        </button>)}</div>}
    </section>

    {(open||adding)&&data&&<VendorDrawer id={open} lists={data.choices} close={()=>{setOpen(null);setAdding(false)}}
      changed={(msg,id)=>{reload();flash?.(msg);if(id){setAdding(false);setOpen(id)}}}
      removed={msg=>{setOpen(null);reload();flash?.(msg)}}/>}
  </div></div>}

const lbl=(f:Field,v:Record<string,string>)=><span className="recv-lbl">{f.label}{isRequired(f,v)&&<i className="recv-req" aria-hidden="true">*</i>}</span>;

/* Fields that only apply on another answer stay out of the way until they do. */
const applies=(f:Field,v:Record<string,string>)=>{
  if(f.key==="gstin"||f.key==="gstRegType")return v.gstRegistered!=="No";
  if(f.key==="tdsSection")return v.tdsApplicable==="Yes";
  if(f.key==="udyamNo")return v.msmeRegistered==="Yes";
  if(f.key==="retentionPercent")return v.retentionApplicable==="Yes";
  if(f.key==="holderExplanation")return isRequired(f,v)||!!v.holderExplanation;
  return true};

function VendorDrawer({id,lists,close,changed,removed}:{id:string|null;lists:Lists;close:()=>void;
  changed:(msg:string,id?:string)=>void;removed:(msg:string)=>void}){
  const[seen,setSeen]=useState(0);
  const d=useAsync(()=>id?call<Detail>(`${API}?id=${encodeURIComponent(id)}`):Promise.resolve(null),[id,seen]);
  const detail=d.data;
  /* The form starts from what is saved, and is started again whenever the vendor is re-read. */
  const[form,setForm]=useState<{key:string;v:Record<string,string>}>({key:"",v:blank()});
  const key=detail?`${detail.vendor.id}:${detail.vendor.updatedAt}`:"new";
  const v=form.key===key?form.v:detail?Object.fromEntries(FIELDS.map(f=>[f.key,detail.vendor[f.key]??""])):blank();
  const saved=detail?Object.fromEntries(FIELDS.map(f=>[f.key,detail.vendor[f.key]??""])):blank();
  const set=(k:string,val:string)=>setForm(prev=>{const next={...(prev.key===key?prev.v:v),[k]:val};
    if(k==="paymentTerms"){const days=termDays(val);if(days!==null)next.creditDays=String(days)}
    if(k==="country"&&STATES_BY_COUNTRY[val]&&!STATES_BY_COUNTRY[val].includes(next.state))next.state="";
    return{key,v:next}});
  const editable:Section[]=id?detail?.editable||[]:[...SECTIONS];
  const dirty=FIELDS.some(f=>editable.includes(f.section)&&(v[f.key]??"")!==(saved[f.key]??""));
  const[busy,setBusy]=useState(false),[err,setErr]=useState(""),[note,setNote]=useState("");
  const[kind,setKind]=useState(BANK_PROOF);

  const run=async(fn:()=>Promise<unknown>,after:()=>void)=>{
    setBusy(true);setErr("");
    try{await fn();after()}catch(e){setErr(e instanceof Error?e.message:"That did not go through")}finally{setBusy(false)}};
  const fields=()=>Object.fromEntries(FIELDS.filter(f=>editable.includes(f.section)).map(f=>[f.key,v[f.key]??""]));
  const refresh=()=>setSeen(n=>n+1);

  const create=()=>run(async()=>{const r=await call<{vendor:Vendor}>(API,"POST",v);changed(`${r.vendor.vendorCode} saved as a draft`,r.vendor.id)},()=>{});
  const save=()=>run(()=>call(API,"PATCH",{id,action:"save",fields:fields()}),()=>{refresh();changed("Vendor details saved")});
  const move=(m:Move)=>run(()=>call(API,"PATCH",{id,action:m,fields:fields(),note}),
    ()=>{setNote("");refresh();changed(`${detail?.vendor.vendorCode}: ${MOVE[m].to}`);void pullIntoMaterial()});
  const upload=(file:File)=>{const r=new FileReader();r.onload=()=>run(()=>call(API,"POST",{action:"upload",id,kind,
    fileName:file.name,dataUrl:String(r.result)}),()=>{refresh();changed(`${kind} uploaded`)});r.readAsDataURL(file)};
  const unattach=(doc:Doc)=>run(()=>call(`${API}?id=${encodeURIComponent(id||"")}&file=${encodeURIComponent(doc.id)}`,"DELETE"),
    ()=>{refresh();changed(`${doc.fileName} removed`)});
  const drop=()=>{if(!confirm("Delete this draft? It has never been submitted."))return;
    run(()=>call(`${API}?id=${encodeURIComponent(id||"")}`,"DELETE"),()=>removed("Draft deleted"))};

  const list=(c:Choices):{value:string;label:string}[]=>{
    const plain=(l:string[])=>l.map(x=>({value:x,label:x}));
    switch(c){
      case"companies":return lists.companies.map(x=>({value:x.id,label:x.name}));
      case"categories":return plain(lists.categories);case"tds":return plain(lists.tdsSections);
      case"currencies":return plain(lists.currencies);case"countries":return plain(COUNTRIES);
      case"states":return plain(STATES_BY_COUNTRY[v.country]||[]);
      case"vendorTypes":return plain(VENDOR_TYPES);case"yesNo":return plain(YES_NO);case"yesNoNa":return plain(YES_NO_NA);
      case"gstTypes":return plain(GST_REG_TYPES);case"accountTypes":return plain(ACCOUNT_TYPES);
      case"terms":return plain(PAYMENT_TERMS);case"sources":return plain(VENDOR_SOURCES)}};

  const input=(f:Field)=>{
    const value=v[f.key]??"";
    const can=editable.includes(f.section);
    if(!can){const shown=f.choices==="companies"?(lists.companies.find(c=>c.id===value)?.name||detail?.vendor.companyName||value):value;
      return <label key={f.key} className={f.type==="long"?"vm-wide":""}>{lbl(f,v)}<input readOnly className="recv-auto" value={shown||"—"}/></label>}
    const opts=f.choices?list(f.choices):[];
    const free=f.choices==="states"&&!opts.length;
    const auto=f.key==="creditDays"&&termDays(v.paymentTerms)!==null;
    return <label key={f.key} className={f.type==="long"?"vm-wide":""}>{lbl(f,v)}
      {f.type==="select"&&!free?<select value={value} onChange={e=>set(f.key,e.target.value)}>
          <option value="">Select</option>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          {!!value&&!opts.some(o=>o.value===value)&&<option value={value}>{value}</option>}</select>
      :f.type==="long"?<textarea rows={2} value={value} onChange={e=>set(f.key,e.target.value)}/>
      :<input value={value} readOnly={auto} className={auto?"recv-auto":""} onChange={e=>set(f.key,e.target.value)}
          type={f.type==="email"?"email":f.type==="tel"?"tel":"text"} inputMode={f.type==="number"?"decimal":undefined}
          placeholder={f.hint||""} autoComplete="off"/>}
      {f.hint&&f.type!=="text"&&f.type!=="tel"&&<small className="vm-hint">{f.hint}</small>}</label>};

  const vendor=detail?.vendor;
  const status=(vendor?.status||"Draft") as VendorStatus;
  const step=FLOW.findIndex(s=>s.status===status);
  const missing=vendor?missingFields(v,REQUIRED_TO_LEAVE[status]||[]):[];
  const docs=detail?.documents||[];
  const forward=(detail?.moves||[]).filter(m=>!MOVE[m].note);
  const withNote=(detail?.moves||[]).filter(m=>MOVE[m].note);

  return <div className="recv-drawer wide" role="dialog" aria-label="Vendor">
    <button className="recv-scrim" aria-label="Close" onClick={close}/>
    <aside>
      <header><div><small>VENDOR MASTER{vendor?` · ${vendor.vendorCode}`:" · NEW VENDOR"}</small>
        <h3>{vendor?.legalName||v.legalName||"Register a vendor"}</h3>
        {vendor&&<p className="recv-form-sub">{vendor.companyName} · registered by {vendor.createdBy} · {stamp(vendor.createdAt)}</p>}</div>
        <button onClick={close} aria-label="Close"><X/></button></header>

      {id&&d.loading&&!detail?<Loading label="Loading the vendor"/>:id&&d.error?<ErrorBlock message={d.error} retry={refresh}/>:<>
      {vendor&&<>
        <div className={`vm-tag big ${tone(status)}`}>{status==="Active"&&<CheckCircle2/>}{status}
          {WAITING_ON[status]?` · with ${WAITING_ON[status]}`:""}</div>
        <ol className="vm-steps">{FLOW.map((s,i)=><li key={s.status} className={step>i||status==="Active"?"done":step===i?"now":""}>
          <b>{i+1}</b><span>{s.step}</span></li>)}</ol>
        {vendor.statusNote&&<p className="recv-back-note"><RotateCcw/><span><b>{status}:</b> {vendor.statusNote}</span></p>}
      </>}

      <div className="recv-act recv-form vm-form">
        {SECTIONS.map(sec=><fieldset key={sec} className="vm-sec">
          <legend>{sec}{editable.includes(sec)?<i>you can edit</i>:null}</legend>
          <div className="vm-grid">{FIELDS.filter(f=>f.section===sec&&applies(f,v)).map(input)}</div>
        </fieldset>)}
        {!id&&<p className="recv-hint">Save the draft first; the documents are uploaded to it next.</p>}
      </div>

      {vendor&&<section className="vm-docs"><h4><FileText/>Documents</h4>
        {!docs.some(x=>x.kind===BANK_PROOF)&&<p className="recv-hint">The cancelled cheque or bank proof is required before activation.</p>}
        {docs.length?<ul>{docs.map(x=><li key={x.id}>
          <a href={`${API}?id=${encodeURIComponent(vendor.id)}&file=${encodeURIComponent(x.id)}`} target="_blank" rel="noreferrer">{x.fileName}</a>
          <span>{x.kind} · {x.uploadedBy} · {stamp(x.uploadedAt)}</span>
          {!!editable.length&&<button className="ghost" disabled={busy} onClick={()=>unattach(x)} aria-label={`Remove ${x.fileName}`}><Trash2/></button>}
        </li>)}</ul>:<p className="recv-empty">No document uploaded yet.</p>}
        {!!editable.length&&<div className="vm-upload"><select value={kind} onChange={e=>setKind(e.target.value)}>
          {lists.docKinds.map(k=><option key={k}>{k}</option>)}</select>
          <label className="ghost vm-file"><Upload/>Upload PDF or photo<input type="file" accept=".pdf,image/*" disabled={busy}
            onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)upload(f)}}/></label></div>}
      </section>}

      {err&&<p className="recv-error">{err}</p>}

      <div className="recv-act vm-actions">
        {!id&&<button className="primary" disabled={busy||!v.legalName.trim()} onClick={create}>{busy?"Saving…":"Save draft"}</button>}
        {id&&!!editable.length&&<button className="ghost" disabled={busy||!dirty} onClick={save}>{busy?"Saving…":"Save changes"}</button>}
        {!!forward.length&&!!missing.length&&<p className="recv-hint">Still to fill in before it moves on: {missing.join(", ")}.</p>}
        {forward.map(m=><button key={m} className="primary" disabled={busy} onClick={()=>move(m)}>{MOVE[m].label}<ArrowRight/></button>)}
        {status==="Pending Approval"&&!forward.length&&withNote.length>0&&<p className="recv-hint">You registered this vendor, so
          another authorised approver must approve it.</p>}
        {!!withNote.length&&<div className="recv-return"><b><RotateCcw/>Reason</b>
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Required for the actions below"/>
          <div className="vm-row">{withNote.map(m=><button key={m} className={["reject","block"].includes(m)?"ghost danger":"ghost"}
            disabled={busy||!note.trim()} onClick={()=>move(m)}>{MOVE[m].label}</button>)}</div></div>}
        {detail?.canDelete&&<button className="ghost danger" disabled={busy} onClick={drop}><Trash2/>Delete draft</button>}
        {vendor&&!detail?.moves.length&&!editable.length&&<p className="recv-empty">{WAITING_ON[status]
          ?`This vendor is with ${WAITING_ON[status]}. Your role cannot act on it now.`:`This vendor is ${status}.`}</p>}
      </div>

      {vendor&&<section className="dc-log"><h4>History</h4>
        {!(detail?.history||[]).length?<p className="recv-empty">Nothing recorded yet.</p>
        :<ol>{[...(detail?.history||[])].reverse().map(h=><li key={h.id}><b>{h.action}</b>{!!h.detail&&<span>{h.detail}</span>}
          <small>{h.actor} · {stamp(h.at)}</small></li>)}</ol>}
      </section>}
      </>}
    </aside></div>}
