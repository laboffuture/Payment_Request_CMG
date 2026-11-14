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

export const BREAKDOWN_ROLES=["Accountant","Auditor","Department Head","Administrator","Management"];

type Row={id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;status:string;
  department:string;nature?:string;jbCode?:string;projectCode?:string;project?:string;createdAt?:string;
  releasedAt?:string;due?:string};
type Group={key:string;label:string;sub?:string;rows:Row[];last?:boolean};

const isRejected=(p:Row)=>p.status==="Rejected"||p.status==="Audit Rejected";
const isReleased=(p:Row)=>p.status==="Payment Released"||p.status==="Expenses Booked";

/* Stored times are UTC ("2026-11-05 11:25:40" or ISO); weeks and months are India time. */
const when=(s?:string)=>{if(!s)return null;const t=new Date(s.includes("T")?s:s.replace(" ","T")+"Z").getTime();
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
const sum=(rows:Row[])=>{const m:Money=new Map();for(const p of rows){const c=(p.currency||"INR").toUpperCase();m.set(c,(m.get(c)||0)+(Number(p.amount)||0))}return m};
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

function weekly(rows:Row[]):(Group&{raised:Row[];paid:Row[]})[]{
  const m=new Map<string,{raised:Row[];paid:Row[]}>();
  const at=(w:string)=>m.get(w)||m.set(w,{raised:[],paid:[]}).get(w)!;
  for(const p of rows){const w=weekOf(p.createdAt);if(w)at(w).raised.push(p);
    if(isReleased(p)){const r=weekOf(p.releasedAt);if(r)at(r).paid.push(p)}}
  return Array.from(m.entries()).sort((a,b)=>b[0].localeCompare(a[0])).map(([w,g])=>{
    const end=new Date(new Date(w+"T00:00:00Z").getTime()+6*864e5).toISOString().slice(0,10);
    return{key:w,label:`${fmtDay(w)} – ${fmtDay(end)}`,rows:Array.from(new Set([...g.raised,...g.paid])),raised:g.raised,paid:g.paid}})}

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
    const raised=isWeek?w.raised!:g.rows,paid=isWeek?w.paid!:g.rows.filter(isReleased);
    const asked=live(raised);
    return{count:raised.length,asked:sum(asked),paid:sum(paid),paidCount:paid.length,
      process:sum(asked.filter(p=>!isReleased(p))),rejected:raised.filter(isRejected).length}};
  const download=()=>{
    const head=[tab.name,...(tab.id==="project"||tab.id==="recurring"?["Detail"]:[]),"Currency",isWeek?"Requests raised":"Requests",
      "Requested (not counting rejected)","Released",...(isWeek?[]:["In process"]),"Rejected requests"];
    const out:(string|number)[][]=[head];
    for(const g of shown){const f=figures(g);const cs=new Set([...f.asked.keys(),...f.paid.keys(),...f.process.keys()]);
      if(!cs.size)cs.add("");
      for(const c of order(new Map(Array.from(cs).map(c=>[c,0]))).map(([c])=>c))
        out.push([g.label,...(tab.id==="project"||tab.id==="recurring"?[g.sub||""]:[]),c,f.count,f.asked.get(c)||0,f.paid.get(c)||0,
          ...(isWeek?[]:[f.process.get(c)||0]),f.rejected])}
    const slug=tab.label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    csv(out,`dashboard-${slug}-${new Date().toISOString().slice(0,10)}.csv`)};
  return <div className="page bd-page">
    <div className="bd-head"><div><small>DASHBOARD · {tab.label.toUpperCase()}</small><h2>{tab.label}</h2><p>{tab.note}</p></div>
      <div className="bd-tools"><label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${tab.name.toLowerCase()}`} aria-label={`Search ${tab.name.toLowerCase()}`}/></label>
        <button className="bd-export" disabled={!shown.length} onClick={download} title={shown.length?"Download these figures to open in Excel":"Nothing to download"}><Download/>Download Excel</button></div></div>
    <p className="bd-count">{shown.length} {shown.length===1?"row":"rows"} · {covered} request{covered===1?"":"s"}</p>
    {!shown.length?<p className="queue-empty">{groups.length?"Nothing matches that search.":"No requests here yet."}</p>:
    <div className="panel table-panel bd-panel"><div className="table-wrap"><table className="bd-table">
      <thead><tr><th>{tab.name.toUpperCase()}</th><th className="num">{isWeek?"RAISED":"REQUESTS"}</th><th className="num">REQUESTED</th><th className="num">RELEASED</th>{!isWeek&&<th className="num">IN PROCESS</th>}<th className="num">REJECTED</th></tr></thead>
      <tbody>{shown.map(g=>{const f=figures(g);const on=openKey===g.key;
        const list=[...g.rows].sort((a,b)=>b.id-a.id);
        return[<tr key={g.key} className={`bd-group${on?" open":""}${g.last?" bd-muted":""}`} onClick={()=>setOpenKey(on?"":g.key)} aria-expanded={on}>
          <td><span className="bd-name">{on?<ChevronDown/>:<ChevronRight/>}<b>{g.label}</b></span>{g.sub&&<small>{g.sub}</small>}</td>
          <td className="num">{f.count}{isWeek&&f.paidCount?<small>{f.paidCount} released</small>:null}</td>
          <td className="num"><Amount m={f.asked}/></td><td className="num"><Amount m={f.paid}/></td>
          {!isWeek&&<td className="num"><Amount m={f.process}/></td>}<td className="num">{f.rejected||"—"}</td></tr>,
        on&&<tr key={g.key+":list"} className="bd-list-row"><td colSpan={isWeek?5:6}><table className="bd-list"><thead><tr><th>REQUEST</th><th>RAISED</th>{isWeek&&<th>RELEASED</th>}<th>VENDOR</th><th>NATURE</th><th>DEPARTMENT</th><th className="num">AMOUNT</th><th>STATUS</th></tr></thead>
          <tbody>{list.map(p=><tr key={p.id} onClick={e=>{e.stopPropagation();open(p)}} title="Open this request">
            <td><b>{p.requestNo}</b>{tab.id!=="project"&&jobOf(p)?<small>{jobOf(p)}</small>:null}</td><td>{dayOf(p.createdAt)?fmtDay(dayOf(p.createdAt)):"—"}</td>
            {isWeek&&<td>{isReleased(p)&&dayOf(p.releasedAt)?fmtDay(dayOf(p.releasedAt)):"—"}</td>}
            <td>{p.vendor||"—"}</td><td>{p.nature||"—"}</td><td>{p.department||"—"}</td>
            <td className="num">{one((p.currency||"INR").toUpperCase(),Number(p.amount)||0)}</td>
            <td><span className={`badge ${isRejected(p)?"red":isReleased(p)?"green":"amber"}`}>{p.status}</span></td></tr>)}</tbody></table></td></tr>]})}</tbody>
    </table></div></div>}
  </div>}
