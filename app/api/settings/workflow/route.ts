import{eq,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{paymentRequests,wfCompanies}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{managementSetting,managementUsers,saveSetting}from"../../../../lib/app-settings";
import{MANAGEMENT_APPROVAL,MANAGEMENT_SETTING}from"../../../../lib/payment-stages";
import{bad,oops,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";

/* Workflow switches, for an administrator: whether a payment request needs management
   approval before accounts, and for which companies. Read and changed by Administrators
   only - requireAuth's "admin" level admits Audit Head too, so the role is checked. */
async function admin(req:Request){
  const{actor,response}=await requireAuth(req,"admin");
  if(response)return{actor,response};
  if(!(actor?.roles||[]).includes("Administrator"))
    return{actor,response:bad("Only an administrator can change workflow settings.",403)};
  return{actor,response:null}}

/* The setting, the companies it can name, and how many requests wait at management. */
async function state(){
  const db=await getDb();
  const companies=(await db.select({name:wfCompanies.name}).from(wfCompanies).where(eq(wfCompanies.active,1))
    .orderBy(wfCompanies.position,wfCompanies.name)).map(c=>c.name);
  const[w]=await db.select({n:sql<number>`count(*)`}).from(paymentRequests).where(eq(paymentRequests.status,MANAGEMENT_APPROVAL));
  return{managementApproval:await managementSetting(),companies,waiting:Number(w?.n||0),managers:await managementUsers()}}

export async function GET(req:Request){
  try{
    const{response}=await admin(req);
    if(response)return response;
    return Response.json(await state());
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{actor,response}=await admin(req);
    if(response)return response;
    const body=await req.json() as Row;
    const enabled=body.enabled===true;
    const known=(await state()).companies;
    const companies=[...new Set((Array.isArray(body.companies)?body.companies:[]).map(String))];
    const unknown=companies.filter(c=>!known.includes(c));
    if(unknown.length)return bad(`Not a company on the register: ${unknown.join(", ")}.`,422);
    if(enabled&&!companies.length)return bad("Choose at least one company, or switch management approval off.",422);
    /* Each chosen company's approvers: logins with the Management role, by email. */
    const managers=(await managementUsers()).map(m=>m.email.toLowerCase());
    const approvers:Record<string,string[]>={};
    const raw=body.approvers&&typeof body.approvers==="object"?body.approvers as Record<string,unknown>:{};
    for(const c of companies){
      const list=[...new Set((Array.isArray(raw[c])?raw[c] as unknown[]:[]).map(e=>String(e).trim().toLowerCase()).filter(Boolean))];
      const bad_=list.filter(e=>!managers.includes(e));
      if(bad_.length)return bad(`${c}: ${bad_.join(", ")} ${bad_.length===1?"is not":"are not"} an active user with the Management role.`,422);
      if(list.length)approvers[c]=list;
    }
    const before=await managementSetting();
    const value={enabled,companies,approvers};
    const who=(s:{companies:string[];approvers?:Record<string,string[]>})=>s.companies
      .map(c=>`${c}: ${(s.approvers?.[c]||[]).join("/")||"any manager"}`).join("; ")||"none";
    await writeWithAudit([saveSetting(await getDb(),MANAGEMENT_SETTING,value,actor?.email||"")],actor?.name||actor?.email||"",
      "setting",MANAGEMENT_SETTING,"Management approval setting changed",
      `${before.enabled?"on":"off"} (${who(before)}) -> ${enabled?"on":"off"} (${who(value)})`);
    return Response.json(await state());
  }catch(e){return oops(e)}}
