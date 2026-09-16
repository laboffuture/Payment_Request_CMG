import{eq,sql}from"drizzle-orm";
import{getDb}from"../db";
import{wfVendors}from"../db/schema";

/* The vendor register fills itself: a name used on a payment request that it does not
   already hold is added, matched without regard to case so the same vendor does not
   arrive twice in different capitals. Never throws - failing to remember a vendor must
   not fail the payment request that named them. */
export async function rememberVendor(name:string,byEmail?:string|null){
  try{
    const clean=(name||"").trim().replace(/\s+/g," ");
    if(clean.length<2||clean.length>160)return;
    const db=await getDb();
    const[existing]=await db.select({id:wfVendors.id}).from(wfVendors)
      .where(sql`lower(${wfVendors.name}) = ${clean.toLowerCase()}`).limit(1);
    if(existing)return;
    await db.insert(wfVendors).values({
      id:`V-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
      name:clean,active:1,createdAt:new Date().toISOString(),createdBy:byEmail||""});
  }catch(e){console.error("could not remember vendor",e)}}

export async function findVendors(q:string,limit=12){
  try{
    const db=await getDb();
    const term=(q||"").trim().toLowerCase();
    const rows=term
      ? await db.select().from(wfVendors)
          .where(sql`${wfVendors.active} = 1 and lower(${wfVendors.name}) like ${"%"+term+"%"}`)
          .orderBy(wfVendors.name).limit(limit)
      : await db.select().from(wfVendors).where(eq(wfVendors.active,1))
          .orderBy(wfVendors.name).limit(limit);
    /* A name that starts with what was typed is the likelier match, so it leads. */
    return rows.sort((a,b)=>{
      const as=a.name.toLowerCase().startsWith(term)?0:1;
      const bs=b.name.toLowerCase().startsWith(term)?0:1;
      return as-bs||a.name.localeCompare(b.name)});
  }catch{return[]}}
