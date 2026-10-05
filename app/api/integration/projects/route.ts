import{and,asc,eq}from"drizzle-orm";
import{getBindings,getDb}from"../../../../db";
import{settingOptions}from"../../../../db/schema";
import{oops}from"../../../../lib/workforce-api";
import{readBearer,safeEqual}from"../../../../lib/auth";
import{parseJobs}from"../../../../lib/jobs";

/* The job register, read by Material Management as its project list, so one register
   feeds the project dropdowns of both sides: a job added under Settings appears in the
   payment form and in the material request alike.

   Same guard as the staff list beside it: the shared service token, never a browser
   session, and closed when no token is configured. Retired jobs are included and
   marked inactive, so Material can retire them too rather than keep offering them. */
export async function GET(req:Request){
  try{
    const env=await getBindings() as {INTEGRATION_TOKEN?:string};
    const expected=String(env.INTEGRATION_TOKEN||"").trim().toLowerCase();
    const presented=readBearer(req).toLowerCase();
    if(!expected||!presented||!safeEqual(presented,expected))
      return Response.json({error:"Not authorised"},{status:401});
    const db=await getDb();
    const rows=await db.select().from(settingOptions)
      .where(and(eq(settingOptions.listId,"payment.job")))
      .orderBy(asc(settingOptions.position));
    const out=[];
    for(const row of rows){
      const[job]=parseJobs([row.name]);
      if(!job)continue;
      out.push({id:row.id,code:job.code,project:job.project,location:job.location,active:!!row.active});
    }
    return Response.json(out);
  }catch(e){return oops(e)}}
