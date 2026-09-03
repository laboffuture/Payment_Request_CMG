import{eq,sql}from"drizzle-orm";
import{getDb}from"../../../../../db";
import{wfObsReplies,wfObservations}from"../../../../../db/schema";
import{actorOf,bad,oops,str,writeWithAudit}from"../../../../../lib/workforce-api";
import type{Row}from"../../../../../lib/workforce-api";
import{requireAuth}from"../../../../../lib/auth";

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("observationId")||"";
    if(!id)return bad("observationId is required");
    const db=await getDb();
    return Response.json({replies:await db.select().from(wfObsReplies)
      .where(eq(wfObsReplies.observationId,id)).orderBy(wfObsReplies.at)});
  }catch(e){return oops(e)}}

/* A reply bumps the parent's counter in the same batch, so the list can show
   activity without counting replies per row. */
export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const observationId=str(body.observationId);
    const text=str(body.text).slice(0,4000);
    if(!observationId||!text)return bad("observationId and text are required");
    const at=new Date().toISOString();
    const row={id:`OR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
      observationId,employeeId:str(body.employeeId),
      authorName:str(body.authorName)||actorOf(req,body),text,at};
    const db=await getDb();
    await writeWithAudit([
      db.insert(wfObsReplies).values(row),
      db.update(wfObservations)
        .set({replyCount:sql`${wfObservations.replyCount} + 1`,lastReplyAt:at})
        .where(eq(wfObservations.id,observationId))],
      actorOf(req,body),"observation",observationId,"Reply added",text.slice(0,80));
    return Response.json({reply:row},{status:201});
  }catch(e){return oops(e)}}
