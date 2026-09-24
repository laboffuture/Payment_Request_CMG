"use client";
import{STAGES as stages,stageIndex}from"../lib/payment-stages";
import{FIELD_ORDER,labelFor,ruleFor}from"../lib/payment-fields";
import type{FieldKey}from"../lib/payment-fields";
import{useEffect,useMemo,useState}from"react";
import{AlertTriangle,Check,Clock3,FileCheck2,HelpCircle,Paperclip,ShieldCheck,X}from"lucide-react";
import Attachments from"./Attachments";
import{distinct,jobFor}from"../lib/jobs";
import type{Job}from"../lib/jobs";
type Payment={projectCode?:string;invoiceNumber?:string;invoiceDate?:string;paymentTerms?:string;period?:string;extra?:string;tds?:string;nature?:string;poNumber?:string;resubmitNote?:string;resubmittedAt?:string;rejectionNote?:string;rejectedBy?:string;rejectedAt?:string;raisedBy?:string;tdsPercent?:string;tdsValue?:string;
  /* The note left by whoever moved the request last. This panel declares its own Payment
     type rather than sharing page.tsx's, so a field added there does not arrive here. */
  lastActionNote?:string;id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;due:string;urgency:string;status:string;owner:string;department:string};
/* The badge was hardcoded blue, so a rejected request looked the same as one in
   progress. Colour follows the status. */
const statusTone=(s:string)=>s==="Query Raised"?"amber":/reject|query/i.test(s)?"red"
  :/released|approved|cleared/i.test(s)?"green"
  :/observation|correction|reconfirm/i.test(s)?"amber":"blue";
/* One row of the trail. Status changes are logged as "<status> — <remark>"; a corrected
   field carries its old and new value instead. */
type Entry={id:number;action:string;actor:string;previousValue:string;newValue:string;createdAt:string};
const readEntry=(e:Entry)=>{
  const cut=e.newValue.indexOf(" — ");
  const status=cut<0?e.newValue:e.newValue.slice(0,cut);
  const remark=cut<0?"":e.newValue.slice(cut+3).trim();
  const field=e.action.startsWith("Corrected ")&&e.action!=="Corrected and resubmitted";
  return{...e,status,remark,field}};
/* SQLite's CURRENT_TIMESTAMP is UTC without a zone, which a browser reads as local time. */
const when=(v:string)=>{
  const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v)?v:v.replace(" ","T")+"Z");
  return isNaN(+d)?v:d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})};
const stamp=(v:string)=>v?new Date(v).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"";

export default function PaymentDetail({payment:p,role,onClose,onAction,onDelete,userEmail="",companies=[],departments=[],natures=[],currencies=[],tdsChoices=[],termsChoices=[],modeChoices=[],jobs=[]}:{payment:Payment;role:string;onClose:()=>void;onAction:(s:string,note?:string,fields?:Record<string,string>)=>void;onDelete?:()=>void;userEmail?:string;companies?:{id:string;name:string}[];departments?:string[];natures?:string[];currencies?:string[];tdsChoices?:string[];termsChoices?:string[];modeChoices?:string[];jobs?:Job[]}){
 const accountQueue=["Submitted","Requested"].includes(p.status),accountWork=["Accountant Accepted","Accountant Review"].includes(p.status),auditQueue=p.status==="Pre-Audit Queue",auditWork=p.status==="Audit Accepted",correction=p.status==="Observation - Audit Action",recheck=p.status==="Audit Reconfirmation",approved=p.status==="Approved by Auditor – Ready to Release",released=p.status==="Payment Released";
 const[sendBack,setSendBack]=useState<""|"query"|"reject">(""),[remark,setRemark]=useState(""),[fixing,setFixing]=useState(false),[fixNote,setFixNote]=useState(""),[stageNote,setStageNote]=useState(""),[checks,setChecks]=useState<Record<string,boolean>>({}),[observation,setObservation]=useState("Supporting documents do not reconcile with the ledger balance."),[proof,setProof]=useState("");
 const active=useMemo(()=>stageIndex(p.status),[p.status]);
 /* The request's real trail. Every decision is logged with who took it and the remark
    they gave; this panel used to show three fixed lines describing a trail instead, so an
    auditor opening a request could not see what accounts had written about it. Re-read
    whenever the status moves, since each move adds a row. */
 const[history,setHistory]=useState<Entry[]>([]);
 useEffect(()=>{
   let dead=false;
   fetch(`/api/payments?history=${encodeURIComponent(String(p.id))}`)
     .then(r=>r.ok?r.json() as Promise<{history?:Entry[]}>:{history:[]})
     .then(b=>{if(!dead)setHistory(b.history||[])}).catch(()=>{});
   return()=>{dead=true}},[p.id,p.status]);
 const remarks=history.map(readEntry).filter(e=>e.remark).reverse();
 /* Seeded from the request itself when the correction form opens, so a field nobody
    touches resubmits exactly as it was rather than as an empty string. */
 const[edit,setEdit]=useState<Record<string,string>>({});
 const startFix=()=>{
   const seed:Record<string,string>={};
   for(const k of FIELD_ORDER)seed[k]=String((p as unknown as Record<string,unknown>)[k]??"");
   setEdit(seed);setFixing(true)};
 /* The same rules the original form applied. The server checks them again - this only
    stops the reader sending something it already knows will be refused. */
 /* Asked of the fields this form actually draws, not of every field in the model. It used
    to check all of them while the form skipped description - so a request saved without
    one could never be resubmitted: the button stayed disabled and there was nothing on
    screen to fill in. PAY-2026-1079 was in exactly that state. A readiness check must only
    demand what it also offers. */
 const fixShows=(k:FieldKey)=>ruleFor(edit.nature||"",k)!=="H";
 const fixMissing=FIELD_ORDER.filter(fixShows)
   .filter(k=>ruleFor(edit.nature||"",k)==="M"&&!String(edit[k]||"").trim());
 const fixReady=!fixMissing.length;
 /* Who may correct a returned request is a question of identity, not of which role the
    reader happens to have selected. The server allows it only for the person who raised
    it - not even an administrator - so gating this on a role showed the form to people
    whose submission the server would refuse, and hid it from the owner whenever their
    first role was not Requestor. It now asks exactly what the server asks. */
 const mayCorrect=!!p.raisedBy&&p.raisedBy===userEmail;
 /* Each stage belongs to one role. An administrator or audit head may also act, so a
    request is never stuck because the responsible person is unavailable. */
 const can=(r:string)=>role===r||role==="Administrator"||role==="Audit Head";
 /* Two ways back to the requestor. A query returns the request to be corrected and
    resubmitted; a rejection closes it for good, and a new request is raised instead. Both
    have to say why, so each button opens a remark box rather than acting immediately. */
 const rejectForm=()=>sendBack
   ?<div className="wf-reject-form">
      <label className="wf-note">{sendBack==="query"
          ?"What does the requestor need to correct?"
          :"Why is this request being rejected?"}
        <textarea autoFocus value={remark} onChange={e=>setRemark(e.target.value)}
          placeholder={sendBack==="query"
            ?"Which figure is wrong, or which document is wrong or missing? The requestor corrects it and resubmits."
            :"The request is closed and cannot be resubmitted. If the payment is still needed, the requestor raises a new one."}/></label>
      <div className="wf-actions">
        <button onClick={()=>{setSendBack("");setRemark("")}}>Cancel</button>
        {sendBack==="query"
          ?<button className="wf-query" disabled={remark.trim().length<5}
             onClick={()=>onAction("Query Raised",remark.trim())}><HelpCircle/>Send query to requestor</button>
          :<button className="wf-reject" disabled={remark.trim().length<5}
             onClick={()=>onAction("Rejected",remark.trim())}><X/>Reject and close</button>}
      </div>
    </div>
   :<><button className="wf-query" onClick={()=>setSendBack("query")}
        title="Return to the requestor to correct and resubmit"><HelpCircle/>Query</button>
      <button className="wf-reject" onClick={()=>setSendBack("reject")}
        title="Close the request. The requestor must raise a new one"><X/>Reject</button></>;
 /* Every decision can carry a remark. It is optional here - only a rejection or a
    resubmission demands one - and it goes into the audit trail beside the status so
    the record says why, not just what. */
 const noteBox=(label:string,hint:string)=><label className="wf-note">{label}
   <textarea value={stageNote} onChange={e=>setStageNote(e.target.value)} placeholder={hint}/></label>;
 const withNote=()=>stageNote.trim()||undefined;

 /* TDS is an accounts determination, not something a requestor asserts, which is why it
    left the request form and arrives here instead. Whatever the requestor answered before
    is carried in as the starting value rather than discarded: the requests already in the
    queue then cost a confirmation rather than fresh data entry. */
 const[tdsOn,setTdsOn]=useState(p.tds||"");
 const[tdsPct,setTdsPct]=useState(p.tdsPercent||"");
 const[tdsVal,setTdsVal]=useState(p.tdsValue||"");
 /* Both figures are typed. The value was calculated from the amount and the rate at
    first, which assumed the two always agree - they do not. A rate can be applied to part
    of an invoice, rounded to the rupee, or set by an assessment that owes nothing to the
    amount on the request. Accounts enter what they are actually deducting. */
 /* An unanswered question becomes "No" by the time anybody notices, and no later stage
    asks again - so the answer is required before the request moves on. */
 const tdsReady=tdsOn==="No"||(tdsOn==="Yes"&&!!String(tdsPct).trim()&&!!String(tdsVal).trim());
 const tdsFields=()=>tdsOn==="Yes"
   ?{tds:"Yes",tdsPercent:String(tdsPct).trim(),tdsValue:String(tdsVal).trim()}
   :{tds:"No",tdsPercent:"",tdsValue:""};
 const tdsBox=<div className="wf-tds">
   <label className="wf-note">TDS applicable
     <select value={tdsOn} onChange={e=>{const v=e.target.value;setTdsOn(v);
       if(v!=="Yes"){setTdsPct("");setTdsVal("")}}}>
       <option value="">— choose —</option><option>Yes</option><option>No</option></select></label>
   {tdsOn==="Yes"&&<div className="wf-tds-pair">
     <label className="wf-note">TDS percentage
       <input type="number" min="0" max="100" step="0.01" value={tdsPct}
         onChange={e=>setTdsPct(e.target.value)}/></label>
     <label className="wf-note">TDS value ({p.currency})
       <input type="number" min="0" step="0.01" value={tdsVal}
         onChange={e=>setTdsVal(e.target.value)}/></label></div>}
 </div>;
 const toggle=(k:string)=>setChecks(v=>({...v,[k]:!v[k]})),complete=(ks:string[])=>ks.every(k=>checks[k]);
 const accountKeys=["PO / Invoice / DO matched","Balance reconciled"],auditKeys=["Documents verified","GL posting correct","Balance reconciled"];
 const list=(ks:string[])=><div className="wf-checks">{ks.map(k=><label key={k} className={checks[k]?"done":""}><input type="checkbox" checked={!!checks[k]} onChange={()=>toggle(k)}/><span>{checks[k]?<Check/>:null}</span><b>{k}</b></label>)}</div>;
 let action=<div className="wf-callout"><Clock3/>This request is visible to you. Switch to its responsible role to perform the next action.</div>;
 if(accountQueue&&can("Accountant"))action=<>{p.resubmitNote&&<div className="wf-success wf-reply"><Check/><div><small>CORRECTED AND RESUBMITTED</small><b>{p.resubmitNote}</b><span>{p.rejectionNote?`Returned for: ${p.rejectionNote}`:""}{p.resubmittedAt?` · ${stamp(p.resubmittedAt)}`:""}</span></div></div>}<div className="wf-callout"><Clock3/>Available in the common Accounts queue.</div>{noteBox("Remarks (optional)","Anything worth recording with this decision")}<div className="wf-actions">{rejectForm()}<button className="wf-primary" onClick={()=>onAction("Accountant Accepted",withNote())}><Check/>Accept to Start</button></div></>;
 if(accountWork&&can("Accountant"))action=<>{list(accountKeys)}{noteBox("Issues fixed / accountant note","Record issues and how they were fixed")}{tdsBox}<div className="wf-actions">{rejectForm()}<button className="wf-primary" disabled={!complete(accountKeys)||!tdsReady} title={tdsReady?"":"Say whether TDS applies first"} onClick={()=>onAction("Pre-Audit Queue",withNote(),tdsFields())}>Send to Audit</button></div></>;
 if(auditQueue&&can("Auditor"))action=<><div className="wf-callout"><ShieldCheck/>Available in the common Audit queue.</div>{noteBox("Remarks (optional)","Anything worth recording with this decision")}<div className="wf-actions">{rejectForm()}<button className="wf-primary" onClick={()=>onAction("Audit Accepted",withNote())}><Check/>Accept to Start</button></div></>;
 if(auditWork&&can("Auditor"))action=<>{list(auditKeys)}<label className="wf-note">Audit observation<textarea value={observation} onChange={e=>setObservation(e.target.value)}/></label><div className="wf-actions"><button className="wf-reject" onClick={()=>onAction("Observation - Audit Action",observation.trim()||undefined)}><AlertTriangle/>Raise observation to Accounts</button>{rejectForm()}<button className="wf-primary" disabled={!complete(auditKeys)} onClick={()=>onAction("Approved by Auditor – Ready to Release",withNote())}>Approve for release</button></div></>;
 if(correction&&can("Accountant"))action=<><div className="wf-observation"><AlertTriangle/><div><small>AUDIT OBSERVATION RECEIVED</small><b>OBS-{Math.abs(p.id)+300}</b><p>{p.lastActionNote||"No observation was recorded."}</p><span>Assigned to Accounts · Due in 2 days</span></div></div>{noteBox("Accountant response","Explain what was corrected")}<label className="wf-proof"><Paperclip/>Upload correction proof<input type="file" onChange={e=>setProof(e.target.files?.[0]?.name||"")}/>{proof&&<b>{proof}</b>}</label>{noteBox("Remarks (optional)","Anything worth recording with the release")}<div className="wf-actions">{rejectForm()}<button className="wf-primary" disabled={!proof} onClick={()=>onAction("Audit Reconfirmation",withNote())}>Respond with Proof</button></div></>;
 if(recheck&&can("Auditor"))action=<><div className="wf-callout"><FileCheck2/>Accounts responded with correction proof. Reconfirm before approval.</div>{list(auditKeys)}<div className="wf-actions"><button className="wf-reject" onClick={()=>onAction("Observation - Audit Action")}>Return Again</button>{rejectForm()}<button className="wf-primary" disabled={!complete(auditKeys)} onClick={()=>onAction("Approved by Auditor – Ready to Release")}>Reconfirm & Approve</button></div></>;
 if(approved&&(can("Accountant")||can("Finance")))action=<><div className="wf-success"><FileCheck2/><div><b>Approved by Auditor</b><p>Upload payment/bank proof before marking this request as released.</p></div></div><label className="wf-proof"><Paperclip/>Upload release proof<input type="file" onChange={e=>setProof(e.target.files?.[0]?.name||"")}/>{proof&&<b>{proof}</b>}</label><button className="wf-primary" disabled={!proof} onClick={()=>onAction("Payment Released",withNote())}>Mark as Released</button></>;
 if(p.status==="Rejected")action=<><div className="wf-observation"><X/><div>
   <small>REQUEST REJECTED</small>
   <b>{p.rejectionNote||"No reason was recorded."}</b>
   <span>{p.rejectedBy?`Rejected by ${p.rejectedBy}`:""}{p.rejectedAt?` · ${stamp(p.rejectedAt)}`:""}</span>
 </div></div>
 <div className="wf-callout"><Clock3/>This request is closed and cannot be resubmitted. If the payment is still needed, raise a new payment request.</div></>;
 if(p.status==="Query Raised")action=<><div className="wf-observation"><AlertTriangle/><div>
   <small>QUERY RAISED - CORRECT AND RESUBMIT</small>
   <b>{p.rejectionNote||"No reason was recorded."}</b>
   <span>{p.rejectedBy?`Query from ${p.rejectedBy}`:""}{p.rejectedAt?` · ${stamp(p.rejectedAt)}`:""}</span>
 </div></div>
 {!mayCorrect&&<div className="wf-callout"><Clock3/>
    {p.raisedBy?`Only ${p.raisedBy} can correct and resubmit this request.`
      :"This request records nobody as having raised it, so it cannot be corrected here."}</div>}
  {mayCorrect&&(fixing
   ?<div className="wf-reject-form">
      {/* Editable, not just re-sendable: what sends a request back is usually a figure or
          an invoice, and a correction that could only add a note would not be a correction.
          Drawn from the same field rules as the original form, so the type still decides
          what is asked for. */}
      <div className="wf-fix-fields">
        {FIELD_ORDER.map(key=>{
          const need=ruleFor(edit.nature||"",key);
          /* description is drawn here too. It is mandatory in the base rules, so leaving it
             out made a form that demanded something it never showed. */
          if(need==="H")return null;
          const must=need==="M";
          const choices=key==="company"?companies.map(c=>c.name):key==="department"?departments
            :key==="nature"?natures:key==="tds"?tdsChoices:key==="currency"?currencies
            :key==="paymentMode"?modeChoices
            :key==="paymentTerms"?termsChoices
            /* The job register, as on the new-request form. A request raised before the
               job fields existed arrives here without them, and a free-text box would
               invite a code the register does not hold. */
            :key==="jbCode"?jobs.map(j=>j.code)
            :key==="project"?distinct(jobs,"project")
            :key==="jobLocation"?distinct(jobs,"location"):null;
          const empty=must&&!String(edit[key]||"").trim();
          return <label key={key} className={(key==="vendor"?"wide ":"")+(empty?"wf-missing":"")}>
            {labelFor(edit.nature||"",key)}{!must&&<i className="field-optional">optional</i>}
            {empty&&<i className="field-required">required</i>}
            {choices
              ?<select value={edit[key]||""} onChange={e=>{
                  /* Choosing a JB code carries its project and location with it. */
                  const picked=e.target.value;
                  const job=key==="jbCode"?jobFor(jobs,picked):undefined;
                  setEdit(job?{...edit,jbCode:picked,project:job.project,jobLocation:job.location}
                    :{...edit,[key]:picked})}}>
                 {(!must||!edit[key])&&<option value="">— choose —</option>}
                 {/* A value saved before the list changed still has to be offered. Live
                     requests carry natures like "Payroll" that the dropdown no longer
                     lists, and a select whose value matches no option shows a different
                     one - so an untouched field would be read back as something it is
                     not. Kept as its own option, marked, rather than silently replaced. */}
                 {!!edit[key]&&!choices.includes(edit[key])&&
                   <option value={edit[key]}>{edit[key]} (no longer offered)</option>}
                 {choices.map(o=><option key={o}>{o}</option>)}</select>
              :<input value={edit[key]||""}
                 type={key==="amount"?"number":key==="due"||key==="invoiceDate"?"date":"text"}
                 onChange={e=>setEdit({...edit,[key]:e.target.value})}/>}
          </label>})}
      </div>
      <label className="wf-note">What did you correct?
        <textarea value={fixNote} onChange={e=>setFixNote(e.target.value)}
          placeholder="Say what changed - which figure you fixed, or which document you replaced - so accounts can see it at a glance."/></label>
      {/* A greyed-out button with no reason is what made a returned request look
          impossible to resubmit. A request raised before a field became required arrives
          without it, so say exactly what is still needed. */}
      {!fixReady&&<p className="wf-fix-missing">Fill in {fixMissing.map(k=>labelFor(edit.nature||"",k)).join(", ")} to resubmit.</p>}
      {fixReady&&fixNote.trim().length<5&&<p className="wf-fix-missing">Say what you corrected to resubmit.</p>}
      <div className="wf-actions">
        <button onClick={()=>{setFixing(false);setFixNote("")}}>Cancel</button>
        <button className="wf-primary" disabled={fixNote.trim().length<5||!fixReady}
          onClick={()=>onAction("Submitted",fixNote.trim(),edit)}><Check/>Send back to Accounts</button>
      </div>
    </div>
   :<><div className="wf-callout"><Clock3/>Correct what is noted above, change any detail that was wrong, attach any replacement document, then say what you changed.</div>
     <button className="wf-primary" onClick={startFix}><Check/>Correct and resubmit</button></>)}</>;
 if(released)action=<div className="wf-success"><FileCheck2/><div><b>Payment Released</b><p>Release proof and the complete approval history are retained.</p></div></div>;
 /* A requestor only watches the accounts and audit stages - but a query is theirs to
    answer and a rejection is theirs to read, so this notice must not overwrite either. */
 if((role==="Requestor"||role==="Payment Requestor")&&p.status!=="Rejected"&&p.status!=="Query Raised")
   action=<div className="wf-callout"><Clock3/>Status-only access. Accounts and Audit actions are hidden.</div>;
 const title=p.status==="Rejected"?"Rejected - closed":p.status==="Query Raised"?"Query - correct and resubmit":accountQueue?"Accounts acceptance":accountWork?"Accountant verification":auditQueue?"Audit acceptance":auditWork?"Audit verification":correction?"Respond to audit observation":recheck?"Audit reconfirmation":approved?"Upload proof & release":"Completed";
 return <><button className="overlay" onClick={onClose}/><aside className="detail workflow-detail"><header><div><small>PAYMENT CONTROL · {role.toUpperCase()}</small><h2>{p.requestNo}</h2></div><button onClick={onClose}><X/></button></header><div className="detail-body"><div className="wf-summary"><div><span className={`badge ${statusTone(p.status)}`}>{p.status}</span><h3>{p.vendor}</h3><b className="amount">{p.currency} {p.amount.toLocaleString()}</b></div><dl><div><dt>Company</dt><dd>{p.company}</dd></div><div><dt>Department</dt><dd>{p.department}</dd></div>{p.poNumber&&<div><dt>PO number</dt><dd>{p.poNumber}</dd></div>}{!!p.nature&&<div><dt>Nature</dt><dd>{p.nature}</dd></div>}{!!p.tds&&<div><dt>TDS</dt><dd>{p.tds}</dd></div>}{!!p.projectCode&&<div><dt>Project code</dt><dd>{p.projectCode}</dd></div>}
      {!!p.invoiceNumber&&<div><dt>Invoice</dt><dd>{p.invoiceNumber}{p.invoiceDate?` · ${p.invoiceDate}`:""}</dd></div>}
      {!!p.paymentTerms&&<div><dt>Payment terms</dt><dd>{p.paymentTerms}</dd></div>}
      {!!p.period&&<div><dt>Period</dt><dd>{p.period}</dd></div>}{(()=>{try{return(JSON.parse(p.extra||"[]") as {id:string;label:string;value:string}[])
  .map(x=><div key={x.id}><dt>{x.label}</dt><dd>{x.value}</dd></div>)}catch{return null}})()}<div><dt>Due</dt><dd>{p.due}</dd></div><div><dt>Owner</dt><dd>{p.owner}</dd></div></dl></div><div className="wf-stage">{stages.map((s,i)=><div className={i<active?"past":i===active?"now":""} key={s}><i>{i<active?<Check/>:i+1}</i><span>{s}</span></div>)}</div><section className="wf-work"><div className="wf-title"><div><small>CURRENT ACTION</small><h4>{title}</h4></div><span className="badge amber">{role}</span></div>
   {/* Everything said about this request so far, newest first, above whatever is asked
       of the reader now - the reason accounts sent it on is what audit reads it by. */}
   {!!remarks.length&&<div className="wf-remarks"><small>REMARKS SO FAR</small>
     {remarks.map(r=><p key={r.id}><b>{r.remark}</b>
       <span>{r.actor} · {r.status} · {when(r.createdAt)}</span></p>)}</div>}
   {action}</section><Attachments entityType="payment" entityId={String(p.id)} flash={()=>{}}
   canRemove={["Administrator","Audit Head","Management","Accountant","Auditor","Finance"].includes(role)
     ||(mayCorrect&&p.status==="Query Raised")}/><section className="wf-history"><h4>Controlled audit trail</h4>
   {!history.length&&<p><i/><span><b>No history recorded for this request yet.</b></span></p>}
   {history.map(readEntry).map(e=><p key={e.id}><i/><span>
     <b>{e.field?`${e.action}: ${e.previousValue} → ${e.newValue}`
       :e.action==="Status changed"?`${e.previousValue||"—"} → ${e.status}`
       :e.previousValue?`${e.action} · ${e.previousValue} → ${e.status}`:`${e.action} · ${e.status}`}</b>
     {e.remark&&<em>{e.remark}</em>}
     <small>{e.actor} · {when(e.createdAt)}</small></span></p>)}</section>{/* Removing a request is not part of the workflow - rejecting one keeps the record and
    its trail. This is for a request raised in error, so it is an administrator's
    action alone and the server checks the role again. */}
{role==="Administrator"&&onDelete&&<section className="wf-danger-zone"><h4>Administrator</h4><p>Deleting removes this request and its documents for everybody. Rejecting it instead keeps the record and the audit trail.</p><button type="button" className="wf-delete-request" onClick={onDelete}><X/>Delete this request</button></section>}</div></aside></>
}
