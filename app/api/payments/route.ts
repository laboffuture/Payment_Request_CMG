import{and,desc,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{auditLogs,paymentRequests,wfAttachments}from"../../../db/schema";
import{deleteFile}from"../../../lib/storage";
import{hasWriteRole,requireAuth}from"../../../lib/auth";
import{bad,oops,str}from"../../../lib/workforce-api";

/* Payment requests.

   This route used to have no guard at all: an anonymous caller could list every
   request in the group and PATCH any of them to "Payment Released". It is now held to
   the same rule as the rest of the API — a session for every call, and only a
   controlling role may move a request along. Raising a request is deliberately at
   `read` level, because a Requestor is not a write role and raising work of your own
   is not the same as changing somebody else's. */

const STATUSES=["Submitted","Requested","Rejected","Accountant Review","Accountant Accepted",
  "Pre-Audit Queue","Audit Accepted","Audit Query","Audit Rejected","Audit Reconfirmation",
  "Observation – Accounts Action","Management Approval","Management Approval: Yes",
  "Management Approval: No","Approved by Auditor – Ready to Release","Finance Queue",
  "Payment Released","Reconciliation","Audit Cleared"];

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    return Response.json({payments:await (await getDb()).select().from(paymentRequests)
      .orderBy(desc(paymentRequests.id)).limit(50)});
  }catch{return Response.json({payments:[]})}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const p=(await req.json()) as typeof paymentRequests.$inferInsert&{amount?:number};
    const amount=Number(p.amount);
    if(!p.vendor||!p.company||!Number.isFinite(amount)||amount<=0)
      return bad("A company, a vendor and an amount above zero are required");
    if(p.status&&STATUSES.indexOf(String(p.status))<0)return bad("Unknown status");
    const db=await getDb();
    /* Taken from the session, never the request body, so a client cannot claim somebody
         else raised it. */
      const[payment]=await db.insert(paymentRequests)
        .values({...p,amount,raisedBy:actor?.email||""}).returning();
    await db.insert(auditLogs).values({recordId:payment.id,action:"Payment submitted",
      actor:actor?.name||actor?.email||"system",newValue:payment.status});
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
    const{id,status,owner,note}=(await req.json()) as{id:number;status:string;owner?:string;note?:string};
    if(!Number.isFinite(Number(id)))return bad("id is required");
    if(STATUSES.indexOf(String(status))<0)return bad("Unknown status");
    const db=await getDb();
    const[old]=await db.select().from(paymentRequests).where(eq(paymentRequests.id,Number(id))).limit(1);
    if(!old)return bad("Not found",404);

    const ownResubmit=old.status==="Rejected"&&status==="Submitted"
      &&!!actor?.email&&(old.raisedBy||"")===actor.email;
    if(!hasWriteRole(actor?.roles)&&!ownResubmit)
      return bad("Your role cannot change this data.",403);
    /* Both ends of a return have to say something. A rejection must say what is wrong,
       and the resubmission must say what was done about it - otherwise accounts reopens
       the request knowing only that it came back. The original reason stays on the
       record beside the reply until the next decision is taken. */
    const remark=str(note).trim().slice(0,1000);
    const isResubmit=old.status==="Rejected"&&status==="Submitted";
    if(status==="Rejected"&&remark.length<5)
      return bad("Give a reason for the rejection so the requestor knows what to correct.",422);
    if(isResubmit&&remark.length<5)
      return bad("Say what you corrected, so accounts can see what changed.",422);
    const now=new Date().toISOString();
    const rejectionFields=status==="Rejected"
      ?{rejectionNote:remark,rejectedBy:actor?.name||actor?.email||"",rejectedAt:now,
        resubmitNote:"",resubmittedAt:""}
      :isResubmit
      ?{resubmitNote:remark,resubmittedAt:now}
      :old.status==="Rejected"
      ?{rejectionNote:"",rejectedBy:"",rejectedAt:"",resubmitNote:"",resubmittedAt:""}:{};
    const[payment]=await db.update(paymentRequests)
      .set({status,owner:str(owner,old.owner).slice(0,120),updatedAt:now,...rejectionFields})
      .where(eq(paymentRequests.id,Number(id))).returning();
    await db.insert(auditLogs).values({recordId:Number(id),
      action:status==="Rejected"?"Rejected with remarks"
        :isResubmit?"Corrected and resubmitted":"Status changed",
      actor:actor?.name||actor?.email||"system",previousValue:old.status,
      newValue:remark?`${status} — ${remark}`:status});
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
