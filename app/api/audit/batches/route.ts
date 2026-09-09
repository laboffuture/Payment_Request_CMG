import{count,desc,eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfBatches}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{actorOf,bad,num,oops,page,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

const QUEUE="Audit Queue",ACCEPTED="Audit Accepted",
  REJECTED="Rejected \u2013 Accounts Action",APPROVED="Approved \u2013 Ready to Release",
  RELEASED="Released";
const now=()=>new Date().toISOString();

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const status=url.searchParams.get("status");
    const db=await getDb();
    const where=status?eq(wfBatches.status,status):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfBatches).where(where)
        .orderBy(desc(wfBatches.createdAt)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfBatches).where(where)]);
    return Response.json({batches:rows,total:total?.n??0});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    /* The screen only offers "New schedule request" to accounts, and the rule holds here
       too: an auditor reviews and updates a batch but does not raise one. */
    if(!(actor?.roles||[]).some(r=>["Administrator","Audit Head","Accountant"].includes(r)))
      return bad("Only accounts can raise a scheduled payment batch.",403);
    const body=await req.json() as Row;
    if(!str(body.vendor))return bad("vendor is required");
    if(num(body.requested)<=0)return bad("requested amount must be more than zero");
    const row={id:str(body.id)||`SCH-${new Date().getFullYear()}-${Date.now().toString(36)}`,
      vendor:str(body.vendor),requested:num(body.requested),approved:null,
      currency:str(body.currency,"AED"),companyId:str(body.companyId),
      statement:str(body.statement),reconciliation:str(body.reconciliation),gl:str(body.gl),
      status:QUEUE,reason:"",proof:"",raisedBy:actor?.name||"",createdAt:now(),releasedAt:"",
      extra:str(body.extra)};
    await writeWithAudit([(await getDb()).insert(wfBatches).values(row)],
      actorOf(req,body),"batch",row.id,"Batch raised",`${row.vendor} · ${row.requested}`);
    return Response.json({batch:row},{status:201});
  }catch(e){return oops(e)}}

/* The workflow enforced server-side: an auditor accepts, then approves or rejects,
   and a reduced approval must carry a reason. Release is only possible from the
   approved state, and needs proof. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [b]=await db.select().from(wfBatches).where(eq(wfBatches.id,id)).limit(1);
    if(!b)return bad("Not found",404);
    const action=str(body.action);
    const patch:Record<string,unknown>={};

    if(action==="accept"){
      if(b.status!==QUEUE)return bad("Only a batch in the audit queue can be accepted",409);
      patch.status=ACCEPTED;
    }else if(action==="approve"){
      if(b.status!==ACCEPTED)return bad("Accept the batch before approving it",409);
      const approved=num(body.approved);
      if(approved<=0)return bad("Approved amount must be more than zero");
      if(approved>b.requested)return bad("Approved amount cannot exceed the vendor request",422);
      if(approved<b.requested&&!str(body.reason).trim())
        return bad("Give a reason when approving less than the vendor asked for",422);
      patch.status=APPROVED;patch.approved=approved;patch.reason=str(body.reason);
    }else if(action==="reject"){
      if(b.status!==ACCEPTED)return bad("Accept the batch before rejecting it",409);
      if(!str(body.reason).trim())return bad("Give a reason before rejecting",422);
      patch.status=REJECTED;patch.reason=str(body.reason);
    }else if(action==="resubmit"){
      if(b.status!==REJECTED)return bad("Only a rejected batch can be resubmitted",409);
      patch.status=QUEUE;patch.reason="";
    }else if(action==="release"){
      if(b.status!==APPROVED)
        return bad("Release is locked until an auditor has approved this batch",409);
      if(!str(body.proof).trim())return bad("Attach the payment proof before releasing",422);
      patch.status=RELEASED;patch.proof=str(body.proof);patch.releasedAt=now();
    }else return bad("Unknown action");

    await writeWithAudit([db.update(wfBatches).set(patch).where(eq(wfBatches.id,id))],
      actorOf(req,body),"batch",id,`Batch ${action}`,
      `${b.vendor} · ${patch.status}${actor?" by "+actor.name:""}`);
    return Response.json({batch:{...b,...patch}});
  }catch(e){return oops(e)}}
