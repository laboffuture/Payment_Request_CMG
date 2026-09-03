import{eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfDepartments,wfEmployees,wfRoles}from"../../../../db/schema";
import{actorOf,bad,num,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

const shape=(d:Row)=>({id:str(d.id),name:str(d.name),code:str(d.code),
  color:str(d.color,"#0b725d"),position:num(d.position)});

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;return Response.json({departments:await (await getDb()).select().from(wfDepartments).orderBy(wfDepartments.position)})}
  catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.name))return bad("name is required");
    const row=shape({...body,id:str(body.id)||`d-${Date.now().toString(36)}`});
    await writeWithAudit([(await getDb()).insert(wfDepartments).values(row)],
      actorOf(req,body),"department",row.id,"Department created",row.name);
    return Response.json({department:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const row=shape(body);
    await writeWithAudit([(await getDb()).update(wfDepartments).set(row).where(eq(wfDepartments.id,id))],
      actorOf(req,body),"department",id,"Department updated",row.name);
    return Response.json({department:row});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [roles,staff]=await Promise.all([
      db.select({id:wfRoles.id}).from(wfRoles).where(eq(wfRoles.deptId,id)).limit(1),
      db.select({id:wfEmployees.id}).from(wfEmployees).where(eq(wfEmployees.deptId,id)).limit(1)]);
    if(roles.length||staff.length)
      return bad("This department still has roles or employees. Move them before deleting.",409);
    await writeWithAudit([db.delete(wfDepartments).where(eq(wfDepartments.id,id))],
      actorOf(req),"department",id,"Department deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
