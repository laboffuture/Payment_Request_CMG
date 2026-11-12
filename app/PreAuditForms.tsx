"use client";
/* The new pre-audit task form, from the business's template.

   It follows the Daily Task Import template. Its dropdowns read the task
   catalogue: choose the entity, then the category, then the task, and the task's own
   description, frequency, due date rule and next due date are filled in from the
   catalogue - each still changeable, and a task not in the catalogue can be typed. Nobody
   is assigned: the task goes into the open pool and an auditor takes it. */

import{useMemo,useState}from"react";
import{Plus,X}from"lucide-react";
import{catalogueApi}from"./audit-api";
import type{CatalogueTask}from"./audit-api";
import{ExtraFields,packExtra,useExtraFields}from"./ExtraFields";
import{useAsync}from"./workforce-store";

const uniq=(xs:string[])=>[...new Set(xs.map(x=>x.trim()).filter(Boolean))];
const req=<i className="pa-req" aria-hidden="true">*</i>;
const opt=<i className="field-optional">optional</i>;

/* The frequencies the queue repeats (lib/recurrence), and one time. A catalogue value
   outside these - "Daily / Weekly" - is offered too and kept, but does not repeat. */
const FREQUENCIES=["One time","Daily","Weekly","Monthly","Quarterly","Annual"];

type NewTask={title:string;department:string;companyId:string;due:string;notes:string;kind?:string;frequency?:string;
  extra?:string;category:string;entity:string;dueRule:string;catalogueId:string;assignedTo:string;status:string};

export function PreAuditTaskForm({close,create,departments=[]}:{close:()=>void;create:(t:NewTask)=>Promise<void>|void;departments?:string[]}){
  const catalogue=useAsync(()=>catalogueApi.load(),[]);
  const xFields=useExtraFields("audittask");
  const[xVals,setXVals]=useState<Record<string,string>>({});
  const[f,setF]=useState({entity:"",category:"",department:"",title:"",description:"",frequency:"Monthly",
    dueRule:"",due:"",catalogueId:""});
  const[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const set=(k:keyof typeof f,v:string)=>setF(x=>({...x,[k]:v}));
  const rows:CatalogueTask[]=useMemo(()=>catalogue.data||[],[catalogue.data]);
  const entities=uniq(rows.map(r=>r.entity));
  const categories=uniq(rows.filter(r=>!f.entity||r.entity===f.entity).map(r=>r.category));
  const titles=uniq(rows.filter(r=>(!f.entity||r.entity===f.entity)&&(!f.category||r.category===f.category)).map(r=>r.title));
  const rules=uniq(rows.map(r=>r.dueRule));
  const frequencies=uniq([...FREQUENCIES,f.frequency]);

  /* Choosing a catalogue task fills in what the catalogue says about it. */
  const pickTitle=(title:string)=>{
    const r=rows.find(x=>x.title===title&&(!f.entity||x.entity===f.entity)&&(!f.category||x.category===f.category));
    setF(x=>r?{...x,title,entity:r.entity,category:r.category,description:r.description,
      frequency:r.frequency||"One time",dueRule:r.dueRule,due:r.nextDueDate||x.due,catalogueId:r.id}
      :{...x,title,catalogueId:""})};

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setErr("");
    try{await create({title:f.title.trim(),department:f.department,companyId:"",due:f.due,notes:f.description.trim(),
      kind:"Pre-Audit",frequency:f.frequency,extra:packExtra(xFields,xVals),category:f.category,entity:f.entity,
      dueRule:f.dueRule.trim(),catalogueId:f.catalogueId,assignedTo:"",status:"Available"});
      close()}
    catch(x){setErr(x instanceof Error?x.message:"Could not create the task")}
    finally{setBusy(false)}};

  return <><button className="overlay" onClick={close}/>
    <form className="modal" onSubmit={submit}>
      <header><div><small>AUDIT DEPARTMENT</small><h2>New pre-audit task</h2></div>
        <button type="button" onClick={close}><X/></button></header>
      <div className="form">
        <label>Project / entity (vertical) {req}
          <select required value={f.entity} onChange={e=>setF(x=>({...x,entity:e.target.value,category:"",title:"",catalogueId:""}))}>
            <option value="">{catalogue.loading?"Loading…":"Select entity"}</option>
            {uniq([...entities,f.entity]).map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Category (area) {req}
          <select required value={f.category} onChange={e=>setF(x=>({...x,category:e.target.value,title:"",catalogueId:""}))}>
            <option value="">Select category</option>
            {uniq([...categories,f.category]).map(x=><option key={x}>{x}</option>)}</select></label>
        {/* The departments of the organisation register, as on the payment request form. */}
        <label className="wide">Department {req}
          <select required value={f.department} onChange={e=>set("department",e.target.value)}>
            <option value="">{departments.length?"Select department":"Loading departments…"}</option>
            {uniq([...departments,f.department]).map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Task title {req}
          <input required list="pre-audit-titles" value={f.title} onChange={e=>pickTitle(e.target.value)}
            placeholder={titles.length?"Choose a task, or type a new one":"Type the task"}/>
          <datalist id="pre-audit-titles">{titles.map(t=><option key={t} value={t}/>)}</datalist></label>
        <label className="wide">Description / instructions {opt}
          <textarea value={f.description} onChange={e=>set("description",e.target.value)}
            placeholder="What needs checking, and against what evidence"/></label>
        <label>Frequency {opt}
          <select value={f.frequency} onChange={e=>set("frequency",e.target.value)}>
            {frequencies.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Due date rule {req}
          <input required list="pre-audit-rules" value={f.dueRule} onChange={e=>set("dueRule",e.target.value)}
            placeholder="e.g. By 10th of following month"/>
          <datalist id="pre-audit-rules">{rules.map(r=><option key={r} value={r}/>)}</datalist></label>
        <label>Next due date {req}
          <input type="date" required value={f.due} onChange={e=>set("due",e.target.value)}/></label>
        <p className="wide pa-note">The task goes into the open pool, where any auditor can take it.</p>
        <ExtraFields form="audittask" values={xVals} onChange={setXVals}/>
        {err&&<p className="wide form-error">{err}</p>}
      </div>
      <footer><button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy}><Plus/>{busy?"Saving…":"Create"}</button></footer>
    </form></>}
