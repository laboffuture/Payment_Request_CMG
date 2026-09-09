import{and,count,desc,eq,or}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfDepartments,wfEmployees,wfTrainings}from"../../../../db/schema";
import{hasWriteRole,requireAuth}from"../../../../lib/auth";
import{bad,num,oops,page,str}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* Training requests.

   Anybody signed in may ask to be taught something - that is the point of the queue, and
   a requestor who cannot change anything else can still put their hand up. Taking a
   request on and marking it delivered is a write role's job. Rating it belongs to the
   person who asked, and to nobody else. */

const now=()=>new Date().toISOString();

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const status=url.searchParams.get("status");
    const mine=url.searchParams.get("mine")==="1";
    const db=await getDb();
    const filters=[
      status?eq(wfTrainings.status,status):undefined,
      mine&&actor?.email?or(eq(wfTrainings.requestedBy,actor.email),
        eq(wfTrainings.acceptedBy,actor.email)):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfTrainings).where(where)
        .orderBy(desc(wfTrainings.requestedAt)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfTrainings).where(where)]);
    return Response.json({trainings:rows,total:total?.n??0,limit,offset,
      me:actor?.email||"",canDeliver:hasWriteRole(actor?.roles)});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const topic=str(body.topic).trim().slice(0,200);
    if(topic.length<3)return bad("Say what you would like to be trained on.");
    /* A request can be raised for somebody else - a manager asking on behalf of their
       team - so the person it is for is looked up rather than assumed. Left blank it
       falls back to whoever is asking. */
    const db=await getDb();
    let employeeId=str(body.employeeId), employeeName="", deptId=str(body.deptId), department="";
    if(employeeId){
      const [person]=await db.select().from(wfEmployees).where(eq(wfEmployees.id,employeeId)).limit(1);
      if(!person)return bad("That employee is not on any organisation chart",422);
      employeeName=person.name; if(!deptId)deptId=person.deptId;
    }else{
      employeeId=str(actor?.employeeId); employeeName=str(actor?.name);
    }
    if(deptId){
      const [dept]=await db.select().from(wfDepartments).where(eq(wfDepartments.id,deptId)).limit(1);
      if(!dept)return bad("That department does not exist",422);
      department=dept.name;
    }
    const at=now();
    const row={
      id:`TR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
      ref:`TRN-${String(Date.now()).slice(-6)}`,
      topic,reason:str(body.reason).trim().slice(0,1000),
      employeeId,employeeName,deptId,department,
      requestedBy:str(actor?.email),status:"Requested",requestedAt:at,
      acceptedBy:"",acceptedAt:"",completedBy:"",completedAt:"",
      rating:0,feedback:"",feedbackAt:"",extra:str(body.extra)};
    await db.insert(wfTrainings).values(row);
    return Response.json({training:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    const action=str(body.action);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [row]=await db.select().from(wfTrainings).where(eq(wfTrainings.id,id)).limit(1);
    if(!row)return bad("Not found",404);
    const me=actor?.email||"";
    const deliverer=hasWriteRole(actor?.roles);
    const at=now();

    if(action==="accept"){
      if(!deliverer)return bad("Your role cannot take on a training request.",403);
      if(row.status!=="Requested")return bad("Only a new request can be taken on",409);
      await db.update(wfTrainings).set({status:"Accepted",acceptedBy:me,acceptedAt:at})
        .where(eq(wfTrainings.id,id));
      return Response.json({status:"Accepted",acceptedBy:me});
    }
    if(action==="complete"){
      if(!deliverer)return bad("Your role cannot mark training delivered.",403);
      if(row.status!=="Accepted")return bad("Take the request on before marking it delivered",409);
      await db.update(wfTrainings).set({status:"Completed",completedBy:me,completedAt:at})
        .where(eq(wfTrainings.id,id));
      return Response.json({status:"Completed",completedBy:me});
    }
    if(action==="feedback"){
      // only the person who asked can say whether it helped
      if(row.requestedBy!==me)return bad("Only the person who asked can rate this training.",403);
      if(row.status!=="Completed")return bad("Rate it once it has been delivered",409);
      const rating=Math.min(Math.max(num(body.rating),1),5);
      await db.update(wfTrainings).set({rating,feedback:str(body.feedback).trim().slice(0,1000),
        feedbackAt:at}).where(eq(wfTrainings.id,id));
      return Response.json({rating});
    }
    if(action==="cancel"){
      if(row.requestedBy!==me&&!deliverer)
        return bad("Only the person who asked can withdraw this request.",403);
      if(row.status==="Completed")return bad("Delivered training cannot be withdrawn",409);
      await db.delete(wfTrainings).where(eq(wfTrainings.id,id));
      return Response.json({deleted:true});
    }
    return bad("Unknown action");
  }catch(e){return oops(e)}}
