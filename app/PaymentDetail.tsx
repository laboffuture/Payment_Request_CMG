"use client";
import{useMemo,useState}from"react";
import{AlertTriangle,Check,Clock3,FileCheck2,Paperclip,ShieldCheck,X}from"lucide-react";
import Attachments from"./Attachments";
type Payment={poNumber?:string;resubmitNote?:string;resubmittedAt?:string;rejectionNote?:string;rejectedBy?:string;rejectedAt?:string;id:number;requestNo:string;company:string;vendor:string;amount:number;currency:string;due:string;urgency:string;status:string;owner:string;department:string};
/* The badge was hardcoded blue, so a rejected request looked the same as one in
   progress. Colour follows the status. */
const statusTone=(s:string)=>/reject|query/i.test(s)?"red"
  :/released|approved|cleared/i.test(s)?"green"
  :/observation|correction|reconfirm/i.test(s)?"amber":"blue";
const stamp=(v:string)=>v?new Date(v).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"";
const stages=["Requested","Accounts","Audit","Correction","Recheck","Release"];
export default function PaymentDetail({payment:p,role,onClose,onAction,onDelete}:{payment:Payment;role:string;onClose:()=>void;onAction:(s:string,note?:string)=>void;onDelete?:()=>void}){
 const accountQueue=["Submitted","Requested"].includes(p.status),accountWork=["Accountant Accepted","Accountant Review"].includes(p.status),auditQueue=p.status==="Pre-Audit Queue",auditWork=p.status==="Audit Accepted",correction=p.status==="Observation – Accounts Action",recheck=p.status==="Audit Reconfirmation",approved=p.status==="Approved by Auditor – Ready to Release",released=p.status==="Payment Released";
 const[rejecting,setRejecting]=useState(false),[remark,setRemark]=useState(""),[fixing,setFixing]=useState(false),[fixNote,setFixNote]=useState(""),[stageNote,setStageNote]=useState(""),[checks,setChecks]=useState<Record<string,boolean>>({}),[observation,setObservation]=useState("Supporting documents do not reconcile with the ledger balance."),[proof,setProof]=useState("");
 const active=useMemo(()=>released?5:approved?5:recheck?4:correction?3:auditWork||auditQueue?2:accountWork||accountQueue?1:0,[p.status]);
 /* Each stage belongs to one role. An administrator or audit head may also act, so a
    request is never stuck because the responsible person is unavailable. */
 const can=(r:string)=>role===r||role==="Administrator"||role==="Audit Head";
 /* Rejecting sends the request back to whoever raised it, so it has to say what to
    change. The button opens a remark box rather than acting immediately. */
 const rejectForm=(label:string)=>rejecting
   ?<div className="wf-reject-form">
      <label className="wf-note">{label}
        <textarea autoFocus value={remark} onChange={e=>setRemark(e.target.value)}
          placeholder="What does the requestor need to correct? Which document is wrong or missing?"/></label>
      <div className="wf-actions">
        <button onClick={()=>{setRejecting(false);setRemark("")}}>Cancel</button>
        <button className="wf-reject" disabled={remark.trim().length<5}
          onClick={()=>onAction("Rejected",remark.trim())}><X/>Reject and send back</button>
      </div>
    </div>
   :<button className="wf-reject" onClick={()=>setRejecting(true)}><X/>Reject</button>;
 /* Every decision can carry a remark. It is optional here - only a rejection or a
    resubmission demands one - and it goes into the audit trail beside the status so
    the record says why, not just what. */
 const noteBox=(label:string,hint:string)=><label className="wf-note">{label}
   <textarea value={stageNote} onChange={e=>setStageNote(e.target.value)} placeholder={hint}/></label>;
 const withNote=()=>stageNote.trim()||undefined;
 const toggle=(k:string)=>setChecks(v=>({...v,[k]:!v[k]})),complete=(ks:string[])=>ks.every(k=>checks[k]);
 const accountKeys=["PO / Invoice / DO matched","Balance reconciled"],auditKeys=["Documents verified","GL posting correct","Balance reconciled"];
 const list=(ks:string[])=><div className="wf-checks">{ks.map(k=><label key={k} className={checks[k]?"done":""}><input type="checkbox" checked={!!checks[k]} onChange={()=>toggle(k)}/><span>{checks[k]?<Check/>:null}</span><b>{k}</b></label>)}</div>;
 let action=<div className="wf-callout"><Clock3/>This request is visible to you. Switch to its responsible role to perform the next action.</div>;
 if(accountQueue&&can("Accountant"))action=<>{p.resubmitNote&&<div className="wf-success wf-reply"><Check/><div><small>CORRECTED AND RESUBMITTED</small><b>{p.resubmitNote}</b><span>{p.rejectionNote?`Returned for: ${p.rejectionNote}`:""}{p.resubmittedAt?` · ${stamp(p.resubmittedAt)}`:""}</span></div></div>}<div className="wf-callout"><Clock3/>Available in the common Accounts queue.</div>{noteBox("Remarks (optional)","Anything worth recording with this decision")}<div className="wf-actions">{rejectForm("Why is this being sent back?")}<button className="wf-primary" onClick={()=>onAction("Accountant Accepted",withNote())}><Check/>Accept to Start</button></div></>;
 if(accountWork&&can("Accountant"))action=<>{list(accountKeys)}{noteBox("Issues fixed / accountant note","Record issues and how they were fixed")}<button className="wf-primary" disabled={!complete(accountKeys)} onClick={()=>onAction("Pre-Audit Queue",withNote())}>Send to Audit</button></>;
 if(auditQueue&&can("Auditor"))action=<><div className="wf-callout"><ShieldCheck/>Available in the common Audit queue.</div>{noteBox("Remarks (optional)","Anything worth recording with this decision")}<div className="wf-actions">{rejectForm("Why is this being sent back?")}<button className="wf-primary" onClick={()=>onAction("Audit Accepted",withNote())}><Check/>Accept to Start</button></div></>;
 if(auditWork&&can("Auditor"))action=<>{list(auditKeys)}<label className="wf-note">Audit observation<textarea value={observation} onChange={e=>setObservation(e.target.value)}/></label><div className="wf-actions"><button className="wf-reject" onClick={()=>onAction("Observation – Accounts Action",observation.trim()||undefined)}><AlertTriangle/>Reject & raise observation</button><button className="wf-primary" disabled={!complete(auditKeys)} onClick={()=>onAction("Approved by Auditor – Ready to Release",withNote())}>Approve for release</button></div></>;
 if(correction&&can("Accountant"))action=<><div className="wf-observation"><AlertTriangle/><div><small>AUDIT OBSERVATION RECEIVED</small><b>OBS-{Math.abs(p.id)+300}</b><p>{observation}</p><span>Assigned to Accounts · Due in 2 days</span></div></div>{noteBox("Accountant response","Explain what was corrected")}<label className="wf-proof"><Paperclip/>Upload correction proof<input type="file" onChange={e=>setProof(e.target.files?.[0]?.name||"")}/>{proof&&<b>{proof}</b>}</label>{noteBox("Remarks (optional)","Anything worth recording with the release")}<button className="wf-primary" disabled={!proof} onClick={()=>onAction("Audit Reconfirmation",withNote())}>Respond with Proof</button></>;
 if(recheck&&can("Auditor"))action=<><div className="wf-callout"><FileCheck2/>Accounts responded with correction proof. Reconfirm before approval.</div>{list(auditKeys)}<div className="wf-actions"><button className="wf-reject" onClick={()=>onAction("Observation – Accounts Action")}>Return Again</button><button className="wf-primary" disabled={!complete(auditKeys)} onClick={()=>onAction("Approved by Auditor – Ready to Release")}>Reconfirm & Approve</button></div></>;
 if(approved&&(can("Accountant")||can("Finance")))action=<><div className="wf-success"><FileCheck2/><div><b>Approved by Auditor</b><p>Upload payment/bank proof before marking this request as released.</p></div></div><label className="wf-proof"><Paperclip/>Upload release proof<input type="file" onChange={e=>setProof(e.target.files?.[0]?.name||"")}/>{proof&&<b>{proof}</b>}</label><button className="wf-primary" disabled={!proof} onClick={()=>onAction("Payment Released",withNote())}>Mark as Released</button></>;
 if(p.status==="Rejected")action=<><div className="wf-observation"><AlertTriangle/><div>
   <small>RETURNED FOR CORRECTION</small>
   <b>{p.rejectionNote||"No reason was recorded."}</b>
   <span>{p.rejectedBy?`Rejected by ${p.rejectedBy}`:""}{p.rejectedAt?` · ${stamp(p.rejectedAt)}`:""}</span>
 </div></div>
 {(role==="Requestor"||role==="Administrator")&&(fixing
   ?<div className="wf-reject-form">
      <label className="wf-note">What did you correct?
        <textarea autoFocus value={fixNote} onChange={e=>setFixNote(e.target.value)}
          placeholder="Say what changed - which document you replaced, or what you fixed - so accounts can see it at a glance."/></label>
      <div className="wf-actions">
        <button onClick={()=>{setFixing(false);setFixNote("")}}>Cancel</button>
        <button className="wf-primary" disabled={fixNote.trim().length<5}
          onClick={()=>onAction("Submitted",fixNote.trim())}><Check/>Send back to Accounts</button>
      </div>
    </div>
   :<><div className="wf-callout"><Clock3/>Correct what is noted above and attach any replacement document, then say what you changed.</div>
     <button className="wf-primary" onClick={()=>setFixing(true)}><Check/>Correct and resubmit</button></>)}</>;
 if(released)action=<div className="wf-success"><FileCheck2/><div><b>Payment Released</b><p>Release proof and the complete approval history are retained.</p></div></div>;
 /* A requestor only watches the accounts and audit stages - but a returned request is
    theirs to answer, so this notice must not overwrite the resubmit action set above. */
 if((role==="Requestor"||role==="Payment Requestor")&&p.status!=="Rejected")
   action=<div className="wf-callout"><Clock3/>Status-only access. Accounts and Audit actions are hidden.</div>;
 const title=p.status==="Rejected"?"Returned for correction":accountQueue?"Accounts acceptance":accountWork?"Accountant verification":auditQueue?"Audit acceptance":auditWork?"Audit verification":correction?"Respond to audit observation":recheck?"Audit reconfirmation":approved?"Upload proof & release":"Completed";
 return <><button className="overlay" onClick={onClose}/><aside className="detail workflow-detail"><header><div><small>PAYMENT CONTROL · {role.toUpperCase()}</small><h2>{p.requestNo}</h2></div><button onClick={onClose}><X/></button></header><div className="detail-body"><div className="wf-summary"><div><span className={`badge ${statusTone(p.status)}`}>{p.status}</span><h3>{p.vendor}</h3><b className="amount">{p.currency} {p.amount.toLocaleString()}</b></div><dl><div><dt>Company</dt><dd>{p.company}</dd></div><div><dt>Department</dt><dd>{p.department}</dd></div>{p.poNumber&&<div><dt>PO number</dt><dd>{p.poNumber}</dd></div>}<div><dt>Due</dt><dd>{p.due}</dd></div><div><dt>Owner</dt><dd>{p.owner}</dd></div></dl></div><div className="wf-stage">{stages.map((s,i)=><div className={i<active?"past":i===active?"now":""} key={s}><i>{i<active?<Check/>:i+1}</i><span>{s}</span></div>)}</div><section className="wf-work"><div className="wf-title"><div><small>CURRENT ACTION</small><h4>{title}</h4></div><span className="badge amber">{role}</span></div>{action}</section><Attachments entityType="payment" entityId={String(p.id)} flash={()=>{}}/><section className="wf-history"><h4>Controlled audit trail</h4>{["Request submitted with documents","Accounts and Audit acceptance recorded","Checklist, observation, response and proof retained"].map((x,i)=><p key={x}><i/><span><b>{x}</b><small>{i?"Recorded at each action":"Today · Requestor"}</small></span></p>)}</section>{/* Removing a request is not part of the workflow - rejecting one keeps the record and
    its trail. This is for a request raised in error, so it is an administrator's
    action alone and the server checks the role again. */}
{role==="Administrator"&&onDelete&&<section className="wf-danger-zone"><h4>Administrator</h4><p>Deleting removes this request and its documents for everybody. Rejecting it instead keeps the record and the audit trail.</p><button type="button" className="wf-delete-request" onClick={onDelete}><X/>Delete this request</button></section>}</div></aside></>
}
