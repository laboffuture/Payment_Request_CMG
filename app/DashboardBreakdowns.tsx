"use client";
import{ChevronDown,ChevronRight,Download,Search}from"lucide-react";
import{useMemo,useState}from"react";
import type{ReactNode}from"react";
import{csv}from"./workforce-store";

/* The dashboard's breakdown tabs: the same payment requests the reader already sees,
   grouped by project, vendor, sub-contractor, week, department, entity, currency,
   repeat vendors and statutory payments. Each reader gets only what the server sent
   them - a department head his department, everyone else in these roles the register
   (narrowed by the company picker) - so nothing here widens anybody's view. */

export const BREAKDOWN_ROLES=["Accountant","Auditor","Department Head","Audit Head","Finance","Administrator","Management"];

type Row={id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;status:string;
  department:string;nature?:string;jbCode?:string;projectCode?:string;project?:string;createdAt?:string;
  releasedAt?:string;due?:string;jobLocation?:string;invoiceNumber?:string;invoiceDate?:string;poNumber?:string;
  tdsValue?:string;utrNumber?:string;raisedBy?:string;description?:string;
  /* paid so far on a request paid in parts, and each payment with the day it was made */
  paidAmount?:number;releases?:{amount:number;paidOn:string}[]};
type Group={key:string;label:string;sub?:string;rows:Row[];last?:boolean};

const isRejected=(p:Row)=>p.status==="Rejected"||p.status==="Audit Rejected";
const isReleased=(p:Row)=>p.status==="Payment Released"||p.status==="Expenses Booked";
/* What has gone out on a request: all of it once released, the part payments before that. */
const paidOf=(p:Row)=>{const a=Number(p.amount)||0;return isReleased(p)?a:Math.min(a,Number(p.paidAmount)||0)};
const isPartPaid=(p:Row)=>!isReleased(p)&&(Number(p.paidAmount)||0)>0;

/* Stored times are UTC ("2026-11-05 11:25:40" or ISO); weeks and months are India time. */
const when=(s?:string)=>{if(!s)return null;
  /* a day on its own (the date a payment was made) is already India's day */
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const d=new Date(s+"T00:00:00Z");return Number.isFinite(d.getTime())?d:null}
  const t=new Date(s.includes("T")?s:s.replace(" ","T")+"Z").getTime();
  return Number.isFinite(t)?new Date(t+330*60000):null};
const dayOf=(s?:string)=>when(s)?.toISOString().slice(0,10)||"";
const monthOf=(s?:string)=>dayOf(s).slice(0,7);
const weekOf=(s?:string)=>{const d=when(s);if(!d)return"";const back=(d.getUTCDay()+6)%7;
  return new Date(d.getTime()-back*864e5).toISOString().slice(0,10)};
const fmtDay=(d:string)=>new Date(d+"T00:00:00Z").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
const fmtMonth=(m:string)=>new Date(m+"-01T00:00:00Z").toLocaleDateString("en-GB",{month:"short",year:"2-digit",timeZone:"UTC"});

const COUNTRY:Record<string,string>={INR:"India",AED:"UAE",SAR:"Saudi Arabia",QR:"Qatar",QAR:"Qatar",USD:"United States",EUR:"Europe",GBP:"United Kingdom"};

/* Amounts never add across currencies: each figure is a list, one per currency. */
type Money=Map<string,number>;
const sum=(rows:Row[],value:(p:Row)=>number=p=>Number(p.amount)||0)=>{const m:Money=new Map();
  for(const p of rows){const c=(p.currency||"INR").toUpperCase();m.set(c,(m.get(c)||0)+value(p))}return m};
const one=(c:string,n:number)=>{const a=Math.abs(n);
  const v=c==="INR"?(a>=1e7?`${(n/1e7).toFixed(2)} Cr`:a>=1e5?`${(n/1e5).toFixed(2)} L`:Math.round(n).toLocaleString("en-IN"))
    :Math.round(n).toLocaleString("en-IN");
  return c==="INR"?`₹${v}`:`${c} ${v}`};
const order=(m:Money)=>Array.from(m.entries()).sort((a,b)=>a[0]==="INR"?-1:b[0]==="INR"?1:a[0].localeCompare(b[0]));
function Amount({m}:{m:Money}){const e=order(m).filter(([,n])=>n);
  if(!e.length)return <span className="bd-nil">—</span>;
  return <>{e.map(([c,n])=><span key={c} className="bd-amt" title={`${c} ${n.toLocaleString("en-IN",{maximumFractionDigits:2})}`}>{one(c,n)}</span>)}</>}

/* What one tab groups by. */
type Tab={id:string;label:string;note:string;name:string;groups:(rows:Row[])=>Group[]};
const by=(rows:Row[],key:(p:Row)=>string,label:(k:string,rows:Row[])=>string=k=>k,sub?:(k:string,rows:Row[])=>string|undefined,empty="Not given"):Group[]=>{
  const m=new Map<string,Row[]>();
  for(const p of rows){const k=key(p).trim();const id=k.toLowerCase()||"\u0000";(m.get(id)||m.set(id,[]).get(id)!).push(p)}
  return Array.from(m.entries()).map(([id,rs])=>{const k=id==="\u0000"?"":key(rs[0]).trim();
    return{key:id,label:k?label(k,rs):empty,sub:k?sub?.(k,rs):undefined,rows:rs,last:!k}})
    .sort((a,b)=>Number(!!a.last)-Number(!!b.last)||live(b.rows).length-live(a.rows).length||a.label.localeCompare(b.label))};
const live=(rows:Row[])=>rows.filter(p=>!isRejected(p));
const isSub=(p:Row)=>/sub\s*-?\s*contract/i.test(p.nature||"");
const isStatutory=(p:Row)=>/statutory/i.test(p.nature||"");
const jobOf=(p:Row)=>p.jbCode||p.projectCode||"";
/* Petty cash, employee claims and travel go to the same staff every month without being
   recurring commitments, so the recurring tab leaves them out, as it does sub-contractors. */
const isStaffMoney=(p:Row)=>/petty\s*cash|reimburse|claim|travel/i.test(p.nature||"");

const TABS:Tab[]=[
 {id:"project",label:"Project wise",name:"Job",note:"Every request by its job code. Requests raised without a job code are listed last.",
  groups:rows=>by(rows,jobOf,k=>k,(_,rs)=>{const p=rs.find(x=>x.project)?.project;return p||undefined},"No job code")},
 {id:"vendor",label:"Vendor wise",name:"Vendor",note:"Every request by the vendor or beneficiary named on it. Sub-contractors have their own tab.",
  groups:rows=>by(rows.filter(p=>!isSub(p)),p=>p.vendor||"",k=>k,undefined,"No vendor named")},
 {id:"sub",label:"Sub contractor wise",name:"Sub-contractor",note:"Requests raised with the nature Sub Contractor, by sub-contractor.",
  groups:rows=>by(rows.filter(isSub),p=>p.vendor||"",k=>k,undefined,"No name given")},
 {id:"weekly",label:"Weekly spent",name:"Week",note:"Monday to Sunday, India time. Requested is what was raised that week (not counting rejected); released is what was paid out that week.",
  groups:()=>[]},
 {id:"department",label:"Department wise",name:"Department",note:"Every request by the department on it.",
  groups:rows=>by(rows,p=>p.department||"")},
 {id:"entity",label:"Entity",name:"Entity",note:"Every request by the company it is raised for.",
  groups:rows=>by(rows,p=>p.company||"")},
 {id:"currency",label:"Country / Currency",name:"Country · currency",note:"Every request by the currency it is paid in.",
  groups:rows=>by(rows,p=>(p.currency||"").toUpperCase(),k=>`${COUNTRY[k]||k} · ${k}`)},
 {id:"recurring",label:"Recurring payments",name:"Vendor",note:"Vendors paid in three or more different months - rent, salaries, utilities, maintenance and the like - worked out from the requests raised (not counting rejected). Petty cash, staff claims, travel and sub-contractors are left out.",
  groups:rows=>by(rows.filter(p=>!isSub(p)&&!isStaffMoney(p)),p=>p.vendor||"").filter(g=>!g.last&&new Set(live(g.rows).map(p=>monthOf(p.createdAt)).filter(Boolean)).size>=3)
    .map(g=>{const ms=Array.from(new Set(live(g.rows).map(p=>monthOf(p.createdAt)).filter(Boolean))).sort();
      return{...g,sub:`${ms.length} months · ${ms.map(fmtMonth).join(", ")}`}})},
 {id:"statutory",label:"Statutory payments",name:"Entity",note:"Statutory and compliance payments - TDS, GST, VAT, PF, ESI and the like - by entity.",
  groups:rows=>by(rows.filter(isStatutory),p=>p.company||"")},
];

/* Request by request, for the reports downloaded from a tab: one job (or vendor, week...)
   with its totals underneath, or every group one after another. */
const REQUEST_HEAD=["Request no","Raised on","Released on","Entity","Department","Vendor / beneficiary","Nature",
  "Job code","Project","Job location","Invoice no","Invoice date","PO no","Currency","Amount","Paid so far","Still to pay","TDS value","Status",
  "UTR / reference","Raised by","Description"];
const requestCells=(p:Row)=>[p.requestNo,dayOf(p.createdAt),isReleased(p)?dayOf(p.releasedAt):"",p.company||"",p.department||"",
  p.vendor||"",p.nature||"",jobOf(p),p.project||"",p.jobLocation||"",p.invoiceNumber||"",p.invoiceDate||"",p.poNumber||"",
  (p.currency||"INR").toUpperCase(),Number(p.amount)||0,paidOf(p),isRejected(p)?0:Math.round(((Number(p.amount)||0)-paidOf(p))*100)/100,
  p.tdsValue||"",isPartPaid(p)?`${p.status} (part paid)`:p.status||"",p.utrNumber||"",p.raisedBy||"",
  (p.description||"").replace(/\s+/g," ").trim()];
const newestFirst=(rows:Row[])=>[...rows].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")||b.id-a.id);
const slugOf=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"report";
const today=()=>new Date().toISOString().slice(0,10);

function weekly(rows:Row[]):(Group&{raised:Row[];paid:Row[]})[]{
  const m=new Map<string,{raised:Row[];paid:Row[]}>();
  const at=(w:string)=>m.get(w)||m.set(w,{raised:[],paid:[]}).get(w)!;
  for(const p of rows){const w=weekOf(p.createdAt);if(w)at(w).raised.push(p);
    /* Money out in the week it was paid: each part payment on its own day, and a request
       released in one go before part payments existed on the day it was released. */
    if(p.releases?.length){for(const r of p.releases){const w2=weekOf(r.paidOn);if(w2)at(w2).paid.push({...p,amount:Number(r.amount)||0})}}
    else if(isReleased(p)){const r=weekOf(p.releasedAt);if(r)at(r).paid.push(p)}}
  return Array.from(m.entries()).sort((a,b)=>b[0].localeCompare(a[0])).map(([w,g])=>{
    const end=new Date(new Date(w+"T00:00:00Z").getTime()+6*864e5).toISOString().slice(0,10);
    return{key:w,label:`${fmtDay(w)} – ${fmtDay(end)}`,rows:Array.from(new Map([...g.raised,...g.paid].map(p=>[p.id,rows.find(x=>x.id===p.id)||p])).values()),raised:g.raised,paid:g.paid}})}

export default function DashboardBreakdowns({payments,open,children}:{payments:Row[];open:(p:Row)=>void;children:ReactNode}){
  const[tab,setTab]=useState("overview");
  return <>
    <div className="bd-bar"><div className="wb-tabs bd-tabs" role="tablist">
      <button role="tab" aria-selected={tab==="overview"} className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>Overview</button>
      {TABS.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className={tab===t.id?"active":""} onClick={()=>setTab(t.id)}>{t.label}</button>)}
    </div></div>
    {tab==="overview"?children:<Breakdown key={tab} tab={TABS.find(t=>t.id===tab)!} payments={payments} open={open}/>}
  </>}

function Breakdown({tab,payments,open}:{tab:Tab;payments:Row[];open:(p:Row)=>void}){
  const[q,setQ]=useState(""),[openKey,setOpenKey]=useState("");
  const isWeek=tab.id==="weekly";
  const groups=useMemo(()=>isWeek?weekly(payments):tab.groups(payments),[payments,tab,isWeek]);
  const words=q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown=groups.filter(g=>!words.length||words.every(w=>`${g.label} ${g.sub||""}`.toLowerCase().includes(w)));
  const covered=new Set(groups.flatMap(g=>g.rows.map(p=>p.id))).size;
  const figures=(g:Group)=>{const w=g as Group&{raised?:Row[];paid?:Row[]};
    const raised=isWeek?w.raised!:g.rows;
    const asked=live(raised);
    /* Released is what has gone out - part payments included; in process is the rest. */
    const paid=isWeek?sum(w.paid!):sum(asked,paidOf);
    return{count:raised.length,asked:sum(asked),paid,paidCount:isWeek?new Set(w.paid!.map(p=>p.id)).size:asked.filter(isReleased).length,
      process:sum(asked,p=>(Number(p.amount)||0)-paidOf(p)),rejected:raised.filter(isRejected).length}};
  const download=()=>{
    const head=[tab.name,...(tab.id==="project"||tab.id==="recurring"?["Detail"]:[]),"Currency",isWeek?"Requests raised":"Requests",
      "Requested (not counting rejected)","Released",...(isWeek?[]:["In process"]),"Rejected requests"];
    const out:(string|number)[][]=[head];
    for(const g of shown){const f=figures(g);const cs=new Set([...f.asked.keys(),...f.paid.keys(),...f.process.keys()]);
      if(!cs.size)cs.add("");
      for(const c of order(new Map(Array.from(cs).map(c=>[c,0]))).map(([c])=>c))
        out.push([g.label,...(tab.id==="project"||tab.id==="recurring"?[g.sub||""]:[]),c,f.count,f.asked.get(c)||0,f.paid.get(c)||0,
          ...(isWeek?[]:[f.process.get(c)||0]),f.rejected])}
    csv(out,`dashboard-${slugOf(tab.label)}-${today()}.csv`)};
  /* Every request in the groups shown, group by group. */
  const downloadAll=()=>{
    const out:(string|number)[][]=[[tab.name,...REQUEST_HEAD]];
    for(const g of shown)for(const p of newestFirst(g.rows))out.push([g.label,...requestCells(p)]);
    csv(out,`${slugOf(tab.label)}-every-request-${today()}.csv`)};
  /* One group's own report: its requests, then its totals in each currency. */
  const downloadOne=(g:Group)=>{const f=figures(g);
    const out:(string|number)[][]=[[`${tab.name}: ${g.label}`],...(g.sub?[[g.sub]]:[]),[`Downloaded ${fmtDay(today())}`],[],REQUEST_HEAD];
    for(const p of newestFirst(g.rows))out.push(requestCells(p));
    out.push([],[`Requests: ${f.count}`,`Rejected: ${f.rejected}`]);
    out.push(["Currency","Requested (not counting rejected)","Released","In process"]);
    const cs=order(new Map([...f.asked.keys(),...f.paid.keys(),...f.process.keys()].map(c=>[c,0])));
    for(const[c]of cs)out.push([c,f.asked.get(c)||0,f.paid.get(c)||0,f.process.get(c)||0]);
    csv(out,`${slugOf(tab.name)}-${slugOf(g.label)}-${today()}.csv`)};
  return <div className="page bd-page">
    <div className="bd-head"><div><small>DASHBOARD · {tab.label.toUpperCase()}</small><h2>{tab.label}</h2><p>{tab.note}</p></div>
      <div className="bd-tools"><label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${tab.name.toLowerCase()}`} aria-label={`Search ${tab.name.toLowerCase()}`}/></label>
        <button className="bd-export" disabled={!shown.length} onClick={download} title={shown.length?"Download these figures to open in Excel":"Nothing to download"}><Download/>Download summary</button>
        <button className="bd-export" disabled={!shown.length} onClick={downloadAll} title={shown.length?`Every request, ${tab.name.toLowerCase()} by ${tab.name.toLowerCase()}, to open in Excel`:"Nothing to download"}><Download/>Download every request</button></div></div>
    {!words.length&&<Charts tab={tab} groups={groups} pick={key=>{setOpenKey(key);
      requestAnimationFrame(()=>document.querySelector(`[data-group="${CSS.escape(key)}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}))}}/>}
    <p className="bd-count">{shown.length} {shown.length===1?"row":"rows"} · {covered} request{covered===1?"":"s"}</p>
    {!shown.length?<p className="queue-empty">{groups.length?"Nothing matches that search.":"No requests here yet."}</p>:
    <div className="panel table-panel bd-panel"><div className="table-wrap"><table className="bd-table">
      <thead><tr><th>{tab.name.toUpperCase()}</th><th className="num">{isWeek?"RAISED":"REQUESTS"}</th><th className="num">REQUESTED</th><th className="num">RELEASED</th>{!isWeek&&<th className="num">IN PROCESS</th>}<th className="num">REJECTED</th><th className="bd-rep-h">REPORT</th></tr></thead>
      <tbody>{shown.map(g=>{const f=figures(g);const on=openKey===g.key;
        const list=[...g.rows].sort((a,b)=>b.id-a.id);
        return[<tr key={g.key} data-group={g.key} className={`bd-group${on?" open":""}${g.last?" bd-muted":""}`} onClick={()=>setOpenKey(on?"":g.key)} aria-expanded={on}>
          <td><span className="bd-name">{on?<ChevronDown/>:<ChevronRight/>}<b>{g.label}</b></span>{g.sub&&<small>{g.sub}</small>}</td>
          <td className="num">{f.count}{isWeek&&f.paidCount?<small>{f.paidCount} released</small>:null}</td>
          <td className="num"><Amount m={f.asked}/></td><td className="num"><Amount m={f.paid}/></td>
          {!isWeek&&<td className="num"><Amount m={f.process}/></td>}<td className="num">{f.rejected||"—"}</td>
          <td className="bd-rep"><button type="button" className="bd-rep-btn" onClick={e=>{e.stopPropagation();downloadOne(g)}}
            title={`Download every request for ${g.label}, with its totals`} aria-label={`Download the report for ${g.label}`}><Download/>Report</button></td></tr>,
        on&&<tr key={g.key+":list"} className="bd-list-row"><td colSpan={isWeek?6:7}><table className="bd-list"><thead><tr><th>REQUEST</th><th>RAISED</th>{isWeek&&<th>RELEASED</th>}<th>VENDOR</th><th>NATURE</th><th>DEPARTMENT</th><th className="num">AMOUNT</th><th>STATUS</th></tr></thead>
          <tbody>{list.map(p=><tr key={p.id} onClick={e=>{e.stopPropagation();open(p)}} title="Open this request">
            <td><b>{p.requestNo}</b>{tab.id!=="project"&&jobOf(p)?<small>{jobOf(p)}</small>:null}</td><td>{dayOf(p.createdAt)?fmtDay(dayOf(p.createdAt)):"—"}</td>
            {isWeek&&<td>{isReleased(p)&&dayOf(p.releasedAt)?fmtDay(dayOf(p.releasedAt)):"—"}</td>}
            <td>{p.vendor||"—"}</td><td>{p.nature||"—"}</td><td>{p.department||"—"}</td>
            <td className="num">{one((p.currency||"INR").toUpperCase(),Number(p.amount)||0)}</td>
            <td><span className={`badge ${isRejected(p)?"red":isReleased(p)?"green":"amber"}`}>{p.status}</span>
              {isPartPaid(p)&&<small>Paid {one((p.currency||"INR").toUpperCase(),paidOf(p))} · {one((p.currency||"INR").toUpperCase(),(Number(p.amount)||0)-paidOf(p))} left</small>}</td></tr>)}</tbody></table></td></tr>]})}</tbody>
    </table></div></div>}
  </div>}

/* ---------------- charts ----------------
   Above each tab's table: what the money looks like at a glance. Amounts are drawn in one
   currency at a time (picked when there is more than one), never added across currencies.
   Blue is money paid out, orange is money still to go; the share donut counts requests.
   Colours are the validated categorical slots; the lighter ones always sit beside a
   written value, and the table underneath holds every figure. */
const C={paid:"#2a78d6",open:"#eb6834",other:"#a3aca9",slots:["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#6250d6"]};
type Tip={x:number;y:number;title:string;lines:[string,string,string?][]}|null;

function useTip(){
  const[tip,setTip]=useState<Tip>(null);
  const at=(e:React.MouseEvent,t:Omit<NonNullable<Tip>,"x"|"y">)=>{
    const box=(e.currentTarget as HTMLElement).closest(".bd-chart")!.getBoundingClientRect();
    setTip({...t,x:e.clientX-box.left,y:e.clientY-box.top})};
  const view=tip&&<div className="bd-tip" style={{left:tip.x,top:tip.y}} role="status">
    <b>{tip.title}</b>{tip.lines.map(([k,v,c])=><span key={k}>{c&&<i style={{background:c}}/>}{k}<em>{v}</em></span>)}</div>;
  return{at,clear:()=>setTip(null),view}}

function CurrencyPick({list,value,set}:{list:string[];value:string;set:(c:string)=>void}){
  if(list.length<2)return <span className="bd-cur">{value}</span>;
  return <select className="bd-cur" value={value} onChange={e=>set(e.target.value)} aria-label="Currency shown in the chart">{list.map(c=><option key={c}>{c}</option>)}</select>}

const currenciesOf=(rows:Row[])=>{const n=new Map<string,number>();
  for(const p of live(rows)){const c=(p.currency||"INR").toUpperCase();n.set(c,(n.get(c)||0)+1)}
  return Array.from(n.entries()).sort((a,b)=>a[0]==="INR"?-1:b[0]==="INR"?1:b[1]-a[1]).map(([c])=>c)};
const inCur=(rows:Row[],c:string)=>rows.filter(p=>(p.currency||"INR").toUpperCase()===c).reduce((n,p)=>n+(Number(p.amount)||0),0);

function Charts({tab,groups,pick}:{tab:Tab;groups:Group[];pick:(key:string)=>void}){
  const named=groups.filter(g=>!g.last);
  const hidden=groups.filter(g=>g.last).reduce((n,g)=>n+g.rows.length,0);
  const byCount=tab.id==="currency";
  const curs=useMemo(()=>currenciesOf(named.flatMap(g=>g.rows)),[named]);
  const[cur,setCur]=useState("");const c=curs.includes(cur)?cur:curs[0]||"INR";
  if(!named.length)return null;
  if(tab.id==="weekly")return <div className="bd-charts one"><Weekly groups={named} cur={c} curs={curs} setCur={setCur} pick={pick}/></div>;
  return <div className="bd-charts">
    <TopBars tab={tab} groups={named} cur={c} curs={curs} setCur={setCur} byCount={byCount} pick={pick} hidden={hidden}/>
    {/* Hundreds of vendors make a share of "Other"; what the vendor payments are for reads better. */}
    {tab.id==="vendor"
      ?<Share tab={tab} groups={by(named.flatMap(g=>g.rows),p=>p.nature||"",k=>k,undefined,"Nature not given")} pick={()=>{}}
        title="What vendor payments are for" note="By nature of payment, number of requests, not counting rejected" hidden={0}/>
      :<Share tab={tab} groups={named} pick={pick} hidden={hidden}/>}</div>}

/* Top ten by money asked: released and still in process, stacked. */
function TopBars({tab,groups,cur,curs,setCur,byCount,pick,hidden}:{tab:Tab;groups:Group[];cur:string;curs:string[];setCur:(c:string)=>void;byCount:boolean;pick:(k:string)=>void;hidden:number}){
  const{at,clear,view}=useTip();
  const fmt=(n:number)=>byCount?`${n}`:one(cur,n);
  const bars=groups.map(g=>{const a=live(g.rows);const rel=a.filter(isReleased),pro=a.filter(p=>!isReleased(p));
      const mine=a.filter(p=>(p.currency||"INR").toUpperCase()===cur);
      const out=mine.reduce((n,p)=>n+paidOf(p),0),all=mine.reduce((n,p)=>n+(Number(p.amount)||0),0);
      return{g,paid:byCount?rel.length:out,open:byCount?pro.length:all-out}})
    .filter(b=>b.paid+b.open>0).sort((x,y)=>y.paid+y.open-(x.paid+x.open)).slice(0,10);
  const max=Math.max(1,...bars.map(b=>b.paid+b.open));
  const total=bars.length;
  return <section className="bd-chart" onMouseLeave={clear}>
    <header><div><h3>{byCount?"Requests by country":`Top ${total} by amount requested`}</h3>
      <p>{byCount?"Requests released and still in process (not counting rejected)":`In ${cur}, not counting rejected requests`}{hidden&&tab.id!=="currency"?` · ${hidden} request${hidden===1?"":"s"} with no ${tab.name.toLowerCase()} left out`:""}</p></div>
      {!byCount&&<CurrencyPick list={curs} value={cur} set={setCur}/>}</header>
    <div className="bd-legend"><span><i style={{background:C.paid}}/>Released</span><span><i style={{background:C.open}}/>In process</span></div>
    {!bars.length?<p className="bd-none">Nothing in {cur} here.</p>:
    <ul className="bd-bars">{bars.map(b=><li key={b.g.key}>
      <button type="button" onClick={()=>pick(b.g.key)} title={`Show ${b.g.label} in the table`}>
        <span className="bd-bar-label">{b.g.label}</span>
        <span className="bd-track" onMouseMove={e=>at(e,{title:b.g.label,lines:[["Released",fmt(b.paid),C.paid],["In process",fmt(b.open),C.open],[byCount?"Total requests":"Requested",fmt(b.paid+b.open)]]})}>
          {b.paid>0&&<i className="bd-seg" style={{width:`${b.paid/max*100}%`,background:C.paid}}/>}
          {b.open>0&&<i className="bd-seg" style={{width:`${b.open/max*100}%`,background:C.open}}/>}
        </span>
        <span className="bd-bar-val">{fmt(b.paid+b.open)}</span></button></li>)}</ul>}
    {view}</section>}

/* Share of requests: the five largest and everything else. */
function Share({tab,groups,pick,hidden,title,note}:{tab:Tab;groups:Group[];pick:(k:string)=>void;hidden:number;title?:string;note?:string}){
  const clickable=!title;
  const{at,clear,view}=useTip();
  const[hot,setHot]=useState("");
  const all=groups.map(g=>({key:g.key,label:g.label,n:live(g.rows).length})).filter(s=>s.n>0).sort((a,b)=>b.n-a.n);
  const top=all.slice(0,5),rest=all.slice(5).reduce((n,s)=>n+s.n,0);
  const slices=[...top.map((s,i)=>({...s,color:C.slots[i]})),...(rest?[{key:"",label:`Other (${all.length-5})`,n:rest,color:C.other}]:[])];
  const total=slices.reduce((n,s)=>n+s.n,0)||1;
  const pctOf=(n:number)=>{const v=n/total*100;return v>0&&v<1?"<1%":`${Math.round(v)}%`};
  const R=62,r=40,cx=70,cy=70;
  let a0=-Math.PI/2;
  const arc=(s:number,e:number)=>{const big=e-s>Math.PI?1:0,p=(t:number,rr:number)=>`${cx+rr*Math.cos(t)} ${cy+rr*Math.sin(t)}`;
    return`M${p(s,R)}A${R} ${R} 0 ${big} 1 ${p(e,R)}L${p(e,r)}A${r} ${r} 0 ${big} 0 ${p(s,r)}Z`};
  return <section className="bd-chart" onMouseLeave={()=>{clear();setHot("")}}>
    <header><div><h3>{title||"Share of requests"}</h3><p>{note||`By number of requests, not counting rejected${hidden&&tab.id!=="currency"?` · ${hidden} with no ${tab.name.toLowerCase()} left out`:""}`}</p></div></header>
    <div className="bd-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`Share of requests by ${tab.name.toLowerCase()}`}>
        {slices.length===1?<circle cx={cx} cy={cy} r={(R+r)/2} fill="none" stroke={slices[0].color} strokeWidth={R-r}/>:
        slices.map(s=>{const a1=a0+s.n/total*Math.PI*2;const d=arc(a0,a1);a0=a1;
          return <path key={s.key||"other"} d={d} fill={s.color} stroke="#fff" strokeWidth={2} opacity={hot&&hot!==s.label?.45:1}
            onMouseMove={e=>{setHot(s.label);at(e,{title:s.label,lines:[["Requests",`${s.n}`,s.color],["Share",pctOf(s.n)]]})}}
            onClick={()=>clickable&&s.key&&pick(s.key)} style={{cursor:clickable&&s.key?"pointer":"default"}}/>})}
        <text x={cx} y={cy-2} textAnchor="middle" className="bd-donut-n">{total}</text>
        <text x={cx} y={cy+13} textAnchor="middle" className="bd-donut-l">requests</text>
      </svg>
      <ul className="bd-keys">{slices.map(s=><li key={s.key||"other"} onMouseEnter={()=>setHot(s.label)} onMouseLeave={()=>setHot("")}>
        <button type="button" disabled={!clickable||!s.key} onClick={()=>s.key&&pick(s.key)}><i style={{background:s.color}}/><span>{s.label}</span>
          <em>{s.n} · {pctOf(s.n)}</em></button></li>)}</ul>
    </div>{view}</section>}

/* The last twelve weeks: asked for that week beside paid out that week. */
function Weekly({groups,cur,curs,setCur,pick}:{groups:Group[];cur:string;curs:string[];setCur:(c:string)=>void;pick:(k:string)=>void}){
  const{at,clear,view}=useTip();
  const weeks=groups.slice(0,12).reverse().map(g=>{const w=g as Group&{raised:Row[];paid:Row[]};
    return{g,asked:inCur(live(w.raised),cur),paid:inCur(w.paid,cur),start:g.key}});
  const max=Math.max(1,...weeks.flatMap(w=>[w.asked,w.paid]));
  const step=(()=>{const raw=max/4,mag=10**Math.floor(Math.log10(raw)),n=raw/mag;return(n<=1?1:n<=2?2:n<=5?5:10)*mag})();
  const top=Math.max(step,Math.ceil(max/step)*step);
  const ticks=Array.from({length:Math.round(top/step)+1},(_,i)=>i*step);
  return <section className="bd-chart" onMouseLeave={clear}>
    <header><div><h3>Requested and released, week by week</h3><p>Last {weeks.length} weeks in {cur}, Monday to Sunday · requested does not count rejected</p></div>
      <CurrencyPick list={curs} value={cur} set={setCur}/></header>
    <div className="bd-legend"><span><i style={{background:C.open}}/>Requested</span><span><i style={{background:C.paid}}/>Released</span></div>
    <div className="bd-cols">
      <div className="bd-axis">{[...ticks].reverse().map(t=><span key={t}>{one(cur,t).replace(/\.00 /," ")}</span>)}</div>
      <div className="bd-plot">
        {ticks.map(t=><i key={t} className="bd-grid" style={{bottom:`${t/top*100}%`}}/>)}
        {weeks.map(w=><button type="button" key={w.start} className="bd-week" onClick={()=>pick(w.g.key)}
          onMouseMove={e=>at(e,{title:w.g.label,lines:[["Requested",one(cur,w.asked),C.open],["Released",one(cur,w.paid),C.paid]]})}>
          <span className="bd-pair"><i style={{height:`${w.asked/top*100}%`,background:C.open}}/><i style={{height:`${w.paid/top*100}%`,background:C.paid}}/></span>
          <small>{fmtDay(w.start).slice(0,6)}</small></button>)}
      </div>
    </div>{view}</section>}
