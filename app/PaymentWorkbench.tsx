"use client";
import {AlertTriangle,CheckCircle2,CircleDollarSign,Clock3,Download,FileCheck2,Plus,Search,ShieldCheck,Trash2,WalletCards} from "lucide-react";
import {csv} from "./workforce-store";
import {useMemo,useState} from "react";
type Payment={id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;due:string;urgency:string;status:string;owner:string;department:string;nature?:string;tds?:string;projectCode?:string;invoiceNumber?:string;invoiceDate?:string;paymentTerms?:string;period?:string;lastActionBy?:string;lastActionNote?:string;lastActionAt?:string;rejectionNote?:string;resubmitNote?:string;poNumber?:string;raisedBy?:string;createdAt?:string};
const queues=[
 ["All","All requests"],["AccountsAvailable","Accounts available"],["AccountsMine","My Accounts tasks"],["AuditAvailable","Audit available"],["AuditMine","My Audit tasks"],["Observations","Audit observations"],["Recheck","Audit reconfirmation"],["Finance","Finance release"],["Closed","Completed"]
] as const;
const statusTone=(s:string)=>s.includes("Observation")||s.includes("Rejected")?"red":s.includes("Closed")||s.includes("Released")?"green":s.includes("Audit")?"blue":s.includes("Finance")?"violet":"amber";
export default function PaymentWorkbench({rows,role,search,setSearch,open,create,onDelete,departments=[],companies=[]}:{departments?:string[];companies?:string[];rows:Payment[];role:string;search:string;setSearch:(s:string)=>void;open:(p:Payment)=>void;create:()=>void;onDelete?:(p:Payment)=>void}){
 const[tab,setTab]=useState("All"),[department,setDepartment]=useState("All departments"),[company,setCompany]=useState("All companies"),[status,setStatus]=useState("All statuses"),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const match=(p:Payment)=>tab==="All"||tab==="AccountsAvailable"&&["Submitted","Requested"].includes(p.status)||tab==="AccountsMine"&&["Accountant Accepted","Accountant Review"].includes(p.status)||tab==="AuditAvailable"&&p.status==="Pre-Audit Queue"||tab==="AuditMine"&&p.status==="Audit Accepted"||tab==="Observations"&&p.status==="Observation – Accounts Action"||tab==="Recheck"&&p.status==="Audit Reconfirmation"||tab==="Finance"&&["Approved by Auditor – Ready to Release","Management Approval: Yes","Finance Queue"].includes(p.status)||tab==="Closed"&&["Audit Closed","Payment Released","Reconciliation"].includes(p.status);
 /* Every department and company on the registers, not just the ones the requests in
    view happen to carry - otherwise a filter can only ever choose what is already on
    screen. A value a request carries that is no longer on the register (an old
    "Projects") is kept at the end, so those requests can still be found. */
 const withRegister=(register:string[],used:string[])=>{
  const seen=new Set(register);
  return[...register,...Array.from(new Set(used.filter(Boolean))).filter(x=>!seen.has(x)).sort()]};
 const deptChoices=withRegister(departments,rows.map(p=>p.department));
 const companyChoices=withRegister(companies,rows.map(p=>p.company));
 const shown=useMemo(()=>rows.filter(p=>match(p)&&(department==="All departments"||p.department===department)&&(company==="All companies"||p.company===company)&&(status==="All statuses"||p.status===status)&&(!from&&!to||!!p.due&&(!from||p.due>=from)&&(!to||p.due<=to))),[rows,tab,department,company,status,from,to]);
 const download=()=>{
  const head=["Request","Status","Company","Department","Vendor","Nature","TDS","PO number","Project code","Invoice","Invoice date","Payment terms","Period",
    "Currency","Amount","Due","Urgency","Owner","Raised by","Raised on","Verified by","Remarks"];
  const body=shown.map(p=>[p.requestNo,p.status,p.company,p.department,p.vendor,p.nature||"",p.tds||"",
    p.poNumber||"",p.projectCode||"",p.invoiceNumber||"",p.invoiceDate||"",
    p.paymentTerms||"",p.period||"",p.currency,p.amount,p.due,p.urgency,p.owner,p.raisedBy||"",
    (p.createdAt||"").slice(0,10),p.lastActionBy||"",p.lastActionNote||p.rejectionNote||p.resubmitNote||""]);
  const total=shown.reduce((n,p)=>n+(Number(p.amount)||0),0);
  /* Currencies are mixed in these queues, so the total is only meaningful when one
     is in play - otherwise the figure would silently add dirhams to rupees. */
  const only=Array.from(new Set(shown.map(p=>p.currency)));
  const foot=only.length===1?[[],["","","","","","","","","","","","","",only[0],total,"","","","","","",""]]:[];
  const queue=(queues.find(([k])=>k===tab)||["","All requests"])[1];
  const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const span=from||to?`-due-${from||"start"}-to-${to||"end"}`:"";
  const picked=(company==="All companies"?"":"-"+slug(company))+(status==="All statuses"?"":"-"+slug(status));
  csv([head,...body,...foot],
    `payments-${slug(queue)}${department==="All departments"?"":"-"+slug(department)}${picked}${span}-${new Date().toISOString().slice(0,10)}.csv`);
 };
 const counts={accounts:rows.filter(p=>["Submitted","Requested"].includes(p.status)).length,audit:rows.filter(p=>p.status==="Pre-Audit Queue").length,obs:rows.filter(p=>p.status==="Observation – Accounts Action").length,recheck:rows.filter(p=>p.status==="Audit Reconfirmation").length,finance:rows.filter(p=>["Approved by Auditor – Ready to Release","Management Approval: Yes","Finance Queue"].includes(p.status)).length};
 return <div className="page payment-workbench">
  <div className="wb-head"><div><small>{role==="Accountant"?"ACCOUNTS DEPARTMENT WORKSPACE":role==="Auditor"?"AUDIT DEPARTMENT WORKSPACE":"END-TO-END PAYMENT CONTROL"}</small><h2>{role==="Accountant"?"Accounts payment queue":role==="Auditor"?"Audit payment queue":"Accounts & Audit workbench"}</h2><p>Work department-wise while retaining read-only visibility of every payment.</p></div><div><span className="wb-role"><ShieldCheck/>{role} view</span></div></div>
  <div className="wb-kpis">
   <article><WalletCards/><span><b>{counts.accounts}</b><small>Accounts to verify</small></span></article>
   <article><ShieldCheck/><span><b>{counts.audit}</b><small>Audit queue</small></span></article>
   <article className={counts.obs?"danger":""}><AlertTriangle/><span><b>{counts.obs}</b><small>Corrections open</small></span></article>
   <article><FileCheck2/><span><b>{counts.recheck}</b><small>Audit rechecks</small></span></article>
   <article><CircleDollarSign/><span><b>{counts.finance}</b><small>Ready for Finance</small></span></article>
  </div>
  <section className="wb-flow"><div className="done"><i><CheckCircle2/></i><b>Request</b><span>Documents uploaded</span></div><div><i>2</i><b>Accounts</b><span>Match & reconcile</span></div><div><i>3</i><b>Audit</b><span>Verify or observe</span></div><div><i>4</i><b>Correction</b><span>Fix with proof</span></div><div><i>5</i><b>Recheck</b><span>Audit confirms</span></div><div><i>6</i><b>Finance</b><span>Release after approval</span></div></section>
  <section className="panel wb-panel"><div className="wb-tabs">{queues.map(([k,n])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{n}{k==="Observations"&&counts.obs>0?<i>{counts.obs}</i>:null}</button>)}</div><div className="wb-tools"><label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search request, company or vendor"/></label><select value={department} onChange={e=>setDepartment(e.target.value)}><option>All departments</option>{deptChoices.map(d=><option key={d}>{d}</option>)}</select><select value={company} onChange={e=>setCompany(e.target.value)}><option>All companies</option>{companyChoices.map(c=><option key={c}>{c}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{Array.from(new Set(rows.map(p=>p.status))).filter(Boolean).sort().map(x=><option key={x}>{x}</option>)}</select><label className="wb-range" title="Filters on the due date shown in the table"><span>Due</span><input type="date" value={from} max={to||undefined} onChange={ev=>setFrom(ev.target.value)} aria-label="Due from"/><i>to</i><input type="date" value={to} min={from||undefined} onChange={ev=>setTo(ev.target.value)} aria-label="Due to"/>{(from||to)&&<button type="button" className="wb-range-clear" title="Clear the date range" onClick={()=>{setFrom("");setTo("")}}>×</button>}</label><button className="wb-export" onClick={download} disabled={!shown.length} title={shown.length?`Download these ${shown.length} requests as a spreadsheet`:"There is nothing in this queue to download"}><Download/>Download report</button></div>
   <div className="table-wrap"><table><thead><tr><th>REQUEST</th><th>COMPANY / DEPT</th><th>VENDOR</th><th>AMOUNT</th><th>DUE</th><th>VERIFIED BY</th><th>REMARKS</th><th>CURRENT STEP</th><th>NEXT ACTION</th></tr></thead><tbody>{shown.map(p=><tr key={p.id} onClick={()=>open(p)}><td><b>{p.requestNo}</b><small>{p.urgency} priority</small></td><td>{p.company}<small>{p.department}</small></td><td title={p.vendor}>{p.vendor}</td><td><b>{p.currency} {p.amount.toLocaleString()}</b></td><td>{p.due}</td><td className="wb-actor">{p.lastActionBy||"—"}
              {p.lastActionAt&&<small>{new Date(p.lastActionAt).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</small>}</td>
            <td className="wb-remark" title={p.lastActionNote||p.rejectionNote||p.resubmitNote||""}>
              {p.lastActionNote||p.rejectionNote||p.resubmitNote||"—"}</td>
            <td><span className={`badge ${statusTone(p.status)}`}>{p.status}</span></td><td><div className="wb-row-actions"><Next status={p.status}/>{role==="Administrator"&&onDelete&&<button className="wb-delete" title="Delete this request" onClick={e=>{e.stopPropagation();onDelete(p)}}><Trash2/></button>}</div></td></tr>)}</tbody></table>{!shown.length&&<div className="wb-empty"><CheckCircle2/><b>No items in this queue</b><span>There is nothing requiring action here.</span></div>}</div>
  </section>
 </div>
}
function Next({status}:{status:string}){let text="Open request";if(["Submitted","Requested","Accountant Review"].includes(status))text="Accounts: accept & verify";else if(status==="Pre-Audit Queue")text="Audit: accept";else if(status==="Audit Accepted")text="Audit: verify checklist";else if(status==="Observation – Accounts Action")text="Accounts: fix & add proof";else if(status==="Audit Reconfirmation")text="Audit: reconfirm & approve";else if(["Approved by Auditor – Ready to Release","Management Approval: Yes","Finance Queue"].includes(status))text="Finance: approved & ready to release";return <button className="wb-next">{text}</button>}
