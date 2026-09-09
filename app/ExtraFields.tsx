"use client";
import{useEffect,useState}from"react";

/* Extra fields an administrator added to a form, rendered wherever that form is.

   The values travel with the record as JSON and carry their label, so a record still
   reads correctly after the field behind it is renamed or retired. Every form uses
   the same three pieces: the hook to load the definitions, <ExtraFields/> to collect
   the answers, and <ExtraValues/> to show them back. */

export type Field={id:string;form:string;label:string;type:string;options:string;
  required:number;position:number;active:number};
export type Filled={id:string;label:string;value:string};

let cache:Field[]|null=null;
let inflight:Promise<Field[]>|null=null;
const listeners=new Set<()=>void>();

export function refreshFields(){
  cache=null;inflight=null;
  for(const fn of listeners)fn()}

export function useExtraFields(form:string){
  const[,bump]=useState(0);
  useEffect(()=>{
    let live=true;
    const onChange=()=>{if(live)bump(n=>n+1)};
    listeners.add(onChange);
    if(!cache){
      inflight=inflight||fetch("/api/settings/fields")
        .then(r=>r.json() as Promise<{fields?:Field[]}>).then(d=>d.fields||[]);
      inflight.then(d=>{cache=d;if(live)bump(n=>n+1)}).catch(()=>{cache=[]});
    }
    return()=>{live=false;listeners.delete(onChange)};
  },[]);
  return (cache||[]).filter(f=>f.form===form&&f.active)}

/* What was captured, for reading back - including on a record whose field has since
   been removed, which is why the label is stored with the value. */
export const readExtra=(json?:string):Filled[]=>{
  try{const v=JSON.parse(json||"[]");return Array.isArray(v)?v as Filled[]:[]}catch{return[]}};

export const packExtra=(fields:Field[],values:Record<string,string>)=>{
  const filled=fields.filter(f=>(values[f.id]||"").trim()!=="")
    .map(f=>({id:f.id,label:f.label,value:values[f.id]}));
  return filled.length?JSON.stringify(filled):""};

/* Seeds the editor from a record already saved, so opening one does not wipe what it
   carries. */
export const unpackExtra=(json?:string)=>{
  const out:Record<string,string>={};
  for(const f of readExtra(json))out[f.id]=f.value;
  return out};

export function ExtraFields({form,values,onChange}:{form:string;
  values:Record<string,string>;onChange:(v:Record<string,string>)=>void}){
  const fields=useExtraFields(form);
  if(!fields.length)return null;
  const set=(id:string,v:string)=>onChange({...values,[id]:v});
  return <>{fields.map(f=>{
    const v=values[f.id]||"";
    const choices=f.type==="yesno"?["No","Yes"]
      :f.options.split(",").map(x=>x.trim()).filter(Boolean);
    return <label className={f.type==="dropdown"||f.type==="yesno"||f.type==="number"
        ||f.type==="date"?"":"wide"} key={f.id}>{f.label}
      {f.type==="dropdown"||f.type==="yesno"
        ?<select required={!!f.required} value={v} onChange={e=>set(f.id,e.target.value)}>
           <option value="">— choose —</option>
           {choices.map(c=><option key={c}>{c}</option>)}</select>
        :<input required={!!f.required} value={v} onChange={e=>set(f.id,e.target.value)}
           type={f.type==="number"?"number":f.type==="date"?"date":"text"}/>}
    </label>})}</>}

/* Read-only, for a detail panel or a profile. */
export function ExtraValues({extra,as="dl"}:{extra?:string;as?:"dl"|"list"}){
  const rows=readExtra(extra);
  if(!rows.length)return null;
  if(as==="list")return <ul className="extra-values">{rows.map(r=>
    <li key={r.id}><span>{r.label}</span><b>{r.value}</b></li>)}</ul>;
  return <>{rows.map(r=><div key={r.id}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</>}
