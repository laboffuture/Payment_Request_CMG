"use client";
/* A filter that takes several choices at once: a button that says what is picked, and a
   list of options with tick boxes. Nothing picked means everything - the first row says
   so and clears the picks. Closes on a click outside or on Escape. */
import{useEffect,useRef,useState}from"react";
import{Check,ChevronDown}from"lucide-react";

export default function MultiSelect({options,value,onChange,allLabel,noun}:{options:string[];value:string[];
  onChange:(v:string[])=>void;allLabel:string;noun:string}){
  const[open,setOpen]=useState(false);
  const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;
    const away=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false)};
    const esc=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};
    document.addEventListener("mousedown",away);document.addEventListener("keydown",esc);
    return()=>{document.removeEventListener("mousedown",away);document.removeEventListener("keydown",esc)}},[open]);
  const toggle=(o:string)=>onChange(value.includes(o)?value.filter(x=>x!==o):[...value,o]);
  const summary=!value.length?allLabel:value.length===1?value[0]:`${value.length} ${noun} selected`;
  return <div className="ms" ref={box}>
    <button type="button" className={value.length?"ms-btn on":"ms-btn"} aria-haspopup="listbox" aria-expanded={open}
      title={value.join(", ")||allLabel} onClick={()=>setOpen(v=>!v)}><span>{summary}</span><ChevronDown/></button>
    {open&&<div className="ms-pop" role="listbox" aria-multiselectable="true">
      <button type="button" role="option" aria-selected={!value.length} className="ms-opt ms-all" onClick={()=>onChange([])}>
        <span className="ms-box">{!value.length&&<Check/>}</span>{allLabel}</button>
      {options.map(o=><button type="button" role="option" key={o} aria-selected={value.includes(o)} className="ms-opt" onClick={()=>toggle(o)}>
        <span className="ms-box">{value.includes(o)&&<Check/>}</span>{o}</button>)}
    </div>}
  </div>}
