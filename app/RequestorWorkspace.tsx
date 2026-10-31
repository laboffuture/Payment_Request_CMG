"use client";
import{matchesPayment}from"../lib/payment-search";
import{useState}from"react";
import{CheckCircle2,Clock3,Download,FileText,Plus,Search}from"lucide-react";
import{stamp}from"../lib/stamp";
import{csv}from"./workforce-store";
import{paymentReport}from"../lib/payment-report";
import type{ReportRow}from"../lib/payment-report";
import{Pager}from"./WorkforceShared";
import{STAGES,isFinished,stageIndex}from"../lib/payment-stages";

/* The requestor's own view. It carries the same columns as the accounts and audit queue
   so a request reads the same wherever it is seen - except the next action, which is an
   instruction to accounts or audit and none of the requestor's business. */

type P={deptPriority?:string;deptPriorityBy?:string;id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;
  due:string;urgency:string;status:string;owner:string;department:string;
  nature?:string;tds?:string;poNumber?:string;createdAt?:string;
  lastActionBy?:string;lastActionNote?:string;latestRemark?:string;latestRemarkBy?:string;lastActionAt?:string;
  rejectionNote?:string;resubmitNote?:string};

const statusTone=(s:string)=>s==="Query Raised"||s==="Audit Query"?"amber":/reject|query/i.test(s)?"red"
  :/released|approved|cleared|booked/i.test(s)?"green"
  :/observation|correction|reconfirm/i.test(s)?"amber":"blue";

const PER_PAGE=10;

/* The local calendar day a request was raised, as YYYY-MM-DD for the date boxes. Stored in
   UTC, so a request raised before 5:30 in the morning in India would otherwise fall on the
   day before. */
const dayOf=(v?:string)=>{
  if(!v)return"";
  const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v)?v:v.replace(" ","T")+"Z");
  if(isNaN(+d))return"";
  return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const shortDay=(v:string)=>new Date(v+"T00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});

export default function RequestorWorkspace({rows,open,create,scope="own"}:{rows:P[];open:(p:P)=>void;create:()=>void;scope?:"own"|"department"}){
  /* A department head is shown his department's requests, so the headings cannot keep
     saying "my" and "your" over other people's work. */
  const dept=scope==="department";
  const[offset,setOffset]=useState(0),[term,setTerm]=useState("");
  const[from,setFrom]=useState(""),[to,setTo]=useState("");
  const q=term.trim().toLowerCase();
  const dated=!!(from||to);
  /* The vendor is what the search is for, but somebody hunting "the ABC one" may just as
     easily remember the request number or the company, and being told "no match" because
     they typed the right thing in the wrong field would be the search's fault, not theirs. */
  /* The dates are the day the request was raised, both ends included. */
  const found=rows.filter(p=>{
    if(q&&!matchesPayment(p,q))return false;
    if(!dated)return true;
    const day=dayOf(p.createdAt);
    return!!day&&(!from||day>=from)&&(!to||day<=to)});
  const narrowed=!!q||dated;
  const range=dated?(from&&to?`${shortDay(from)} to ${shortDay(to)}`:from?`from ${shortDay(from)}`:`up to ${shortDay(to)}`):"";
  /* Clamped rather than used as given: if the list shortens under a reader who has paged
     forward - a search narrows it, a request is withdrawn - an unclamped offset would land
     past the end and show an empty table, which reads as "no requests" rather than as a
     stale page. Typing also returns to the first page, since the clamp alone would leave a
     reader on page three of a two-page result. */
  const start=Math.min(offset,Math.max(0,Math.floor((found.length-1)/PER_PAGE)*PER_PAGE));
  const mine=found.slice(start,start+PER_PAGE);
  /* Paging is truncation the reader did not ask for, so the report covers everything; a
     search is a narrowing they did ask for, so the report follows it. */
  /* Every field of the requests, the same columns as the accounts report. */
  const download=()=>csv(paymentReport(found as unknown as ReportRow[]),
    `my-payment-requests-${new Date().toISOString().slice(0,10)}.csv`);
  return <div className="page rq-page">
    <div className="rq-head"><div><small>{dept?"DEPARTMENT HEAD":"PAYMENT REQUESTOR"}</small>
      <h2>{dept?"My department's payment requests":"My payment requests"}</h2>
      <p>{dept
        ?"Every request raised by your department, and your own. Accounts and Audit actions are not available in this view."
        :"Create requests and track status. Accounts and Audit actions are not available in this view."}</p></div>
      <button className="primary" onClick={create}><Plus/>Request payment</button></div>
    <div className="rq-metrics">
      <article><FileText/><b>{rows.length}</b><span>Total requests</span></article>
      <article><Clock3/><b>{rows.filter(x=>!isFinished(x.status)).length}</b><span>In progress</span></article>
      <article><CheckCircle2/><b>{rows.filter(x=>isFinished(x.status)).length}</b><span>Completed</span></article>
    </div>
    <section className="panel table-panel rq-table">
      <div className="panel-head"><div><small>STATUS TRACKER</small>
        <h2>{dept?"Recent requests in your department":"Your recent requests"}</h2></div>
        <button className="wf-small" onClick={download} disabled={!found.length}
          title={!rows.length?(dept?"Your department has not raised a request yet":"You have not raised a request yet")
            :narrowed?`Download the ${found.length} request${found.length===1?"":"s"} ${[q&&`matching "${term.trim()}"`,range&&`raised ${range}`].filter(Boolean).join(", ")}`
            :`Download all ${rows.length} ${dept?"of your department's requests":"of your requests"} as a spreadsheet`}>
          <Download/>Download report</button></div>
      <div className="rq-tools"><label><Search/>
        <input value={term} onChange={e=>{setTerm(e.target.value);setOffset(0)}}
          placeholder="Search vendor, request number, company or amount"/></label>
        <span className="rq-dates" title="The day the request was raised">
          <label>From<input type="date" value={from} max={to||undefined}
            onChange={e=>{setFrom(e.target.value);setOffset(0)}}/></label>
          <label>To<input type="date" value={to} min={from||undefined}
            onChange={e=>{setTo(e.target.value);setOffset(0)}}/></label></span>
        {narrowed&&<button className="rq-clear" onClick={()=>{setTerm("");setFrom("");setTo("");setOffset(0)}}>
          Clear · {found.length} of {rows.length}</button>}</div>
      <div className="table-wrap"><table><thead><tr>
        <th>REQUEST</th><th>COMPANY / DEPT</th><th>VENDOR</th><th>AMOUNT</th><th>DUE</th>
        <th>VERIFIED BY</th><th>REMARKS</th><th>CURRENT STEP</th><th>STATUS TRACKER</th>
      </tr></thead>
      <tbody>{mine.map(p=><tr key={p.id} onClick={()=>open(p)}>
        <td><b>{p.requestNo}</b>{p.deptPriority?<small><span className={`badge ${p.deptPriority.toLowerCase()}`} title={`Priority set by the department head${p.deptPriorityBy?` (${p.deptPriorityBy})`:""}`}>{p.deptPriority}</span></small>:<small>{p.urgency} priority</small>}{p.createdAt&&<small className="req-when" title="Requested on">{stamp(p.createdAt)}</small>}</td>
        <td>{p.company}<small>{p.department}</small></td>
        <td title={p.vendor}>{p.vendor}</td>
        <td><b>{p.currency} {p.amount.toLocaleString()}</b></td>
        <td>{p.due}</td>
        <td className="rq-actor">{p.lastActionBy||"—"}
          {p.lastActionAt&&<small>{new Date(p.lastActionAt).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</small>}</td>
        <td className="rq-remark" title={p.lastActionNote||p.latestRemark||p.rejectionNote||p.resubmitNote||""}>
          {p.lastActionNote||p.latestRemark||p.rejectionNote||p.resubmitNote||"—"}</td>
        <td><span className={`badge ${statusTone(p.status)}`}>{p.status}</span></td>
        <td><div className="stage-track" title={`${STAGES[stageIndex(p.status)]} — step ${stageIndex(p.status)+1} of ${STAGES.length}`}>
          {STAGES.map((st,i)=><i key={st} className={i<=stageIndex(p.status)?"on":""}/>)}
          <small>{STAGES[stageIndex(p.status)]}</small></div></td>
      </tr>)}</tbody></table>
      {/* Two different emptinesses. Keyed off the whole register, not the page, because an
          empty page is a paging fault; and a search that matched nothing must never say "no
          requests yet" to somebody holding twenty of them. */}
      {!rows.length&&<div className="wb-empty"><FileText/><b>No requests yet</b>
        <span>Use Request payment to raise your first one.</span></div>}
      {!!rows.length&&!found.length&&<div className="wb-empty"><Search/>
        <b>{q?`Nothing matches “${term.trim()}”${range?` raised ${range}`:""}`:`No requests raised ${range}`}</b>
        <span>{q?`Searches the vendor, request number, company, department and nature of your ${rows.length} requests.`
          :"Widen the dates, or clear them to see every request."}</span></div>}</div>
      <Pager total={found.length} limit={PER_PAGE} offset={start} setOffset={setOffset}/>
    </section>
  </div>}
