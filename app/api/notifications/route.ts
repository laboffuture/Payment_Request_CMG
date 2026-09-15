import{and,count,desc,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{wfNotifications}from"../../../db/schema";
import{requireAuth}from"../../../lib/auth";
import{oops,str}from"../../../lib/workforce-api";
import type{Row}from"../../../lib/workforce-api";

/* A person's own notifications, and nobody else's: the recipient is always taken from
   the session, never from the request, so one person cannot read or clear another's. */

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const me=(actor?.email||"").toLowerCase();
    const db=await getDb();
    const[rows,[unread]]=await Promise.all([
      db.select().from(wfNotifications).where(eq(wfNotifications.recipient,me))
        .orderBy(desc(wfNotifications.createdAt)).limit(30),
      db.select({n:count()}).from(wfNotifications)
        .where(and(eq(wfNotifications.recipient,me),eq(wfNotifications.readAt,"")))]);
    return Response.json({notifications:rows,unread:unread?.n??0});
  }catch(e){return oops(e)}}

/* Mark one read ({id}) or all of them ({all:true}). */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const me=(actor?.email||"").toLowerCase();
    const body=await req.json() as Row;
    const db=await getDb();
    const which=body.all
      ?and(eq(wfNotifications.recipient,me),eq(wfNotifications.readAt,""))
      :and(eq(wfNotifications.recipient,me),eq(wfNotifications.id,str(body.id)));
    await db.update(wfNotifications).set({readAt:new Date().toISOString()}).where(which);
    return Response.json({ok:true});
  }catch(e){return oops(e)}}
