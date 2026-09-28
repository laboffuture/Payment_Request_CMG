import{and,asc,eq,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfPlanBom,wfUsers}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{planFor}from"../../../../lib/planning-access";
import{bomFigures}from"../../../../lib/planning-stages";
import{actorOf,bad,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* The detailed BOM of a plan: its material lines. Read and changed by the same people as
   the project schedule - see lib/planning-access.ts. */

const now=()=>new Date().toISOString();
const date=/^\d{4}-\d{2}-\d{2}$/;

/* A number from the request: undefined when not entered, NaN when not a number. */
const figure=(v:unknown)=>{const s=str(v).trim();return s===""?undefined:Number(s)};

/* The fields of a line from the request, checked, with its worked-out figures; or the
   reason they cannot be saved. */
async function fieldsOf(body:Row){
  const text={boqItem:str(body.boqItem).trim(),category:str(body.category).trim(),description:str(body.description).trim(),
    specification:str(body.specification).trim(),unit:str(body.unit).trim(),requiredDate:str(body.requiredDate),
    remarks:str(body.remarks).trim()};
  const missing:string[]=([["boqItem","BOQ item"],["category","Material category"],["description","Material description"],
    ["unit","Unit"]] as const).filter(([k])=>!text[k]).map(([,l])=>l);
  const needed={boqQty:"BOQ quantity",boqRate:"BOQ rate",requiredQty:"Required quantity"} as const;
  const optional={purchasedQty:"Purchased quantity",estimatedCost:"Estimated cost",actualCost:"Actual cost"} as const;
  const n:Record<string,number|null>={};
  for(const[k,l]of Object.entries(needed)){
    const v=figure(body[k]);
    if(v===undefined){missing.push(l);continue}
    if(!Number.isFinite(v)||v<0)return`${l} must be a number, 0 or more.`;
    n[k]=v;
  }
  if(!date.test(text.requiredDate))missing.push("Required date");
  if(!str(body.approvedByEmail).trim())missing.push("Approved by");
  if(missing.length)return`${missing.join(", ")} must be filled in.`;
  for(const[k,l]of Object.entries(optional)){
    const v=figure(body[k]);
    if(v!==undefined&&(!Number.isFinite(v)||v<0))return`${l} must be a number, 0 or more.`;
    n[k]=v===undefined?null:v;
  }
  const email=str(body.approvedByEmail).trim().toLowerCase();
  const db=await getDb();
  const[u]=await db.select({name:wfUsers.name,email:wfUsers.email,active:wfUsers.active}).from(wfUsers)
    .where(sql`lower(${wfUsers.email}) = ${email}`);
  if(!u||!u.active)return"Approved by: choose someone from the list of people with a login.";
  const figures={boqQty:n.boqQty!,boqRate:n.boqRate!,requiredQty:n.requiredQty!,
    purchasedQty:n.purchasedQty,estimatedCost:n.estimatedCost,actualCost:n.actualCost};
  return{...text,...figures,...bomFigures(figures),approvedByName:u.name||u.email,approvedByEmail:u.email};
}

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const found=await planFor(actor,str(new URL(req.url).searchParams.get("planId")));
    if(!found)return bad("That plan no longer exists",404);
    const db=await getDb();
    const lines=await db.select().from(wfPlanBom).where(eq(wfPlanBom.planId,found.plan.id))
      .orderBy(asc(wfPlanBom.createdAt));
    return Response.json({lines,canEdit:found.edit});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const found=await planFor(actor,str(body.planId));
    if(!found)return bad("That plan no longer exists",404);
    if(!found.edit)return bad(`The BOM of a plan at ${found.plan.stage} cannot be changed by you.`,403);
    const f=await fieldsOf(body);
    if(typeof f==="string")return bad(f,422);
    const{plan}=found;
    const row={...f,id:`PB-${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`,planId:plan.id,
      jobCode:plan.jobCode||plan.jobRef,projectName:plan.projectName||plan.description,
      createdBy:actor?.email||"",createdAt:now(),updatedAt:now()};
    const db=await getDb();
    await writeWithAudit([db.insert(wfPlanBom).values(row)],actorOf(req,body),"planning",plan.id,
      "BOM line added",`${plan.ref} · ${row.boqItem} · ${row.description}`);
    return Response.json({line:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const db=await getDb();
    const[line]=await db.select().from(wfPlanBom).where(eq(wfPlanBom.id,str(body.id)));
    const found=line&&await planFor(actor,line.planId);
    if(!line||!found)return bad("That BOM line no longer exists",404);
    if(!found.edit)return bad(`The BOM of a plan at ${found.plan.stage} cannot be changed by you.`,403);
    const f=await fieldsOf(body);
    if(typeof f==="string")return bad(f,422);
    const patch={...f,updatedAt:now()};
    await writeWithAudit([db.update(wfPlanBom).set(patch).where(eq(wfPlanBom.id,line.id))],
      actorOf(req,body),"planning",line.planId,"BOM line updated",
      `${found.plan.ref} · ${f.boqItem} · purchased ${f.purchasedQty??"—"} of ${f.requiredQty} ${f.unit}`);
    return Response.json({line:{...line,...patch}});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const id=str(new URL(req.url).searchParams.get("id"));
    const db=await getDb();
    const[line]=await db.select().from(wfPlanBom).where(eq(wfPlanBom.id,id));
    const found=line&&await planFor(actor,line.planId);
    if(!line||!found)return bad("That BOM line no longer exists",404);
    if(!found.edit)return bad(`The BOM of a plan at ${found.plan.stage} cannot be changed by you.`,403);
    await writeWithAudit([db.delete(wfPlanBom).where(and(eq(wfPlanBom.id,id),eq(wfPlanBom.planId,line.planId)))],
      actorOf(req),"planning",line.planId,"BOM line removed",`${found.plan.ref} · ${line.boqItem} · ${line.description}`);
    return Response.json({ok:true});
  }catch(e){return oops(e)}}
