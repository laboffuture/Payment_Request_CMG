import{and,count,desc,eq,like,or}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfQueries}from"../../../../db/schema";
import{actorOf,bad,num,oops,page,search,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

const now=()=>new Date().toISOString();
const shape=(q:Row)=>({id:str(q.id),ref:str(q.ref),title:str(q.title),detail:str(q.detail),
  raisedBy:str(q.raisedBy),employeeId:str(q.employeeId),taskId:str(q.taskId),deptId:str(q.deptId,"d-group"),
  priority:str(q.priority,"Medium"),status:str(q.status,"Open"),raisedAt:str(q.raisedAt)||now(),
  dueAt:str(q.dueAt),followUps:num(q.followUps),lastFollowUpAt:str(q.lastFollowUpAt),
  resolvedAt:str(q.resolvedAt),resolution:str(q.resolution)});

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const db=await getDb();
    const employeeId=url.searchParams.get("employeeId");
    const deptId=url.searchParams.get("deptId");
    const status=url.searchParams.get("status");
    const q=search(url.searchParams.get("q"));
    const filters=[
      employeeId?eq(wfQueries.employeeId,employeeId):undefined,
      deptId?eq(wfQueries.deptId,deptId):undefined,
      status?eq(wfQueries.status,status):undefined,
      q?or(like(wfQueries.title,q),like(wfQueries.ref,q)):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfQueries).where(where).orderBy(desc(wfQueries.raisedAt)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfQueries).where(where)]);
    return Response.json({queries:rows,total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.title)||!str(body.employeeId))return bad("title and employeeId are required");
    const id=str(body.id)||`Q-${Date.now().toString(36)}`;
    const row=shape({...body,id,ref:str(body.ref)||`QRY-${Date.now().toString(36).toUpperCase()}`});
    await writeWithAudit([(await getDb()).insert(wfQueries).values(row)],
      actorOf(req,body),"query",id,"Query raised",`${row.ref} · ${row.title}`);
    return Response.json({query:row},{status:201});
  }catch(e){return oops(e)}}

/* Follow-up and resolution are server-side state transitions rather than free-form
   field writes, so the follow-up count and resolution date cannot drift. */
export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [existing]=await db.select().from(wfQueries).where(eq(wfQueries.id,id)).limit(1);
    if(!existing)return bad("Not found",404);
    const action=str(body.action);
    let row=shape({...existing,...body,id});
    if(action==="follow-up")
      row={...row,followUps:existing.followUps+1,lastFollowUpAt:now(),
        status:existing.status==="Open"?"Followed Up":existing.status};
    if(action==="resolve")
      row={...row,status:"Resolved",resolvedAt:now(),resolution:str(body.resolution)||row.resolution};
    if(action==="reopen")
      row={...row,status:"Open",resolvedAt:"",resolution:""};
    await writeWithAudit([db.update(wfQueries).set(row).where(eq(wfQueries.id,id))],
      actorOf(req,body),"query",id,
      action==="follow-up"?"Query followed up":action==="resolve"?"Query resolved":"Query updated",
      `${row.ref} · ${row.status}`);
    return Response.json({query:row});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    await writeWithAudit([(await getDb()).delete(wfQueries).where(eq(wfQueries.id,id))],
      actorOf(req),"query",id,"Query deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
