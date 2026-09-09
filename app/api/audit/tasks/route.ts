import{and,count,desc,eq,like,or}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfAuditTasks}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{actorOf,bad,oops,page,search,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

const KINDS=["Pre-Audit","Post-Audit","Special Audit","Meeting"];
const STATUS=["Available","Accepted","In Progress","Observation Submitted","Response Received","Completed"];
const now=()=>new Date().toISOString();
const shape=(t:Row)=>({id:str(t.id),ref:str(t.ref),title:str(t.title),kind:str(t.kind,"Pre-Audit"),
  companyId:str(t.companyId),department:str(t.department),status:str(t.status,"Available"),
  assignedTo:str(t.assignedTo),due:str(t.due),plannedStart:str(t.plannedStart),
  plannedEnd:str(t.plannedEnd),notes:str(t.notes),dataProvider:str(t.dataProvider),
  attendees:str(t.attendees),
  createdAt:str(t.createdAt)||now(),acceptedAt:str(t.acceptedAt),completedAt:str(t.completedAt),extra:str(t.extra)});

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const db=await getDb();
    const kind=url.searchParams.get("kind");
    const status=url.searchParams.get("status");
    const companyId=url.searchParams.get("companyId");
    const assignedTo=url.searchParams.get("assignedTo");
    const q=search(url.searchParams.get("q"));
    const filters=[
      kind?eq(wfAuditTasks.kind,kind):undefined,
      status?eq(wfAuditTasks.status,status):undefined,
      companyId?eq(wfAuditTasks.companyId,companyId):undefined,
      assignedTo?eq(wfAuditTasks.assignedTo,assignedTo):undefined,
      q?or(like(wfAuditTasks.title,q),like(wfAuditTasks.ref,q)):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfAuditTasks).where(where)
        .orderBy(desc(wfAuditTasks.due)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfAuditTasks).where(where)]);
    return Response.json({tasks:rows,total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.title))return bad("title is required");
    if(KINDS.indexOf(str(body.kind,"Pre-Audit"))<0)return bad(`kind must be one of ${KINDS.join(", ")}`);
    const id=str(body.id)||`AT-${Date.now().toString(36)}`;
    const row=shape({...body,id,ref:str(body.ref)||`AUD-${Date.now().toString(36).toUpperCase()}`});
    await writeWithAudit([(await getDb()).insert(wfAuditTasks).values(row)],
      actorOf(req,body),"audit-task",id,"Audit task created",`${row.ref} · ${row.title}`);
    return Response.json({task:row},{status:201});
  }catch(e){return oops(e)}}

/* Accepting and completing are server-side transitions, so the assignee and the
   timestamps cannot drift from the status. Two auditors racing for the same task:
   the second gets a clear 409 rather than silently stealing it. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [existing]=await db.select().from(wfAuditTasks).where(eq(wfAuditTasks.id,id)).limit(1);
    if(!existing)return bad("Not found",404);
    const action=str(body.action);
    let row=shape({...existing,...body,id});
    if(action==="accept"){
      if(existing.status!=="Available")
        return bad(`Already taken by ${existing.assignedTo||"somebody else"}`,409);
      row={...row,status:"Accepted",assignedTo:actor?.name||row.assignedTo,acceptedAt:now()};
    }
    if(action==="complete")row={...row,status:"Completed",completedAt:now()};
    if(STATUS.indexOf(row.status)<0)return bad(`status must be one of ${STATUS.join(", ")}`);
    await writeWithAudit([db.update(wfAuditTasks).set(row).where(eq(wfAuditTasks.id,id))],
      actorOf(req,body),"audit-task",id,
      action==="accept"?"Audit task accepted":action==="complete"?"Audit task completed":"Audit task updated",
      `${row.ref} · ${row.status}`);
    return Response.json({task:row});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    await writeWithAudit([(await getDb()).delete(wfAuditTasks).where(eq(wfAuditTasks.id,id))],
      actorOf(req),"audit-task",id,"Audit task deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}

/* Bulk import, chunked for D1's 100-parameter limit across 16 columns. */
export async function PUT(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const list=Array.isArray(body.rows)?body.rows as Row[]:[];
    if(!list.length)return bad("No rows supplied");
    if(list.length>300)return bad("At most 300 rows per import",413);
    const good:Record<string,unknown>[]=[];
    const errors:{row:number;reason:string}[]=[];
    list.forEach((r,i)=>{
      const line=Number(r.line)||i+1;
      if(!str(r.title))return errors.push({row:line,reason:"title is required"});
      const kind=str(r.kind,"Pre-Audit");
      if(KINDS.indexOf(kind)<0)return errors.push({row:line,reason:`kind "${kind}" is not valid`});
      good.push(shape({...r,kind,id:`AT-imp-${Date.now().toString(36)}-${i}`,
        ref:str(r.ref)||`AUD-${Date.now().toString(36).toUpperCase()}-${i}`}));
    });
    if(good.length){
      const db=await getDb();
      const statements=[];
      for(let i=0;i<good.length;i+=6)
        statements.push(db.insert(wfAuditTasks).values(good.slice(i,i+6) as never));
      await writeWithAudit(statements,actorOf(req,body),"audit-task","import","Audit tasks imported",
        `${good.length} imported, ${errors.length} rejected`);
    }
    return Response.json({imported:good.length,rejected:errors.length,errors:errors.slice(0,100)},
      {status:good.length?201:422});
  }catch(e){return oops(e)}}
