"use client";
import{useCallback,useEffect,useRef,useState}from"react";
import{Download,FileText,Paperclip,Trash2,Upload}from"lucide-react";

export const ATTACH_KINDS=["Invoice","Proforma invoice","Purchase order","Delivery order",
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
export default function Attachments({entityType,entityId,flash,readOnly}:{
  entityType:string;entityId:string;flash:(m:string)=>void;readOnly?:boolean}){
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
    setBusy(true);
    let ok=0;
    for(const file of Array.from(files)){
      try{
        const dataUrl=await asDataUrl(file);
        const res=await fetch("/api/attachments",{method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({entityType,entityId,kind,fileName:file.name,dataUrl})});
        const body=await res.json() as{error?:string};
        if(!res.ok)throw new Error(body?.error||`${file.name} was refused`);
        ok++;
      }catch(e){flash(e instanceof Error?e.message:`Could not attach ${file.name}`)}
    }
    if(ok)flash(`${ok} file${ok===1?"":"s"} attached`);
    setBusy(false);
    load()};

  const remove=async(a:Attachment)=>{
    if(!confirm(`Remove ${a.fileName}?`))return;
    try{
      const res=await fetch(`/api/attachments?id=${encodeURIComponent(a.id)}`,{method:"DELETE"});
      if(!res.ok)throw new Error(((await res.json()) as{error?:string})?.error||"Could not remove it");
      flash(`${a.fileName} removed`);load();
    }catch(e){flash(e instanceof Error?e.message:"Could not remove it")}};

  return <section className="wf-attach">
    <h4>Attachments{rows.length?<span> · {rows.length}</span>:null}</h4>

    {!readOnly&&<div className="wf-attach-add">
      <label>Document type
        <select value={kind} onChange={e=>setKind(e.target.value)}>
          {ATTACH_KINDS.map(k=><option key={k}>{k}</option>)}</select></label>
      <button type="button" className="wf-small" disabled={busy}
        onClick={()=>input.current?.click()}>
        <Upload/>{busy?"Uploading…":"Choose files"}</button>
      <input ref={input} type="file" multiple hidden
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
        onChange={e=>{upload(e.target.files);e.target.value=""}}/>
      <small>Attach as many as you need — invoice, proforma, purchase order, delivery
        order, bank proof. All optional{limit?`, up to ${readable(limit)} each`:""}.</small>
    </div>}

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
          {!readOnly&&<button className="wf-danger-icon" onClick={()=>remove(a)}><Trash2/></button>}
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
