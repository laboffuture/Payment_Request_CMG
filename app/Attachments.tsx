"use client";
import{useOptions}from"./options-store";
import{useCallback,useEffect,useRef,useState}from"react";
import{Download,FileText,Paperclip,Trash2,Upload}from"lucide-react";

export const ATTACH_FALLBACK=["Invoice","Proforma invoice","Purchase order","Delivery order",
  "Quotation","Contract","Bank/payment proof","Statement","Reconciliation","Photo","Other"];

export type Attachment={id:string;kind:string;fileName:string;mime:string;bytes:number;
  note:string;uploadedBy:string;uploadedAt:string};

const readable=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(Math.round(n/1024),1)} KB`;
export const asDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{
  const r=new FileReader();
  r.onerror=()=>reject(new Error("Could not read that file"));
  r.onload=()=>resolve(String(r.result));
  r.readAsDataURL(file)});

/* Attach as many documents as the record needs. Nothing is compulsory: a payment
   request might carry an invoice, a purchase order and a delivery order, or none at
   all, and the same panel serves tickets, tasks, batches and observations. */
/* An error page from a proxy (e.g. nginx's 413) is HTML, not JSON. */
const readJson=async(res:Response)=>{
  try{return await res.json() as{error?:string}}catch{return{} as{error?:string}}};

/* canRemove hides the delete button from somebody the server would refuse, so a requestor
   is not offered a button that can only fail. It defaults to on for every other host. */
export default function Attachments({entityType,entityId,flash:hostFlash,readOnly,canRemove=true}:{
  entityType:string;entityId:string;flash:(m:string)=>void;readOnly?:boolean;canRemove?:boolean}){
  /* The outcome is also shown inside the panel. Some hosts pass a no-op flash, and an
     upload that fails without a word looks exactly like the button doing nothing. */
  const [notice,setNotice]=useState<{text:string;error:boolean}|null>(null);
  const flash=(m:string,error=false)=>{setNotice({text:m,error});hostFlash(m)};
  const kinds=useOptions("attachment.kind",ATTACH_FALLBACK);
  const [rows,setRows]=useState<Attachment[]>([]);
  const [kind,setKind]=useState("Invoice");
  const [limit,setLimit]=useState(0);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const input=useRef<HTMLInputElement>(null);

  const load=useCallback(async()=>{
    if(!entityId)return;
    setLoading(true);
    try{
      const res=await fetch(`/api/attachments?entityType=${encodeURIComponent(entityType)}`+
        `&entityId=${encodeURIComponent(entityId)}`);
      const body=await res.json() as{attachments?:Attachment[];limit?:number};
      if(res.ok){setRows(body.attachments||[]);setLimit(body.limit||0)}
    }catch{/* an empty list is the right fallback here */}
    finally{setLoading(false)}},[entityType,entityId]);

  useEffect(()=>{load()},[load]);

  /* Several files can be chosen at once; each is uploaded under the selected type and
     a failure on one does not abandon the rest. */
  const upload=async(files:FileList|null)=>{
    if(!files||!files.length)return;
    if(!entityId){flash("Save this record before attaching files",true);return}
    setBusy(true);
    setNotice(null);
    let ok=0;
    const failed:string[]=[];
    for(const file of Array.from(files)){
      try{
        if(limit&&file.size>limit)
          throw new Error(`${file.name} is ${readable(file.size)}; the limit is ${readable(limit)}`);
        const dataUrl=await asDataUrl(file);
        const res=await fetch("/api/attachments",{method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({entityType,entityId,kind,fileName:file.name,dataUrl})});
        const body=await readJson(res);
        if(!res.ok)throw new Error(body?.error||(res.status===413
          ?`${file.name} is too large to upload`
          :res.status===401||res.status===403?"Your session has expired - sign in again"
          :`${file.name} was refused (HTTP ${res.status})`));
        ok++;
      }catch(e){failed.push(e instanceof Error?e.message:`Could not attach ${file.name}`)}
    }
    if(failed.length)
      flash((ok?`${ok} attached. `:"")+`Not attached: ${failed.join("; ")}`,true);
    else if(ok)flash(`${ok} file${ok===1?"":"s"} attached`);
    setBusy(false);
    load()};

  const remove=async(a:Attachment)=>{
    if(!confirm(`Remove ${a.fileName}?`))return;
    try{
      const res=await fetch(`/api/attachments?id=${encodeURIComponent(a.id)}`,{method:"DELETE"});
      if(!res.ok)throw new Error((await readJson(res))?.error||"Could not remove it");
      flash(`${a.fileName} removed`);load();
    }catch(e){flash(e instanceof Error?e.message:"Could not remove it",true)}};

  return <section className="wf-attach">
    <h4>Attachments{rows.length?<span> · {rows.length}</span>:null}</h4>

    {!readOnly&&<div className="wf-attach-add">
      <label>Document type
        <select value={kind} onChange={e=>setKind(e.target.value)}>
          {kinds.map(k=><option key={k}>{k}</option>)}</select></label>
      <button type="button" className="wf-small" disabled={busy}
        onClick={()=>input.current?.click()}>
        <Upload/>{busy?"Uploading…":"Choose files"}</button>
      <input ref={input} type="file" multiple hidden
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
        onChange={e=>{upload(e.target.files);e.target.value=""}}/>
      <small>Attach as many as you need — invoice, proforma, purchase order, delivery
        order, bank proof. All optional{limit?`, up to ${readable(limit)} each`:""}.</small>
    </div>}
    {notice&&<p role={notice.error?"alert":"status"} style={{margin:"6px 0",fontSize:13,
      color:notice.error?"#b42318":"#067647"}}>{notice.text}</p>}

    {loading?<p className="wf-empty">Loading attachments…</p>
    :!rows.length?<p className="wf-empty">Nothing attached yet.</p>
    :<div className="table-wrap wf-table"><table><thead><tr>
      <th>TYPE</th><th>FILE</th><th>SIZE</th><th>ADDED BY</th><th>WHEN</th><th></th></tr></thead>
      <tbody>{rows.map(a=><tr key={a.id}>
        <td><span className="badge">{a.kind}</span></td>
        <td><a className="wf-attach-link" href={`/api/attachments?id=${encodeURIComponent(a.id)}`}
          target="_blank" rel="noreferrer"><FileText/>{a.fileName}</a></td>
        <td>{readable(a.bytes)}</td>
        <td>{a.uploadedBy||"—"}</td>
        <td>{a.uploadedAt?new Date(a.uploadedAt).toLocaleDateString("en-GB",
          {day:"2-digit",month:"short",year:"numeric"}):"—"}</td>
        <td><div className="wf-actions">
          <a className="wf-small" href={`/api/attachments?id=${encodeURIComponent(a.id)}`}
            download={a.fileName}><Download/></a>
          {!readOnly&&canRemove&&<button className="wf-danger-icon" onClick={()=>remove(a)}><Trash2/></button>}
        </div></td></tr>)}</tbody></table></div>}
  </section>}

/* A compact count for list rows, so people can see at a glance which records carry
   paperwork without opening each one. */
export function AttachmentCount({entityType,entityId}:{entityType:string;entityId:string}){
  const [n,setN]=useState<number|null>(null);
  useEffect(()=>{
    let dead=false;
    fetch(`/api/attachments?entityType=${encodeURIComponent(entityType)}`+
      `&entityId=${encodeURIComponent(entityId)}`)
      .then(r=>r.json() as Promise<{attachments?:Attachment[]}>)
      .then(b=>{if(!dead)setN((b.attachments||[]).length)})
      .catch(()=>{if(!dead)setN(0)});
    return()=>{dead=true}},[entityType,entityId]);
  if(!n)return null;
  return <span className="wf-attach-count" title={`${n} attachment${n===1?"":"s"}`}>
    <Paperclip/>{n}</span>}
