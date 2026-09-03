import{and,count,desc,eq,like}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfTokens}from"../../../../db/schema";
import{actorOf,bad,num,oops,page,search,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

const shape=(t:Row)=>({id:str(t.id),number:str(t.number),taskType:str(t.taskType),created:str(t.created),
  createdBy:str(t.createdBy),employeeId:str(t.employeeId),functionRoleId:str(t.functionRoleId),
  deptId:str(t.deptId,"d-group"),priority:str(t.priority,"Medium"),reference:str(t.reference),
  qty:num(t.qty),done:num(t.done),status:str(t.status,"Not Started"),remarks:str(t.remarks)});

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
      employeeId?eq(wfTokens.employeeId,employeeId):undefined,
      deptId?eq(wfTokens.deptId,deptId):undefined,
      status?eq(wfTokens.status,status):undefined,
      q?like(wfTokens.taskType,q):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfTokens).where(where).orderBy(desc(wfTokens.created)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfTokens).where(where)]);
    return Response.json({tokens:rows,total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.taskType)||!str(body.employeeId))return bad("taskType and employeeId are required");
    const id=str(body.id)||`TKN-${Date.now().toString(36)}`;
    const row=shape({...body,id});
    await writeWithAudit([(await getDb()).insert(wfTokens).values(row)],
      actorOf(req,body),"token",id,"Token issued",`${row.number} · ${row.qty} items`);
    return Response.json({token:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const row=shape(body);
    await writeWithAudit([(await getDb()).update(wfTokens).set(row).where(eq(wfTokens.id,id))],
      actorOf(req,body),"token",id,"Token updated",`${row.number} · ${row.done}/${row.qty}`);
    return Response.json({token:row});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    await writeWithAudit([(await getDb()).delete(wfTokens).where(eq(wfTokens.id,id))],
      actorOf(req),"token",id,"Token deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
