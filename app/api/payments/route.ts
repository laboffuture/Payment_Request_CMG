import{desc,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{auditLogs,paymentRequests}from"../../../db/schema";
import{requireAuth}from"../../../lib/auth";
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
    const[payment]=await db.insert(paymentRequests).values({...p,amount}).returning();
    await db.insert(auditLogs).values({recordId:payment.id,action:"Payment submitted",
      actor:actor?.name||actor?.email||"system",newValue:payment.status});
    return Response.json({payment},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    const{id,status,owner}=(await req.json()) as{id:number;status:string;owner?:string};
    if(!Number.isFinite(Number(id)))return bad("id is required");
    if(STATUSES.indexOf(String(status))<0)return bad("Unknown status");
    const db=await getDb();
    const[old]=await db.select().from(paymentRequests).where(eq(paymentRequests.id,Number(id))).limit(1);
    if(!old)return bad("Not found",404);
    const[payment]=await db.update(paymentRequests)
      .set({status,owner:str(owner,old.owner).slice(0,120),updatedAt:new Date().toISOString()})
      .where(eq(paymentRequests.id,Number(id))).returning();
    await db.insert(auditLogs).values({recordId:Number(id),action:"Status changed",
      actor:actor?.name||actor?.email||"system",previousValue:old.status,newValue:status});
    return Response.json({payment});
  }catch(e){return oops(e)}}
