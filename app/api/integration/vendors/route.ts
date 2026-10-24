import{eq}from"drizzle-orm";
import{getBindings,getDb}from"../../../../db";
import{wfVendorMaster}from"../../../../db/schema";
import{oops}from"../../../../lib/workforce-api";
import{readBearer,safeEqual}from"../../../../lib/auth";

/* The active vendors of the Vendor Master, read by Material Management as its supplier
   list, so a vendor approved here is the one procurement raises a PO to.

   Same guard as the job register beside it: the shared service token, never a browser
   session, and closed when no token is configured. Material keys suppliers by name, so a
   vendor registered for two companies is sent once. */
export async function GET(req:Request){
  try{
    const env=await getBindings() as {INTEGRATION_TOKEN?:string};
    const expected=String(env.INTEGRATION_TOKEN||"").trim().toLowerCase();
    const presented=readBearer(req).toLowerCase();
    if(!expected||!presented||!safeEqual(presented,expected))
      return Response.json({error:"Not authorised"},{status:401});
    const db=await getDb();
    const rows=await db.select().from(wfVendorMaster).where(eq(wfVendorMaster.status,"Active"))
      .orderBy(wfVendorMaster.vendorCode);
    const seen=new Set<string>();
    const out=[];
    for(const v of rows){
      const key=v.legalName.trim().toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      out.push({id:v.id,code:v.vendorCode,name:v.legalName,email:v.email,phone:v.mobile,taxNo:v.gstin||v.pan,
        address:[v.address,v.city,v.state,v.country].filter(Boolean).join(", "),contactPerson:v.contactPerson,
        category:v.vendorCategory,city:v.city,country:v.country});
    }
    return Response.json(out);
  }catch(e){return oops(e)}}
