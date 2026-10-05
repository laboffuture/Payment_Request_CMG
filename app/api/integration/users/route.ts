import{asc,eq}from"drizzle-orm";
import{getBindings,getDb}from"../../../../db";
import{wfUsers}from"../../../../db/schema";
import{oops}from"../../../../lib/workforce-api";
import{readBearer,safeEqual}from"../../../../lib/auth";

/* The staff list, read by Material Management so the one administrator here decides who
   exists there too. Material's "Import from Payment app" screen and its merge script call
   this; nothing else does.

   It answers to a shared service token (INTEGRATION_TOKEN, 64 hex characters, set in
   .dev.vars locally and in the container environment on the server), never to a browser
   session. With no token configured the endpoint is closed rather than open. Only active
   accounts are listed, and only the three fields Material needs - no hashes, no roles. */
export async function GET(req:Request){
  try{
    const env=await getBindings() as {INTEGRATION_TOKEN?:string};
    const expected=String(env.INTEGRATION_TOKEN||"").trim().toLowerCase();
    const presented=readBearer(req).toLowerCase();
    if(!expected||!presented||!safeEqual(presented,expected))
      return Response.json({error:"Not authorised"},{status:401});
    const db=await getDb();
    const rows=await db.select({id:wfUsers.id,name:wfUsers.name,email:wfUsers.email})
      .from(wfUsers).where(eq(wfUsers.active,1)).orderBy(asc(wfUsers.name));
    return Response.json(rows.map(r=>({id:r.id,name:r.name,email:String(r.email||"").toLowerCase()})));
  }catch(e){return oops(e)}}
