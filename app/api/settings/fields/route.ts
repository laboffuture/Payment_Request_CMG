import{asc,eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{settingFields}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{FIELD_FORMS,FIELD_TYPES,isKnownForm}from"../../../../lib/settings";
import{bad,oops,str}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* Extra fields an administrator adds to a form. Read by anyone signed in, because the
   form has to render them; changed by an Administrator alone. */
const onlyAdmin=async(req:Request)=>{
  const{actor,response}=await requireAuth(req,"admin");
  if(response)return{response};
  if(!(actor?.roles||[]).includes("Administrator"))
    return{response:bad("Only an administrator can change settings.",403)};
  return{response:null}};

const clean=(body:Row)=>{
  const type=str(body.type,"text");
  if(!(FIELD_TYPES as readonly string[]).includes(type))return{error:"Unknown field type"};
  const label=str(body.label).trim();
  if(!label)return{error:"A label is required"};
  if(label.length>60)return{error:"Keep the label under 60 characters"};
  /* Choices only mean anything for a dropdown; stored comma separated. */
  const options=type==="dropdown"
    ?String(body.options||"").split(",").map(x=>x.trim()).filter(Boolean).join(",")
    :"";
  if(type==="dropdown"&&!options)return{error:"A dropdown needs at least one choice"};
  return{label,type,options,required:body.required?1:0}};

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const db=await getDb();
    const rows=await db.select().from(settingFields)
      .orderBy(asc(settingFields.form),asc(settingFields.position));
    return Response.json({forms:FIELD_FORMS,types:FIELD_TYPES,fields:rows});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const body=await req.json() as Row;
    const form=str(body.form);
    if(!isKnownForm(form))return bad("That is not a form this application renders",422);
    const shaped=clean(body);
    if("error" in shaped)return bad(shaped.error as string,422);
    const db=await getDb();
    const siblings=await db.select().from(settingFields).where(eq(settingFields.form,form));
    if(siblings.some(r=>r.label.toLowerCase()===shaped.label!.toLowerCase()))
      return bad(`"${shaped.label}" is already a field on that form`,409);
    if(siblings.length>=12)
      return bad("That form already has 12 extra fields. Remove one before adding another.",409);
    const row={id:`sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
      form,label:shaped.label!,type:shaped.type!,options:shaped.options!,
      required:shaped.required!,position:siblings.length,active:1};
    await db.insert(settingFields).values(row);
    return Response.json({field:row},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [current]=await db.select().from(settingFields).where(eq(settingFields.id,id)).limit(1);
    if(!current)return bad("Not found",404);
    const has=(k:string)=>Object.prototype.hasOwnProperty.call(body,k);
    /* Only "active" on its own is the common case - hiding a field without losing it
       or its wording. Merge so nothing else is blanked. */
    if(has("label")||has("type")||has("options")||has("required")){
      const shaped=clean({...current,...body} as Row);
      if("error" in shaped)return bad(shaped.error as string,422);
      const next={...current,...shaped,
        ...(has("active")?{active:body.active?1:0}:{})} as typeof current;
      await db.update(settingFields).set(next).where(eq(settingFields.id,id));
      return Response.json({field:next});
    }
    const next={...current,
      ...(has("active")?{active:body.active?1:0}:{}),
      ...(has("position")?{position:Number(body.position)||0}:{})};
    await db.update(settingFields).set(next).where(eq(settingFields.id,id));
    return Response.json({field:next});
  }catch(e){return oops(e)}}

/* Removing a field takes it off the form. Values already captured stay on the records
   that carry them, so nothing raised earlier is rewritten. */
export async function DELETE(req:Request){
  try{
    const{response}=await onlyAdmin(req);
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [current]=await db.select().from(settingFields).where(eq(settingFields.id,id)).limit(1);
    if(!current)return bad("Not found",404);
    await db.delete(settingFields).where(eq(settingFields.id,id));
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
