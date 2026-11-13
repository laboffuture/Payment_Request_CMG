import{eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{settingOptions}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{AREA_LIST_ID,preAuditAreas}from"../../../../lib/pre-audit";
import{PRE_AUDIT_AREAS}from"../../../../lib/pre-audit-areas";
import{actorOf,bad,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* The Area/Process choices on a pre-audit report: the fixed list, then whatever the Audit
   Head has added. Everyone signed in reads it; only the Audit Head (or an Administrator)
   adds to it, and an addition shows for everyone at once. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    return Response.json({areas:await preAuditAreas(await getDb())});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    if(!(actor?.roles||[]).some(r=>r==="Audit Head"||r==="Administrator"))
      return bad("Only the Audit Head adds to the area/process list.",403);
    const body=await req.json() as Row;
    const name=str(body.name).trim().replace(/\s+/g," ");
    if(!name)return bad("Write the area or process to add.",422);
    if(name.length>80)return bad("Keep it under 80 characters.",422);
    const db=await getDb();
    const areas=await preAuditAreas(db);
    const same=areas.find(a=>a.toLowerCase()===name.toLowerCase());
    if(same)return bad(`"${same}" is already on the list.`,409);
    const added=await db.select({id:settingOptions.id}).from(settingOptions).where(eq(settingOptions.listId,AREA_LIST_ID));
    const id=`so-pre-audit-area-${Date.now().toString(36)}`;
    await writeWithAudit([db.insert(settingOptions).values({id,listId:AREA_LIST_ID,name,
      position:PRE_AUDIT_AREAS.length+added.length,active:1})],
      actorOf(req,body),"pre-audit-area",id,"Area/process added",name);
    return Response.json({areas:[...areas,name],added:name},{status:201});
  }catch(e){return oops(e)}}
