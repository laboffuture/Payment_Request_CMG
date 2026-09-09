import{asc,eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfAuditTasks,wfCompanies}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{actorOf,bad,num,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

const shape=(c:Row)=>({id:str(c.id),name:str(c.name),code:str(c.code),
  currency:str(c.currency,"AED"),country:str(c.country),
  reminderDays:Math.max(0,Math.min(num(c.reminderDays)||2,90)),
  escalationDays:Math.max(0,Math.min(num(c.escalationDays)||5,90)),
  managementEmail:str(c.managementEmail).slice(0,200),
  active:c.active===false?0:1,position:num(c.position),extra:str(c.extra)});

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const rows=await (await getDb()).select().from(wfCompanies).orderBy(asc(wfCompanies.position));
    return Response.json({companies:rows.map(r=>({...r,active:!!r.active}))});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"admin");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.name))return bad("name is required");
    const row=shape({...body,id:str(body.id)||`co-${Date.now().toString(36)}`});
    await writeWithAudit([(await getDb()).insert(wfCompanies).values(row)],
      actorOf(req,body),"company",row.id,"Company created",row.name);
    return Response.json({company:{...row,active:!!row.active}},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"admin");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const row=shape(body);
    await writeWithAudit([(await getDb()).update(wfCompanies).set(row).where(eq(wfCompanies.id,id))],
      actorOf(req,body),"company",id,"Company updated",row.name);
    return Response.json({company:{...row,active:!!row.active}});
  }catch(e){return oops(e)}}

/* A company with audit work against it is deactivated rather than deleted, so the
   history stays readable. */
export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"admin");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [used]=await db.select({id:wfAuditTasks.id}).from(wfAuditTasks)
      .where(eq(wfAuditTasks.companyId,id)).limit(1);
    if(used){
      await writeWithAudit([db.update(wfCompanies).set({active:0}).where(eq(wfCompanies.id,id))],
        actorOf(req),"company",id,"Company deactivated","Audit history exists, record retained");
      return Response.json({deactivated:true});
    }
    await writeWithAudit([db.delete(wfCompanies).where(eq(wfCompanies.id,id))],
      actorOf(req),"company",id,"Company deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
