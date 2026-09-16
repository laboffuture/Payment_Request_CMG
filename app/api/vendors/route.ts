import{requireAuth}from"../../../lib/auth";
import{findVendors,rememberVendor}from"../../../lib/vendors";
import{bad,oops,str}from"../../../lib/workforce-api";
import type{Row}from"../../../lib/workforce-api";

/* Suggestions for the vendor field. Anyone signed in may look one up - they are raising
   the request that names it - and may add one, which is the same thing the payment form
   does for them when they type a name the register does not hold. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const q=url.searchParams.get("q")||"";
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||12,1),50);
    return Response.json({vendors:await findVendors(q,limit)});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const name=str(body.name).trim();
    if(name.length<2)return bad("A vendor name is required");
    await rememberVendor(name,actor?.email);
    return Response.json({vendors:await findVendors(name,5)},{status:201});
  }catch(e){return oops(e)}}
