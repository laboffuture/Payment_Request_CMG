import{asc,eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{paymentNatures}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{bad,oops,str}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* The kinds of payment a request can be raised for.

   Anyone signed in reads them - the list fills the dropdown on the request form.
   Only an Administrator changes them. "admin" alone would let an Audit Head in as
   well, so the role is checked outright, the same way deleting a payment is. */

const onlyAdmin=async(req:Request)=>{
  const{actor,response}=await requireAuth(req,"admin");
  if(response)return{response};
  if(!(actor?.roles||[]).includes("Administrator"))
    return{response:bad("Only an administrator can change these.",403)};
  return{response:null}};

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const db=await getDb();
    return Response.json({natures:await db.select().from(paymentNatures)
      .orderBy(asc(paymentNatures.position),asc(paymentNatures.name))});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const body=await req.json() as Row;
    const name=str(body.name).trim();
    if(!name)return bad("A name is required");
    if(name.length>60)return bad("Keep the name under 60 characters",422);
    const db=await getDb();
    const existing=await db.select().from(paymentNatures);
    if(existing.some(r=>r.name.toLowerCase()===name.toLowerCase()))
      return bad(`"${name}" is already on the list`,409);
    const row={id:`pn-${slug(name)}`||`pn-${Date.now().toString(36)}`,name,
      position:existing.length,active:1};
    await db.insert(paymentNatures).values(row);
    return Response.json({nature:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [current]=await db.select().from(paymentNatures).where(eq(paymentNatures.id,id)).limit(1);
    if(!current)return bad("Not found",404);
    /* Merge: a request that carries only {id,active} must not blank the name. */
    const next={...current,
      ...(Object.prototype.hasOwnProperty.call(body,"name")?{name:str(body.name).trim()}:{}),
      ...(Object.prototype.hasOwnProperty.call(body,"active")?{active:body.active?1:0}:{}),
      ...(Object.prototype.hasOwnProperty.call(body,"position")?{position:Number(body.position)||0}:{})};
    if(!next.name)return bad("A name is required");
    await db.update(paymentNatures).set(next).where(eq(paymentNatures.id,id));
    return Response.json({nature:next});
  }catch(e){return oops(e)}}

/* Removing one takes it off the form from now on. Requests already raised keep the
   text they were raised with, so nothing in the history changes. */
export async function DELETE(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [current]=await db.select().from(paymentNatures).where(eq(paymentNatures.id,id)).limit(1);
    if(!current)return bad("Not found",404);
    await db.delete(paymentNatures).where(eq(paymentNatures.id,id));
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
