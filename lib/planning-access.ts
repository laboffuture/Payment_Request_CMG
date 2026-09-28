import{eq}from"drizzle-orm";
import{getDb}from"../db";
import{wfPlanning}from"../db/schema";
import{companyLock,inCompany}from"./auth";
import type{Actor}from"./auth";
import{RECEIVABLE_ROLES,mayEditSchedule}from"./planning-stages";

/* A plan's schedule and BOM are read by anyone who can see the plan - accounts, audit,
   or its project manager - and changed by its project manager and accounts. */

const lower=(v:unknown)=>String(v??"").trim().toLowerCase();

/** The plan, if this reader may see it, and whether they may change its lines. */
export async function planFor(actor:Actor|null|undefined,planId:string){
  const db=await getDb();
  const[plan]=await db.select().from(wfPlanning).where(eq(wfPlanning.id,planId));
  if(!plan||!inCompany(await companyLock(actor??null),{id:plan.companyId}))return null;
  const isManager=!!plan.pmEmail&&lower(plan.pmEmail)===lower(actor?.email);
  const roles=actor?.roles||[];
  if(!isManager&&!roles.some(r=>RECEIVABLE_ROLES.includes(r)))return null;
  return{plan,edit:mayEditSchedule(plan.stage,roles,isManager)};
}
