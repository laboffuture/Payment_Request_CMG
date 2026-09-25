"use client";

/* Choosing files for a form that uploads them on submit.

   A plain <input type="file"> replaces its selection every time it is used, so picking
   a second invoice silently dropped the first - and many phones only let you pick one
   file per visit to the picker. This keeps a list instead: every pick is added to it,
   the same file is not added twice, and each file can be taken off again.

   The input stays in the box, transparent, rather than hidden: a required field that is
   display:none cannot show the browser's "please select a file" message, and the form
   would refuse to submit without saying why. It is only required while the list is empty. */

import{useRef,useState}from"react";
import{FileText,Upload,X}from"lucide-react";

const size=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const key=(f:File)=>`${f.name}|${f.size}|${f.lastModified}`;

export default function FilePicker({files,onChange,label,required=false,
  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip",className=""}:{
  files:File[];onChange:(files:File[])=>void;label:string;required?:boolean;accept?:string;className?:string}){
  const input=useRef<HTMLInputElement>(null);
  const[over,setOver]=useState(false);
  const add=(picked:FileList|null)=>{
    if(!picked?.length)return;
    const have=new Set(files.map(key));
    onChange([...files,...Array.from(picked).filter(f=>!have.has(key(f)))]);
  };
  return <div className={`file-picker ${over?"over":""} ${className}`.trim()}
    onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)}
    onDrop={e=>{e.preventDefault();setOver(false);add(e.dataTransfer.files)}}>
    <label className="file-picker-drop">
      <input ref={input} type="file" multiple accept={accept} required={required&&!files.length}
        onChange={e=>{add(e.target.files);
          // Cleared after reading, so the same file can be picked again once removed.
          e.target.value=""}}/>
      <Upload/><b>{label}</b>
      <span>{files.length?"Add more files":"Choose files or drop them here"} · as many as you need</span>
    </label>
    {!!files.length&&<ul className="file-picker-list">
      {files.map((f,i)=><li key={key(f)}><FileText/><span title={f.name}>{f.name}</span><small>{size(f.size)}</small>
        <button type="button" aria-label={`Remove ${f.name}`} onClick={()=>onChange(files.filter((_,j)=>j!==i))}><X/></button></li>)}
    </ul>}
  </div>}
