import{and,asc,desc,eq,like}from"drizzle-orm";
import{getDb}from"../../../db";
import{auditLogs,paymentRequests,wfAttachments}from"../../../db/schema";
import{deleteFile}from"../../../lib/storage";
import{departmentPeers,hasWriteRole,requireAuth}from"../../../lib/auth";
import{emailsForRoles,notify,rolesActingOn}from"../../../lib/notify";
import{FIELD_ORDER,REQUIRED_ON_SAVE,labelFor,ruleFor}from"../../../lib/payment-fields";
import{rememberVendor}from"../../../lib/vendors";
import type{FieldKey}from"../../../lib/payment-fields";
import{bad,oops,str}from"../../../lib/workforce-api";

/* Payment requests.

   This route used to have no guard at all: an anonymous caller could list every
   request in the group and PATCH any of them to "Payment Released". It is now held to
   the same rule as the rest of the API — a session for every call, and only a
   controlling role may move a request along. Raising a request is deliberately at
   `read` level, because a Requestor is not a write role and raising work of your own
   is not the same as changing somebody else's. */

/* The facts an email about a payment carries, whoever is reading it. The bell shows a
   title and one line; an email has room to say what the request actually is, so the
   reader can judge it without opening anything. Empty values are dropped by the template
   rather than printed as blanks. */
const paymentDetail=(p:{vendor?:string|null;currency?:string|null;amount?:number|null;
  company?:string|null;department?:string|null;nature?:string|null;due?:string|null;
  raisedBy?:string|null;paymentMode?:string|null})=>[
  {label:"Vendor",value:String(p.vendor||"")},
  {label:"Amount",value:`${p.currency||""} ${Number(p.amount||0).toLocaleString()}`.trim()},
  {label:"Company",value:[p.company,p.department].filter(Boolean).join(" · ")},
  {label:"Nature",value:String(p.nature||"")},
  {label:"Paid by",value:String(p.paymentMode||"")},
  {label:"Due",value:String(p.due||"")},
  {label:"Raised by",value:String(p.raisedBy||"")}];

/* Two ways to send a request back, and they are not the same thing.
   Query Raised returns it to the person who raised it to correct and resubmit - the same
   request, same number, same trail. Rejected closes it: nothing further happens to it, and
   if the payment is still wanted the requestor raises a new request. */
const QUERY="Query Raised",REJECTED="Rejected";

const STATUSES=["Submitted","Requested",REJECTED,QUERY,"Accountant Review","Accountant Accepted",
  "Pre-Audit Queue","Audit Accepted","Audit Query","Audit Rejected","Audit Reconfirmation",
  "Observation - Audit Action","Management Approval","Management Approval: Yes",
  "Management Approval: No","Approved by Auditor – Ready to Release","Finance Queue",
  "Payment Released","Reconciliation","Audit Cleared"];

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const peers=await departmentPeers(actor);
    const db=await getDb();
    /* One request's trail - every decision, who took it, when, and the remark with it -
       so the request panel can show the real history rather than a description of one.
       Held to the same scope as the list: a reader who cannot see the request cannot
       read its trail either. */
    const historyOf=Number(new URL(req.url).searchParams.get("history"));
    if(historyOf){
      const[p]=await db.select({raisedBy:paymentRequests.raisedBy}).from(paymentRequests)
        .where(eq(paymentRequests.id,historyOf)).limit(1);
      if(!p||(peers&&!peers.includes((p.raisedBy||"").toLowerCase())))return bad("Not found",404);
      const history=await db.select().from(auditLogs).where(eq(auditLogs.recordId,historyOf))
        .orderBy(asc(auditLogs.id));
      return Response.json({history});
    }
    /* The window is org-wide and only then filtered to the reader, so it has to be wide
       enough to still contain an individual's older requests. At 50 a requestor's own
       work fell out of view once the group as a whole passed fifty - invisible while the
       register is small, and indistinguishable from a paging bug once it is not. */
    const rows=await db.select().from(paymentRequests)
      .orderBy(desc(paymentRequests.id)).limit(500);
    /* A department head's scope is enforced here, not by the screen. Without this the
       whole register is one fetch away for anybody with a session, whatever the menu
       shows. Compared in lower case because addresses are stored as they were typed.
       null means the reader is not scoped at all; an empty list would mean nobody. */
    const mine=peers
      ?rows.filter(r=>peers.includes((r.raisedBy||"").toLowerCase()))
      :rows;
    /* The last remark anybody left, with who left it. lastActionNote is only the most
       recent step's note, and most steps are taken without one - so a request accounts
       had written about arrived in the audit queue showing no remark at all. Status
       changes are logged as "<status> — <remark>", so a remark is whatever follows the
       separator. */
    const latest=new Map<number,{remark:string;by:string}>();
    if(mine.length){
      /* Filtered to the listed requests here rather than with an IN list: five hundred ids
         would pass D1's bound-parameter limit, and a failure here must not empty the list. */
      const ids=new Set(mine.map(r=>r.id));
      const logs=await db.select({recordId:auditLogs.recordId,newValue:auditLogs.newValue,
        actor:auditLogs.actor}).from(auditLogs)
        .where(like(auditLogs.newValue,"% — %")).orderBy(asc(auditLogs.id)).catch(()=>[]);
      for(const l of logs){
        if(!ids.has(l.recordId))continue;
        const remark=l.newValue.slice(l.newValue.indexOf(" — ")+3).trim();
        if(remark)latest.set(l.recordId,{remark,by:l.actor});
      }
    }
    return Response.json({payments:mine.map(r=>({...r,
      latestRemark:latest.get(r.id)?.remark||"",latestRemarkBy:latest.get(r.id)?.by||""}))});
  }catch{return Response.json({payments:[]})}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const p=(await req.json()) as typeof paymentRequests.$inferInsert&{amount?:number};
    const amount=Number(p.amount);
    /* The beneficiary is not named here any more: whether a request needs one depends on
       its payment type, and the rules below decide it. A statutory payment has no vendor
       to name. What stays is what no rule can express - an amount that is a real number
       above zero. */
    if(!p.company||!Number.isFinite(amount)||amount<=0)
      return bad("A company and an amount above zero are required");
    if(p.status&&STATUSES.indexOf(String(p.status))<0)return bad("Unknown status");

    /* The payment type decides which fields a request must carry. Enforced here as well
       as on the form: a field the type hides is cleared rather than trusted, so a value
       cannot be smuggled in against a type that does not use it. */
    const nature=String(p.nature||"");
    const missing:string[]=[];
    for(const field of REQUIRED_ON_SAVE as FieldKey[]){
      const need=ruleFor(nature,field);
      const raw=(p as Record<string,unknown>)[field];
      const value=String(raw??"").trim();
      if(need==="M"&&!value)missing.push(labelFor(nature,field));
      /* Absent means empty, not missing-from-the-row: vendor, department and currency are
         NOT NULL columns with no default, so a type that asks for none of them - a
         statutory payment has no vendor - would otherwise fail on insert. */
      if(need==="H")(p as Record<string,unknown>)[field]="";
      else if(field!=="amount"&&(raw===undefined||raw===null))(p as Record<string,unknown>)[field]="";
    }
    if(missing.length)
      return bad(`${nature||"This payment type"} needs ${missing.join(", ")}.`,422);
    const db=await getDb();

    /* The request number is the server's to give. The browser used to invent one -
       "PAY-2026-" and a random number between 1050 and 1149 - against a column that must
       be unique, so with two dozen requests already in that range roughly one submission
       in four collided and the insert was refused. The number now follows the highest
       already issued, and a collision between two people submitting at the same moment is
       retried rather than thrown at the requestor. */
    const year=new Date().getFullYear();
    const issued=await db.select({no:paymentRequests.requestNo}).from(paymentRequests);
    let next=issued.reduce((top,r)=>{
      const m=/^PAY-\d{4}-(\d+)$/.exec(r.no||"");
      return m?Math.max(top,Number(m[1])):top},1049)+1;

    let payment;
    for(let attempt=0;attempt<6&&!payment;attempt++){
      try{
        [payment]=await db.insert(paymentRequests)
          .values({...p,amount,requestNo:`PAY-${year}-${next}`,raisedBy:actor?.email||""})
          .returning();
      }catch(e){
        const taken=String(e).toLowerCase().includes("unique");
        if(!taken||attempt===5)throw e;
        next++;                       // somebody else took it between the read and the write
      }
    }
    if(!payment)return bad("Could not issue a request number. Please try again.",503);
    await db.insert(auditLogs).values({recordId:payment.id,action:"Payment submitted",
      actor:actor?.name||actor?.email||"system",newValue:payment.status});
    /* A new request waits on accounts. */
    await notify(await emailsForRoles(["Accountant"]),{
      title:`New payment request ${payment.requestNo}`,
      body:`${payment.vendor} · ${payment.currency} ${Number(payment.amount).toLocaleString()} · raised by ${actor?.name||actor?.email||"a requestor"}`,
      reference:payment.requestNo,detail:paymentDetail(payment),
      action:"Accept it into the accounts queue to start, or send it back to the requestor with a reason.",
      module:"payments",recordId:String(payment.id)},actor?.email,["Accountant"]);
    /* A vendor the register does not hold yet is added, so the next requestor is offered
       it rather than typing it again - and spelling it differently. */
    await rememberVendor(String(p.vendor||""),actor?.email);
    return Response.json({payment},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    /* Read level here, then the rule below. A requestor is not a write role, but a
       request that was sent back to them is theirs to answer - and answering it is the
       only change they may make, only on their own request, and only back into the
       accounts queue. Everything else still needs a write role. */
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const{id,status,owner,note,fields}=(await req.json()) as{id:number;status:string;owner?:string;note?:string;fields?:Record<string,unknown>};
    if(!Number.isFinite(Number(id)))return bad("id is required");
    if(STATUSES.indexOf(String(status))<0)return bad("Unknown status");
    const db=await getDb();
    const[old]=await db.select().from(paymentRequests).where(eq(paymentRequests.id,Number(id))).limit(1);
    if(!old)return bad("Not found",404);

    const ownResubmit=old.status===QUERY&&status==="Submitted"
      &&!!actor?.email&&(old.raisedBy||"")===actor.email;
    if(!hasWriteRole(actor?.roles)&&!ownResubmit)
      return bad("Your role cannot change this data.",403);
    /* A rejection is final. Only an administrator can move a rejected request again - to
       undo a rejection made in error - and nobody can resubmit one. */
    if(old.status===REJECTED&&!(actor?.roles||[]).includes("Administrator"))
      return bad("This request was rejected and is closed. Raise a new request instead.",409);
    /* Both ends of a return have to say something. A query or rejection must say what is
       wrong, and the resubmission must say what was done about it - otherwise accounts
       reopens the request knowing only that it came back. The original reason stays on
       the record beside the reply until the next decision is taken. */
    const remark=str(note).trim().slice(0,1000);
    const isResubmit=old.status===QUERY&&status==="Submitted";
    if(status===QUERY&&remark.length<5)
      return bad("Say what the requestor needs to correct before resubmitting.",422);
    if(status===REJECTED&&remark.length<5)
      return bad("Give a reason for the rejection so the requestor knows why it was closed.",422);
    if(isResubmit&&remark.length<5)
      return bad("Say what you corrected, so accounts can see what changed.",422);

    /* A returned request can be corrected, not only re-sent with a note. What sends one
       back is usually a wrong figure or a missing invoice, so a resubmission that could
       not change them would be theatre.

       Held to the same rules as raising one: only the person who raised it, only while it
       is back with them, and only the fields the form itself offers. The request number,
       who raised it, the status and the owner are not in that list and cannot be reached
       from here. Every field the type hides is cleared rather than trusted, and every
       field it demands is checked again - the browser is not the authority on either. */
    const sent=fields&&typeof fields==="object"?fields:null;
    /* Declared before either path fills them: the TDS branch below and the requestor's
       correction after it both write here, and whichever comes first must not find them
       undeclared. */
    const edits:Record<string,string|number>={};
    const changed:[FieldKey,string,string][]=[];
    /* Accounts record TDS while a request is with them. This is deliberately its own
       narrow path rather than an extension of the requestor's correction: that one lets
       the raiser rewrite any field its payment type asks for, and an accountant must not
       be able to reach a vendor or an amount through it. Only these three keys, only a
       write role, and only while the request is actually in the accounts queue. */
    const TDS_KEYS=["tds","tdsPercent","tdsValue"];
    /* Verification, not acceptance. TDS is asked for where accounts do the checking, so
       the server accepts it only from there - the acceptance step no longer offers the
       field and must not be able to write it either. */
    const ACCOUNTS_STAGES=["Accountant Accepted","Accountant Review"];
    const tdsOnly=!!sent&&Object.keys(sent).length>0
      &&Object.keys(sent).every(k=>TDS_KEYS.includes(k));
    if(tdsOnly&&sent){
      if(!hasWriteRole(actor?.roles))return bad("Your role cannot record TDS.",403);
      if(!ACCOUNTS_STAGES.includes(old.status))
        return bad("TDS is recorded while a request is with accounts.",422);
      const applies=String(sent.tds??"").trim();
      if(applies!=="Yes"&&applies!=="No")
        return bad("Say whether TDS applies before accepting the request.",422);
      if(applies==="No"){edits.tds="No";edits.tdsPercent="";edits.tdsValue=""}
      else{
        const pct=Number(String(sent.tdsPercent??"").trim());
        const val=Number(String(sent.tdsValue??"").trim());
        if(!Number.isFinite(pct)||pct<=0||pct>100)
          return bad("Enter a TDS percentage between 0 and 100.",422);
        if(!Number.isFinite(val)||val<=0)
          return bad("Enter a TDS value above zero.",422);
        if(val>Number(old.amount))
          return bad("TDS cannot be more than the amount of the request.",422);
        edits.tds="Yes";edits.tdsPercent=String(pct);edits.tdsValue=String(val);
      }
      for(const k of TDS_KEYS){
        const before=String((old as Record<string,unknown>)[k]??"");
        const after=String(edits[k]??"");
        if(before!==after)changed.push([k as FieldKey,before||"(empty)",after||"(empty)"]);
      }
    }
    if(sent&&!tdsOnly){
      if(!ownResubmit)
        return bad("Only the person who raised a returned request can correct it.",403);
      const nature=String(sent.nature??old.nature??"");
      for(const key of FIELD_ORDER){
        if(!(key in sent))continue;
        const need=ruleFor(nature,key);
        const value=need==="H"?"":String(sent[key]??"").trim();
        if(need==="M"&&!value)
          return bad(`${labelFor(nature,key)} is required for ${nature||"this payment type"}.`,422);
        const before=String((old as Record<string,unknown>)[key]??"");
        if(key==="amount"){
          const n=Number(value);
          if(!Number.isFinite(n)||n<=0)return bad("Enter an amount above zero.",422);
          if(n!==Number(old.amount)){edits.amount=n;changed.push([key,before,String(n)])}
          continue;
        }
        if(value!==before){edits[key]=value;changed.push([key,before,value])}
      }
    }
    const now=new Date().toISOString();
    /* The rejection columns carry the reason for either kind of return; the status says
       which it was. */
    const rejectionFields=status===REJECTED||status===QUERY
      ?{rejectionNote:remark,rejectedBy:actor?.name||actor?.email||"",rejectedAt:now,
        resubmitNote:"",resubmittedAt:""}
      :isResubmit
      ?{resubmitNote:remark,resubmittedAt:now}
      :old.status===REJECTED||old.status===QUERY
      ?{rejectionNote:"",rejectedBy:"",rejectedAt:"",resubmitNote:"",resubmittedAt:""}:{};
    const[payment]=await db.update(paymentRequests)
      /* Who moved it on and what they said, kept on the request so the queue can show it
         without reading the trail once per row. */
      .set({status,owner:str(owner,old.owner).slice(0,120),updatedAt:now,
        lastActionBy:actor?.name||actor?.email||"",lastActionNote:remark,lastActionAt:now,...edits,
        ...rejectionFields})
      .where(eq(paymentRequests.id,Number(id))).returning();
    await db.insert(auditLogs).values({recordId:Number(id),
      action:status===REJECTED?"Rejected with remarks"
        :status===QUERY?"Query raised to requestor"
        :isResubmit?"Corrected and resubmitted":"Status changed",
      actor:actor?.name||actor?.email||"system",previousValue:old.status,
      newValue:remark?`${status} — ${remark}`:status});
    /* One row per field that moved. The note is the requestor's account of what they
       corrected; these are the record of it. Without them a figure could change between a
       rejection and the resubmission with nothing on the trail to show it, which would
       leave the rejection worth very little. */
    const effective=String(edits.nature??old.nature??"");
    for(const[field,before,after]of changed)
      await db.insert(auditLogs).values({recordId:Number(id),
        action:`Corrected ${labelFor(effective,field)}`,
        actor:actor?.name||actor?.email||"system",
        previousValue:before||"(empty)",newValue:after||"(empty)"});
    /* Tell whoever the request now waits on, and keep the person who raised it informed
       of every move - a rejection most of all, with the reason. */
    const waitingOn=rolesActingOn(status);
    if(waitingOn.length)await notify(await emailsForRoles(waitingOn),{
      title:`${payment.requestNo} is waiting for ${waitingOn[0]==="Finance"?"release":waitingOn[0]==="Auditor"?"audit":waitingOn[0]==="Management"?"management approval":"accounts"}`,
      body:`${payment.vendor} · ${payment.currency} ${Number(payment.amount).toLocaleString()} · ${status}`,
      /* The roles decide where the email goes, not whether one is sent: audit has a group
         address, everybody else is written to individually. */
      reference:payment.requestNo,detail:paymentDetail(payment),
      action:waitingOn[0]==="Finance"?"Release the approved amount and attach the payment proof."
        :waitingOn[0]==="Auditor"?"Accept it from the audit queue and verify the documents."
        :waitingOn[0]==="Management"?"Approve or decline this request."
        :"Pick it up from the accounts queue.",
      module:"payments",recordId:String(payment.id)},actor?.email,waitingOn);
    await notify([old.raisedBy||""],{
      title:status===QUERY?`${payment.requestNo}: query raised - please correct and resubmit`
        :status===REJECTED?`${payment.requestNo} was rejected`
        :`Your request ${payment.requestNo}: ${status}`,
      body:remark||`${payment.vendor} · ${payment.currency} ${Number(payment.amount).toLocaleString()}`,
      /* The requestor's own copy. A query or a rejection is the one that matters most, so
         it is marked as such and says plainly what to do about it. */
      reference:payment.requestNo,detail:paymentDetail(payment),
      tone:status===QUERY||status===REJECTED?"warning":status==="Payment Released"?"good":"normal",
      action:status===QUERY
        ?"Open the request, correct what is noted above, say what you changed, and resubmit it to accounts."
        :status===REJECTED
        ?"This request is closed and cannot be resubmitted. If the payment is still needed, raise a new request."
        :status==="Payment Released"?"Nothing further is needed from you."
        :"No action is needed from you yet; this is where the request has reached.",
      module:"payments",recordId:String(payment.id)},actor?.email);
    return Response.json({payment});
  }catch(e){return oops(e)}}

/* Deleting a payment request is an administrator's action alone. The workflow otherwise
   only ever moves a request forward, and rejecting one leaves the record and its trail
   intact - which is the point of an audit system. This exists for a request raised in
   error, so its documents go with it rather than being orphaned in storage, and the
   deletion is itself written to the trail.

   requireAuth's "admin" level admits Audit Head as well, so the role is checked
   explicitly here: this is Administrator only. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"admin");
    if(response)return response;
    if(!(actor?.roles||[]).includes("Administrator"))
      return bad("Only an administrator can delete a payment request.",403);
    const id=Number(new URL(req.url).searchParams.get("id"));
    if(!Number.isFinite(id)||id===0)return bad("A numeric id is required");
    const db=await getDb();
    const [row]=await db.select().from(paymentRequests).where(eq(paymentRequests.id,id)).limit(1);
    if(!row)return bad("Not found",404);

    // the documents attached to it, out of object storage as well as the table
    const files=await db.select().from(wfAttachments)
      .where(and(eq(wfAttachments.entityType,"payment"),eq(wfAttachments.entityId,String(id))));
    for(const f of files){
      try{await deleteFile(f.storageKey)}catch{}
      await db.delete(wfAttachments).where(eq(wfAttachments.id,f.id));
    }
    await db.delete(paymentRequests).where(eq(paymentRequests.id,id));
    await db.insert(auditLogs).values({recordId:id,action:"Payment request deleted",
      actor:actor?.name||actor?.email||"system",
      previousValue:`${row.requestNo} · ${row.vendor} · ${row.currency} ${row.amount}`,
      newValue:`deleted with ${files.length} document(s)`});
    return Response.json({deleted:true,requestNo:row.requestNo,documents:files.length});
  }catch(e){return oops(e)}}
