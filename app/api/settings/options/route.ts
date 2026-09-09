import{asc,eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{settingOptions}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{OPTION_LISTS,isKnownList}from"../../../../lib/settings";
import{bad,oops,str}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* Anyone signed in reads these - they fill the dropdowns on the forms. Only an
   Administrator changes them. requireAuth's "admin" level would let an Audit Head in
   as well, so the role is checked outright. */
const onlyAdmin=async(req:Request)=>{
  const{actor,response}=await requireAuth(req,"admin");
  if(response)return{response};
  if(!(actor?.roles||[]).includes("Administrator"))
    return{response:bad("Only an administrator can change settings.",403)};
  return{response:null}};

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const db=await getDb();
    const rows=await db.select().from(settingOptions)
      .orderBy(asc(settingOptions.listId),asc(settingOptions.position),asc(settingOptions.name));
    return Response.json({lists:OPTION_LISTS,options:rows});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const body=await req.json() as Row;
    const listId=str(body.listId);
    const name=str(body.name).trim();
    if(!isKnownList(listId))return bad("That is not a list this application reads",422);
    if(!name)return bad("A name is required");
    if(name.length>60)return bad("Keep it under 60 characters",422);
    const db=await getDb();
    const siblings=await db.select().from(settingOptions).where(eq(settingOptions.listId,listId));
    if(siblings.some(r=>r.name.toLowerCase()===name.toLowerCase()))
      return bad(`"${name}" is already on that list`,409);
    const row={id:`so-${slug(listId)}-${slug(name)||Date.now().toString(36)}`,
      listId,name,position:siblings.length,active:1};
    await db.insert(settingOptions).values(row);
    return Response.json({option:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [current]=await db.select().from(settingOptions).where(eq(settingOptions.id,id)).limit(1);
    if(!current)return bad("Not found",404);
    const has=(k:string)=>Object.prototype.hasOwnProperty.call(body,k);
    /* Merge, so a request carrying only {id,active} cannot blank the name. */
    const next={...current,
      ...(has("name")?{name:str(body.name).trim()}:{}),
      ...(has("active")?{active:body.active?1:0}:{}),
      ...(has("position")?{position:Number(body.position)||0}:{})};
    if(!next.name)return bad("A name is required");
    await db.update(settingOptions).set(next).where(eq(settingOptions.id,id));
    return Response.json({option:next});
  }catch(e){return oops(e)}}

/* Removing an option takes it off the forms from now on. Records already saved keep
   the wording they were saved with. */
export async function DELETE(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [current]=await db.select().from(settingOptions).where(eq(settingOptions.id,id)).limit(1);
    if(!current)return bad("Not found",404);
    const left=await db.select().from(settingOptions).where(eq(settingOptions.listId,current.listId));
    if(left.filter(r=>r.active).length<=1&&current.active)
      return bad("That is the last option on the list. Add another before removing this one.",409);
    await db.delete(settingOptions).where(eq(settingOptions.id,id));
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
