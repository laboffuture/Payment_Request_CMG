import{eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfEmployees,wfRoles}from"../../../../db/schema";
import{actorOf,bad,nullable,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

const shape=(r:Row)=>({id:str(r.id),deptId:str(r.deptId,"d-group"),name:str(r.name),
  type:str(r.type,"Support"),parentId:nullable(r.parentId),color:str(r.color,"#0b725d"),jd:str(r.jd)});

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const deptId=new URL(req.url).searchParams.get("deptId");
    const db=await getDb();
    const rows=deptId?await db.select().from(wfRoles).where(eq(wfRoles.deptId,deptId))
                     :await db.select().from(wfRoles);
    return Response.json({roles:rows});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.name))return bad("name is required");
    const row=shape({...body,id:str(body.id)||`r-${Date.now().toString(36)}`});
    await writeWithAudit([(await getDb()).insert(wfRoles).values(row)],
      actorOf(req,body),"role",row.id,"Role created",`${row.name} (${row.type})`);
    return Response.json({role:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const row=shape(body);
    if(row.parentId===id)return bad("A role cannot report to itself",409);
    await writeWithAudit([(await getDb()).update(wfRoles).set(row).where(eq(wfRoles.id,id))],
      actorOf(req,body),"role",id,"Role updated",row.name);
    return Response.json({role:row});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [staff,children]=await Promise.all([
      db.select({id:wfEmployees.id}).from(wfEmployees).where(eq(wfEmployees.roleId,id)).limit(1),
      db.select({id:wfRoles.id}).from(wfRoles).where(eq(wfRoles.parentId,id)).limit(1)]);
    if(staff.length)return bad("This role still has employees mapped to it. Move them first.",409);
    if(children.length)return bad("This role still has child roles. Remove or re-parent them first.",409);
    await writeWithAudit([db.delete(wfRoles).where(eq(wfRoles.id,id))],
      actorOf(req),"role",id,"Role deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
