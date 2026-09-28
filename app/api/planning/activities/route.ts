import{and,asc,eq,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfPlanActivities,wfUsers}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{planFor}from"../../../../lib/planning-access";
import{ACTIVITY_STATUSES}from"../../../../lib/planning-stages";
import{actorOf,bad,num,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* The project schedule of a plan: its activities. Anyone who can see the plan can read
   them; its project manager and accounts add and change them, as they do the plan. */

const now=()=>new Date().toISOString();
const lower=(v:unknown)=>str(v).trim().toLowerCase();
const date=/^\d{4}-\d{2}-\d{2}$/;

/* The fields of an activity from the request, checked; or the reason they cannot be saved. */
async function fieldsOf(body:Row):Promise<Row|string>{
  const f={activity:str(body.activity).trim(),startDate:str(body.startDate),plannedEnd:str(body.plannedEnd),
    actualStart:str(body.actualStart),actualEnd:str(body.actualEnd),dependency:str(body.dependency).trim(),
    percent:num(body.percent),status:str(body.status),remarks:str(body.remarks).trim()};
  if(!f.activity)return"Activity must be filled in.";
  if(!date.test(f.startDate)||!date.test(f.plannedEnd))return"Start date and planned completion date must be filled in.";
  if(f.plannedEnd<f.startDate)return"The planned completion date cannot be before the start date.";
  if(f.actualStart&&!date.test(f.actualStart)||f.actualEnd&&!date.test(f.actualEnd))return"Enter the actual dates as dates.";
  if(f.actualEnd&&!f.actualStart)return"Enter the actual start date before the actual completion date.";
  if(f.actualEnd&&f.actualEnd<f.actualStart)return"The actual completion date cannot be before the actual start date.";
  if(str(body.percent).trim()===""||f.percent<0||f.percent>100)return"% completion must be between 0 and 100.";
  if(!(ACTIVITY_STATUSES as readonly string[]).includes(f.status))return`Status must be one of ${ACTIVITY_STATUSES.join(", ")}.`;
  if(f.status==="Completed"&&f.percent!==100)return"A completed activity is 100% complete.";
  const email=lower(body.responsibleEmail);
  if(!email)return"Responsible person must be chosen.";
  const db=await getDb();
  const[u]=await db.select({name:wfUsers.name,email:wfUsers.email,active:wfUsers.active}).from(wfUsers)
    .where(sql`lower(${wfUsers.email}) = ${email}`);
  if(!u||!u.active)return"Responsible person: choose someone from the list of people with a login.";
  return{...f,responsibleName:u.name||u.email,responsibleEmail:u.email};
}

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const found=await planFor(actor,str(new URL(req.url).searchParams.get("planId")));
    if(!found)return bad("That plan no longer exists",404);
    const db=await getDb();
    const activities=await db.select().from(wfPlanActivities).where(eq(wfPlanActivities.planId,found.plan.id))
      .orderBy(asc(wfPlanActivities.startDate),asc(wfPlanActivities.createdAt));
    return Response.json({activities,canEdit:found.edit});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const found=await planFor(actor,str(body.planId));
    if(!found)return bad("That plan no longer exists",404);
    if(!found.edit)return bad(`The schedule of a plan at ${found.plan.stage} cannot be changed by you.`,403);
    const f=await fieldsOf(body);
    if(typeof f==="string")return bad(f,422);
    const{plan}=found;
    const row={...f,id:`PA-${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`,planId:plan.id,
      jobCode:plan.jobCode||plan.jobRef,createdBy:actor?.email||"",createdAt:now(),updatedAt:now()} as typeof wfPlanActivities.$inferInsert;
    const db=await getDb();
    await writeWithAudit([db.insert(wfPlanActivities).values(row)],actorOf(req,body),"planning",plan.id,
      "Schedule activity added",`${plan.ref} · ${row.activity}`);
    return Response.json({activity:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const db=await getDb();
    const[act]=await db.select().from(wfPlanActivities).where(eq(wfPlanActivities.id,str(body.id)));
    const found=act&&await planFor(actor,act.planId);
    if(!act||!found)return bad("That activity no longer exists",404);
    if(!found.edit)return bad(`The schedule of a plan at ${found.plan.stage} cannot be changed by you.`,403);
    const f=await fieldsOf(body);
    if(typeof f==="string")return bad(f,422);
    const patch={...f,updatedAt:now()};
    await writeWithAudit([db.update(wfPlanActivities).set(patch).where(eq(wfPlanActivities.id,act.id))],
      actorOf(req,body),"planning",act.planId,"Schedule activity updated",
      `${found.plan.ref} · ${str(f.activity)} · ${num(f.percent)}% · ${str(f.status)}`);
    return Response.json({activity:{...act,...patch}});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const id=str(new URL(req.url).searchParams.get("id"));
    const db=await getDb();
    const[act]=await db.select().from(wfPlanActivities).where(eq(wfPlanActivities.id,id));
    const found=act&&await planFor(actor,act.planId);
    if(!act||!found)return bad("That activity no longer exists",404);
    if(!found.edit)return bad(`The schedule of a plan at ${found.plan.stage} cannot be changed by you.`,403);
    await writeWithAudit([db.delete(wfPlanActivities).where(and(eq(wfPlanActivities.id,id),eq(wfPlanActivities.planId,act.planId)))],
      actorOf(req),"planning",act.planId,"Schedule activity removed",`${found.plan.ref} · ${act.activity}`);
    return Response.json({ok:true});
  }catch(e){return oops(e)}}
