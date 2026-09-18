"use client";
import{useState}from"react";
import{CheckCircle2,Clock3,Download,FileText,Plus,Search}from"lucide-react";
import{csv}from"./workforce-store";
import{Pager}from"./WorkforceShared";
import{STAGES,isFinished,stageIndex}from"../lib/payment-stages";

/* The requestor's own view. It carries the same columns as the accounts and audit queue
   so a request reads the same wherever it is seen - except the next action, which is an
   instruction to accounts or audit and none of the requestor's business. */

type P={id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;
  due:string;urgency:string;status:string;owner:string;department:string;
  nature?:string;tds?:string;poNumber?:string;createdAt?:string;
  lastActionBy?:string;lastActionNote?:string;lastActionAt?:string;
  rejectionNote?:string;resubmitNote?:string};

const statusTone=(s:string)=>/reject|query/i.test(s)?"red"
  :/released|approved|cleared/i.test(s)?"green"
  :/observation|correction|reconfirm/i.test(s)?"amber":"blue";

const PER_PAGE=10;

export default function RequestorWorkspace({rows,open,create}:{rows:P[];open:(p:P)=>void;create:()=>void}){
  const[offset,setOffset]=useState(0),[term,setTerm]=useState("");
  const q=term.trim().toLowerCase();
  /* The vendor is what the search is for, but somebody hunting "the ABC one" may just as
     easily remember the request number or the company, and being told "no match" because
     they typed the right thing in the wrong field would be the search's fault, not theirs. */
  const found=q?rows.filter(p=>[p.vendor,p.requestNo,p.company,p.department,p.nature||""]
    .some(v=>v.toLowerCase().includes(q))):rows;
  /* Clamped rather than used as given: if the list shortens under a reader who has paged
     forward - a search narrows it, a request is withdrawn - an unclamped offset would land
     past the end and show an empty table, which reads as "no requests" rather than as a
     stale page. Typing also returns to the first page, since the clamp alone would leave a
     reader on page three of a two-page result. */
  const start=Math.min(offset,Math.max(0,Math.floor((found.length-1)/PER_PAGE)*PER_PAGE));
  const mine=found.slice(start,start+PER_PAGE);
  /* Paging is truncation the reader did not ask for, so the report covers everything; a
     search is a narrowing they did ask for, so the report follows it. */
  const download=()=>csv([
    ["Request","Status","Stage","Company","Department","Vendor","Nature","TDS","PO number",
     "Currency","Amount","Due","Verified by","Remarks","Raised on"],
    ...found.map(p=>[p.requestNo,p.status,STAGES[stageIndex(p.status)],p.company,p.department,
      p.vendor,p.nature||"",p.tds||"",p.poNumber||"",p.currency,p.amount,p.due,
      p.lastActionBy||"",p.lastActionNote||p.rejectionNote||p.resubmitNote||"",
      (p.createdAt||"").slice(0,10)])],
    `my-payment-requests-${new Date().toISOString().slice(0,10)}.csv`);
  return <div className="page rq-page">
    <div className="rq-head"><div><small>PAYMENT REQUESTOR</small><h2>My payment requests</h2>
      <p>Create requests and track status. Accounts and Audit actions are not available in this view.</p></div>
      <button className="primary" onClick={create}><Plus/>Request payment</button></div>
    <div className="rq-metrics">
      <article><FileText/><b>{rows.length}</b><span>Total requests</span></article>
      <article><Clock3/><b>{rows.filter(x=>!isFinished(x.status)).length}</b><span>In progress</span></article>
      <article><CheckCircle2/><b>{rows.filter(x=>isFinished(x.status)).length}</b><span>Completed</span></article>
    </div>
    <section className="panel table-panel rq-table">
      <div className="panel-head"><div><small>STATUS TRACKER</small><h2>Your recent requests</h2></div>
        <button className="wf-small" onClick={download} disabled={!found.length}
          title={!rows.length?"You have not raised a request yet"
            :q?`Download the ${found.length} request${found.length===1?"":"s"} matching "${term.trim()}"`
            :`Download all ${rows.length} of your requests as a spreadsheet`}>
          <Download/>Download report</button></div>
      <div className="rq-tools"><label><Search/>
        <input value={term} onChange={e=>{setTerm(e.target.value);setOffset(0)}}
          placeholder="Search vendor, request number or company"/></label>
        {q&&<button className="rq-clear" onClick={()=>{setTerm("");setOffset(0)}}>
          Clear · {found.length} of {rows.length}</button>}</div>
      <div className="table-wrap"><table><thead><tr>
        <th>REQUEST</th><th>COMPANY / DEPT</th><th>VENDOR</th><th>AMOUNT</th><th>DUE</th>
        <th>VERIFIED BY</th><th>REMARKS</th><th>CURRENT STEP</th><th>STATUS TRACKER</th>
      </tr></thead>
      <tbody>{mine.map(p=><tr key={p.id} onClick={()=>open(p)}>
        <td><b>{p.requestNo}</b><small>{p.urgency} priority</small></td>
        <td>{p.company}<small>{p.department}</small></td>
        <td title={p.vendor}>{p.vendor}</td>
        <td><b>{p.currency} {p.amount.toLocaleString()}</b></td>
        <td>{p.due}</td>
        <td className="rq-actor">{p.lastActionBy||"—"}
          {p.lastActionAt&&<small>{new Date(p.lastActionAt).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</small>}</td>
        <td className="rq-remark" title={p.lastActionNote||p.rejectionNote||p.resubmitNote||""}>
          {p.lastActionNote||p.rejectionNote||p.resubmitNote||"—"}</td>
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
        <b>Nothing matches “{term.trim()}”</b>
        <span>Searches the vendor, request number, company, department and nature of your {rows.length} requests.</span></div>}</div>
      <Pager total={found.length} limit={PER_PAGE} offset={start} setOffset={setOffset}/>
    </section>
  </div>}
