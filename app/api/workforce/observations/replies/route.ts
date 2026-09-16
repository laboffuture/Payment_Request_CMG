import{eq,sql}from"drizzle-orm";
import{getDb}from"../../../../../db";
import{wfObsReplies,wfObsTags,wfObservations}from"../../../../../db/schema";
import{actorOf,bad,oops,str,writeWithAudit}from"../../../../../lib/workforce-api";
import type{Row}from"../../../../../lib/workforce-api";
import{canSeeObservations,hasWriteRole,requireAuth}from"../../../../../lib/auth";
import{emailsForEmployees,notify}from"../../../../../lib/notify";

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    if(!canSeeObservations(actor?.roles))
      return bad("The observation register is for administration, accounts and audit.",403);
    const id=new URL(req.url).searchParams.get("observationId")||"";
    if(!id)return bad("observationId is required");
    const db=await getDb();
    return Response.json({replies:await db.select().from(wfObsReplies)
      .where(eq(wfObsReplies.observationId,id)).orderBy(wfObsReplies.at)});
  }catch(e){return oops(e)}}

/* A reply bumps the parent's counter in the same batch, so the list can show activity
   without counting replies per row.

   Tagging somebody is asking them to answer, so a person tagged on the observation may
   reply whatever their role - a Requestor included. Anyone else still needs a role that
   changes data. Who replied is taken from the session, never the request body, so a
   reply cannot be put in somebody else's name. */
export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const observationId=str(body.observationId);
    const text=str(body.text).slice(0,4000);
    if(!observationId||!text)return bad("observationId and text are required");
    const db=await getDb();
    const [obs]=await db.select().from(wfObservations).where(eq(wfObservations.id,observationId)).limit(1);
    if(!obs)return bad("Not found",404);
    const tagged=(await db.select({e:wfObsTags.employeeId}).from(wfObsTags)
      .where(eq(wfObsTags.observationId,observationId))).map(t=>t.e);
    const isTagged=!!actor?.employeeId&&tagged.includes(actor.employeeId);
    /* A person tagged on an observation may still answer it even if the register is not
       on their menu - being asked to respond is what makes the reply theirs to give. */
    if(!isTagged&&!canSeeObservations(actor?.roles))
      return bad("The observation register is for administration, accounts and audit.",403);
    if(!isTagged&&!hasWriteRole(actor?.roles))
      return bad("Only the people tagged on this observation can reply to it.",403);
    const at=new Date().toISOString();
    const row={id:`OR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
      observationId,employeeId:actor?.employeeId||"",
      authorName:actor?.name||actorOf(req,body),text,at};
    await writeWithAudit([
      db.insert(wfObsReplies).values(row),
      db.update(wfObservations)
        .set({replyCount:sql`${wfObservations.replyCount} + 1`,lastReplyAt:at})
        .where(eq(wfObservations.id,observationId))],
      actorOf(req,body),"observation",observationId,"Reply added",text.slice(0,80));
    /* The conversation goes to everyone in it: whoever raised it and everyone tagged. */
    await notify([obs.raisedByEmail||"",...await emailsForEmployees(tagged)],{
      title:`${actor?.name||"Someone"} replied on ${obs.title}`,body:text.slice(0,200),
      module:"observations",recordId:observationId},actor?.email);
    return Response.json({reply:row},{status:201});
  }catch(e){return oops(e)}}
