import{and,asc,count,desc,eq,like,lt,ne,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfTasks}from"../../../../db/schema";
import{actorOf,bad,num,oops,page,search,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

const today=()=>new Date().toISOString().slice(0,10);
const shape=(t:Row)=>({id:str(t.id),seriesId:str(t.seriesId),name:str(t.name),description:str(t.description),
  frequency:str(t.frequency,"Daily"),period:str(t.period),start:str(t.start),due:str(t.due),
  priority:str(t.priority,"Medium"),employeeId:str(t.employeeId),deptId:str(t.deptId,"d-group"),
  assignedBy:str(t.assignedBy),expectedOutput:str(t.expectedOutput),remarks:str(t.remarks),
  status:str(t.status,"Not Started"),progress:num(t.progress),qty:num(t.qty),done:num(t.done),
  blocker:str(t.blocker),nextAction:str(t.nextAction),completedAt:str(t.completedAt),
  updatedAt:new Date().toISOString()});

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const db=await getDb();
    const employeeId=url.searchParams.get("employeeId");
    const deptId=url.searchParams.get("deptId");
    const frequency=url.searchParams.get("frequency");
    const status=url.searchParams.get("status");
    const from=url.searchParams.get("from");
    const to=url.searchParams.get("to");
    const q=search(url.searchParams.get("q"));
    const filters=[
      employeeId?eq(wfTasks.employeeId,employeeId):undefined,
      deptId?eq(wfTasks.deptId,deptId):undefined,
      frequency?eq(wfTasks.frequency,frequency):undefined,
      status==="Overdue"?and(lt(wfTasks.due,today()),ne(wfTasks.status,"Completed"),ne(wfTasks.status,"Cancelled"))
        :status?eq(wfTasks.status,status):undefined,
      from?sql`${wfTasks.due} >= ${from}`:undefined,
      to?sql`${wfTasks.due} <= ${to}`:undefined,
      q?like(wfTasks.name,q):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfTasks).where(where).orderBy(desc(wfTasks.due)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfTasks).where(where)]);
    return Response.json({tasks:rows,total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.name)||!str(body.employeeId))return bad("name and employeeId are required");
    const id=str(body.id)||`T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
    const row=shape({...body,id,seriesId:str(body.seriesId)||`S-${id}`});
    await writeWithAudit([(await getDb()).insert(wfTasks).values(row)],
      actorOf(req,body),"task",id,"Task assigned",`${row.name} → ${row.employeeId}`);
    return Response.json({task:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const row=shape(body);
    await writeWithAudit([(await getDb()).update(wfTasks).set(row).where(eq(wfTasks.id,id))],
      actorOf(req,body),"task",id,"Task updated",`${row.name} · ${row.status} ${row.progress}%`);
    return Response.json({task:row});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    await writeWithAudit([(await getDb()).delete(wfTasks).where(eq(wfTasks.id,id))],
      actorOf(req),"task",id,"Task deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}

/* Bulk insert for the recurring engine. Capped so one call cannot blow the D1
   subrequest budget or the 100-parameter bind limit per statement. */
export async function PUT(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const list=Array.isArray(body.tasks)?body.tasks as Row[]:[];
    if(!list.length)return Response.json({inserted:0});
    if(list.length>100)return bad("At most 100 tasks per request",413);
    const rows=list.map(t=>shape(t));
    await writeWithAudit([(await getDb()).insert(wfTasks).values(rows)],
      actorOf(req,body),"task","batch","Recurring occurrences created",`${rows.length} tasks`);
    return Response.json({inserted:rows.length},{status:201});
  }catch(e){return oops(e)}}
