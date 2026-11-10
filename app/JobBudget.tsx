"use client";
import{useEffect,useMemo,useState}from"react";
import{AlertTriangle,Search,Wallet,X}from"lucide-react";
import{BUDGET_CURRENCY,inr,jobKey,short,stateOf}from"../lib/budget";
import type{JobBudget}from"../lib/budget";

/* Job budgets on screen: the box on the payment form and the request panel, the badge on
   the queues, the overview, and the administrator's editor under Settings. One copy of the
   figures is shared by every screen and re-read after a change or every two minutes. */

type Data={defaultBudget:number;currency:string;otherCurrency:number;jobs:JobBudget[]};
let cache:Data|null=null,at=0,pending:Promise<Data|null>|null=null;
const listeners=new Set<(d:Data|null)=>void>();

async function fetchBudgets(force=false):Promise<Data|null>{
  if(!force&&cache&&Date.now()-at<120000)return cache;
  if(pending)return pending;
  pending=fetch("/api/budgets").then(r=>r.ok?r.json() as Promise<Data>:null).catch(()=>null)
    .then(d=>{if(d){cache=d;at=Date.now()}pending=null;listeners.forEach(f=>f(cache));return cache});
  return pending}
export const refreshBudgets=()=>fetchBudgets(true);

export function useBudgets(){
  const[data,setData]=useState<Data|null>(cache);
  useEffect(()=>{listeners.add(setData);fetchBudgets();return()=>{listeners.delete(setData)}},[]);
  const byCode=useMemo(()=>new Map((data?.jobs||[]).map(j=>[jobKey(j.code),j])),[data]);
  return{data,find:(code?:string)=>code?byCode.get(jobKey(code)):undefined}}

const label={ok:"Within budget",near:"Near budget",over:"Overspent"} as const;
const pct=(j:JobBudget)=>j.budget>0?Math.round(j.spent/j.budget*100):j.spent>0?100:0;

function Bar({j,extra=0}:{j:JobBudget;extra?:number}){
  const used=j.budget>0?Math.min(100,j.spent/j.budget*100):j.spent>0?100:0;
  const more=j.budget>0?Math.min(100-used,extra/j.budget*100):0;
  return <div className={`jb-bar ${j.state}`}><i style={{width:`${used}%`}}/>{more>0&&<i className="jb-add" style={{width:`${more}%`}}/>}</div>}

/* The job's budget, spent and balance. With an amount (the request being raised or read),
   says whether this request takes the job over its budget. */
export function BudgetBox({code,amount,currency,own=false}:{code?:string;amount?:number;currency?:string;own?:boolean}){
  const{data,find}=useBudgets();
  const j=find(code);
  if(!code||!data)return null;
  if(!j)return <div className="jb-box"><p className="jb-none">{code} is not on the Jobs list, so it has no budget.</p></div>;
  /* A new request is not in the figures yet; one already raised is (unless rejected). */
  const add=!own&&amount&&amount>0&&(currency||BUDGET_CURRENCY)===BUDGET_CURRENCY?amount:0;
  const after=j.spent+add;
  const afterState=stateOf(j.budget,after);
  return <div className={`jb-box ${afterState}`}>
    <div className="jb-top"><span><Wallet/>Budget · {j.code}</span><em className={`jb-state ${j.state}`}>{label[j.state]}</em></div>
    <Bar j={j} extra={add}/>
    <dl><div><dt>Budget</dt><dd title={inr(j.budget)}>{short(j.budget)}</dd></div>
      <div><dt>Spent</dt><dd title={inr(j.spent)}>{short(j.spent)} <small>({pct(j)}%)</small></dd></div>
      <div><dt>{j.balance<0?"Overspent by":"Balance"}</dt><dd className={j.balance<0?"neg":""} title={inr(Math.abs(j.balance))}>{short(Math.abs(j.balance))}</dd></div></dl>
    <p className="jb-split">Released {short(j.released)} · In process {short(j.inProcess)} · {j.requests} request(s)</p>
    {add>0&&<p className={`jb-warn ${afterState}`}>{afterState==="over"
      ?<><AlertTriangle/>This request takes {j.code} over budget by {inr(after-j.budget)}.</>
      :<>After this request: spent {short(after)}, balance {short(j.budget-after)}.</>}</p>}
    {!!currency&&currency!==BUDGET_CURRENCY&&<p className="jb-none">Budgets are in INR; this {currency} request is not counted.</p>}
  </div>}

/* On a queue row: only when the job needs attention. */
export function BudgetBadge({code}:{code?:string}){
  const{find}=useBudgets();const j=find(code);
  if(!j||j.state==="ok")return null;
  return <span className={`badge ${j.state==="over"?"red":"amber"} jb-badge`} title={`${j.code}: spent ${inr(j.spent)} of ${inr(j.budget)}`}>
    {j.state==="over"?"Overspent":"Near budget"}</span>}

function useFiltered(jobs:JobBudget[]){
  const[q,setQ]=useState(""),[only,setOnly]=useState("all");
  const rows=jobs.filter(j=>(only==="all"||j.state===only)&&(!q.trim()||[j.code,j.project,j.location].some(x=>x.toLowerCase().includes(q.trim().toLowerCase()))))
    .sort((a,b)=>({over:0,near:1,ok:2}[a.state]-{over:0,near:1,ok:2}[b.state])||b.spent-a.spent);
  const tools=<div className="jb-tools"><label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search code, project or location"/></label>
    <select value={only} onChange={e=>setOnly(e.target.value)}><option value="all">All jobs</option><option value="over">Overspent</option><option value="near">Near budget</option><option value="ok">Within budget</option></select></div>;
  return{rows,tools}}

function Totals({jobs}:{jobs:JobBudget[]}){
  const t=jobs.reduce((a,j)=>({budget:a.budget+j.budget,spent:a.spent+j.spent}),{budget:0,spent:0});
  const over=jobs.filter(j=>j.state==="over").length,near=jobs.filter(j=>j.state==="near").length;
  return <div className="jb-totals"><article><span>Total budget</span><b>{short(t.budget)}</b><small>{jobs.length} jobs</small></article>
    <article><span>Total spent</span><b>{short(t.spent)}</b><small>{t.budget?Math.round(t.spent/t.budget*100):0}% of budget</small></article>
    <article className={over?"over":""}><span>Overspent</span><b>{over}</b><small>{near} near budget</small></article></div>}

function Row({j,children}:{j:JobBudget;children?:React.ReactNode}){
  return <tr className={j.state}><td><b>{j.code}</b><small>{j.project}{j.location?` · ${j.location}`:""}</small></td>
    <td className="num">{children??<span title={inr(j.budget)}>{short(j.budget)}</span>}</td>
    <td className="num" title={inr(j.spent)}>{short(j.spent)}<small>{pct(j)}% · {j.requests} req.</small></td>
    <td className="num" title={`Released ${inr(j.released)} · In process ${inr(j.inProcess)}`}>{short(j.released)}<small>in process {short(j.inProcess)}</small></td>
    <td className={`num ${j.balance<0?"neg":""}`} title={inr(j.balance)}>{j.balance<0?"−":""}{short(Math.abs(j.balance))}</td>
    <td><Bar j={j}/><em className={`jb-state ${j.state}`}>{label[j.state]}</em></td></tr>}

const head=<thead><tr><th>JOB</th><th className="num">BUDGET</th><th className="num">SPENT</th><th className="num">RELEASED</th><th className="num">BALANCE</th><th>STATUS</th></tr></thead>;

/* Every job's budget and spend, for accounts, audit and finance. Read only. */
export function ProjectBudgets({close}:{close:()=>void}){
  const{data}=useBudgets();
  useEffect(()=>{refreshBudgets()},[]);
  const{rows,tools}=useFiltered(data?.jobs||[]);
  return <><button className="overlay" aria-label="Close" onClick={close}/><section className="modal jb-modal">
    <header><div><small>INR · SPENT = EVERY REQUEST BOOKED TO THE JOB EXCEPT REJECTED</small><h2>Project budgets</h2></div><button onClick={close}><X/></button></header>
    <div className="jb-modal-body">{!data?<p className="queue-empty">Loading…</p>:<><Totals jobs={data.jobs}/>{tools}
      <div className="table-wrap"><table className="jb-table">{head}<tbody>{rows.map(j=><Row key={j.code} j={j}/>)}</tbody></table></div>
      {data.otherCurrency>0&&<p className="jb-none">{data.otherCurrency} request(s) booked to a job in another currency are not counted.</p>}</>}</div>
  </section></>}

/* Settings → Jobs: the budget of each job, changed by an administrator. */
export function JobBudgetEditor(){
  const{data}=useBudgets();
  const[edit,setEdit]=useState<Record<string,string>>({}),[busy,setBusy]=useState(""),[note,setNote]=useState("");
  useEffect(()=>{refreshBudgets()},[]);
  const{rows,tools}=useFiltered(data?.jobs||[]);
  const save=async(j:JobBudget,reset=false)=>{setBusy(j.code);setNote("");
    try{const r=await fetch("/api/budgets",{method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify(reset?{code:j.code,reset:true}:{code:j.code,budget:edit[j.code]})});
      const b=await r.json().catch(()=>({})) as{error?:string};
      if(!r.ok)throw new Error(b.error||"Could not save");
      setEdit(e=>{const n={...e};delete n[j.code];return n});await refreshBudgets()}
    catch(e){setNote(e instanceof Error?e.message:"Could not save")}finally{setBusy("")}};
  if(!data)return <p className="settings-note">Loading budgets…</p>;
  return <div className="jb-editor">
    <div className="panel-head"><div><small>BUDGETS</small><h2>Budget and spend by job</h2></div></div>
    <p className="settings-note">Every job starts with a budget of {short(data.defaultBudget)} ({inr(data.defaultBudget)}). Spent is every INR payment
      request booked to the job's JB code, except rejected ones. A job whose spend passes its budget shows as Overspent on the
      payment form, the request panel and the queues.</p>
    <Totals jobs={data.jobs}/>{tools}
    {!!note&&<p className="settings-error">{note}</p>}
    <div className="table-wrap"><table className="jb-table">{head}<tbody>{rows.map(j=>{const v=edit[j.code];return <Row key={j.code} j={j}>
      <div className="jb-edit"><input inputMode="numeric" aria-label={`Budget for ${j.code} in rupees`} value={v??String(j.budget)}
        onChange={e=>setEdit(x=>({...x,[j.code]:e.target.value}))}/>
        <small>{v!==undefined&&Number.isFinite(Number(v.replace(/[,\s]/g,"")))?short(Number(v.replace(/[,\s]/g,""))):j.custom?"set by admin":"default"}</small>
        {v!==undefined&&v!==String(j.budget)&&<button className="primary" disabled={busy===j.code} onClick={()=>save(j)}>Save</button>}
        {j.custom&&v===undefined&&<button disabled={busy===j.code} onClick={()=>save(j,true)} title={`Back to ${short(data.defaultBudget)}`}>Default</button>}</div>
    </Row>})}</tbody></table></div>
  </div>}
