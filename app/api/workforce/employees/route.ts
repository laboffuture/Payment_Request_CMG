import{and,asc,count,eq,like,or,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfEmployees,wfPhotos,wfQueries,wfTasks,wfTokens}from"../../../../db/schema";
import{actorOf,bad,nullable,oops,page,search,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

const shape=(e:Row)=>({id:str(e.id),code:str(e.code),name:str(e.name),designation:str(e.designation),
  roleId:str(e.roleId),deptId:str(e.deptId,"d-group"),department:str(e.department),
  reportsTo:nullable(e.reportsTo),email:str(e.email),phone:str(e.phone),jd:str(e.jd),
  photoAt:str(e.photoAt),active:e.active===false?0:1,joined:str(e.joined),
  companyId:str(e.companyId,"c-trg")});

/* Always paginated and always filtered in SQL. The directory never pulls the whole
   register into the browser, so headcount does not change page weight. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const db=await getDb();
    const id=url.searchParams.get("id");
    if(id){
      const [row]=await db.select().from(wfEmployees).where(eq(wfEmployees.id,id)).limit(1);
      return row?Response.json({employee:{...row,active:!!row.active}}):bad("Not found",404);
    }
    const{limit,offset}=page(url);
    const q=search(url.searchParams.get("q"));
    const deptId=url.searchParams.get("deptId");
    const roleId=url.searchParams.get("roleId");
    const companyId=url.searchParams.get("companyId");
    const activeOnly=url.searchParams.get("active")==="1";
    const filters=[
      q?or(like(wfEmployees.name,q),like(wfEmployees.code,q),like(wfEmployees.department,q)):undefined,
      deptId?eq(wfEmployees.deptId,deptId):undefined,
      roleId?eq(wfEmployees.roleId,roleId):undefined,
      companyId?eq(wfEmployees.companyId,companyId):undefined,
      activeOnly?eq(wfEmployees.active,1):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfEmployees).where(where).orderBy(asc(wfEmployees.name)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfEmployees).where(where)]);
    return Response.json({employees:rows.map(r=>({...r,active:!!r.active})),
      total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.name)||!str(body.code))return bad("name and code are required");
    const row=shape({...body,id:str(body.id)||`E-${Date.now().toString(36)}`});
    await writeWithAudit([(await getDb()).insert(wfEmployees).values(row)],
      actorOf(req,body),"employee",row.id,"Employee created",`${row.name} · ${row.code}`);
    return Response.json({employee:{...row,active:!!row.active}},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    if(str(body.reportsTo)===id)return bad("An employee cannot report to themselves",409);
    const row=shape(body);
    await writeWithAudit([(await getDb()).update(wfEmployees).set(row).where(eq(wfEmployees.id,id))],
      actorOf(req,body),"employee",id,"Employee updated",row.name);
    return Response.json({employee:{...row,active:!!row.active}});
  }catch(e){return oops(e)}}

/* Anyone with task, token or query history is deactivated rather than removed, so
   historical reporting stays intact. Only a clean record is actually deleted. */
export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [t,k,q]=await Promise.all([
      db.select({id:wfTasks.id}).from(wfTasks).where(eq(wfTasks.employeeId,id)).limit(1),
      db.select({id:wfTokens.id}).from(wfTokens).where(eq(wfTokens.employeeId,id)).limit(1),
      db.select({id:wfQueries.id}).from(wfQueries).where(eq(wfQueries.employeeId,id)).limit(1)]);
    if(t.length||k.length||q.length){
      await writeWithAudit([db.update(wfEmployees).set({active:0}).where(eq(wfEmployees.id,id))],
        actorOf(req),"employee",id,"Employee deactivated","History exists, record retained");
      return Response.json({deactivated:true});
    }
    await writeWithAudit([db.delete(wfEmployees).where(eq(wfEmployees.id,id)),
      db.delete(wfPhotos).where(eq(wfPhotos.employeeId,id))],
      actorOf(req),"employee",id,"Employee deleted","No history existed");
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
