import{and,desc,eq,isNull,or,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfMessages}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{actorOf,bad,oops,page,str}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* One shared thread plus direct messages. A row with to_employee set is returned
   only to its author and its recipient — the filter is applied in SQL, so a private
   message is never sent to the browser of somebody who should not see it. */
export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const me=actor?.employeeId||"";
    const mine=actor?.userId||"";
    const db=await getDb();
    const visible=or(
      eq(wfMessages.toEmployee,""),
      me?eq(wfMessages.toEmployee,me):sql`0`,
      eq(wfMessages.authorId,mine));
    const rows=await db.select().from(wfMessages).where(visible)
      .orderBy(desc(wfMessages.at)).limit(limit).offset(offset);
    return Response.json({messages:rows.reverse(),limit,offset});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const text=str(body.body).trim().slice(0,4000);
    if(!text)return bad("A message cannot be empty");
    const row={id:`M-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
      authorId:actor?.userId||"",authorName:actor?.name||"",authorEmail:actor?.email||"",
      authorRole:(actor?.roles||[])[0]||"",toEmployee:str(body.toEmployee),
      body:text,at:new Date().toISOString()};
    await (await getDb()).insert(wfMessages).values(row);
    return Response.json({message:row},{status:201});
  }catch(e){return oops(e)}}

/* Only the author can remove their own message. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [m]=await db.select().from(wfMessages).where(eq(wfMessages.id,id)).limit(1);
    if(!m)return bad("Not found",404);
    if(m.authorId!==actor?.userId)return bad("You can only delete your own messages",403);
    await db.delete(wfMessages).where(eq(wfMessages.id,id));
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
