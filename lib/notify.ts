import{inArray}from"drizzle-orm";
import{getDb}from"../db";
import{wfNotifications,wfUsers}from"../db/schema";

/* Telling people. Every flow calls these after its own write has succeeded, and none of
   them throws: a notification that cannot be stored must never undo, or report as
   failed, the payment approval or meeting it describes. The person acting is left out,
   since nobody needs telling what they have just done. */

export type Notice={title:string;body?:string;module:string;recordId:string};

export async function notify(recipients:string[],n:Notice,except?:string|null){
  try{
    const skip=(except||"").trim().toLowerCase();
    const to=[...new Set(recipients.map(e=>(e||"").trim().toLowerCase()))]
      .filter(e=>e&&e!==skip);
    if(!to.length)return;
    const db=await getDb();
    const at=new Date().toISOString();
    const rows=to.map((recipient,i)=>({
      id:`N-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2,7)}`,
      recipient,title:n.title.slice(0,160),body:(n.body||"").slice(0,300),
      module:n.module,recordId:n.recordId,createdAt:at,readAt:""}));
    // one statement per row keeps each well inside D1's bound-parameter limit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(rows.map(r=>db.insert(wfNotifications).values(r)) as any);
  }catch(e){console.error("notify failed",e)}}

/* Everybody signed up under any of these roles. Roles live on the login as JSON. */
export async function emailsForRoles(roles:string[]){
  try{
    const db=await getDb();
    const users=await db.select({email:wfUsers.email,roles:wfUsers.roles,active:wfUsers.active})
      .from(wfUsers);
    return users.filter(u=>{
      if(!u.active)return false;
      try{return(JSON.parse(u.roles||"[]") as string[]).some(r=>roles.includes(r))}
      catch{return false}}).map(u=>u.email);
  }catch{return[]}}

/* The logins behind employee ids - meeting attendees, the person a query is about.
   Somebody on the chart without a login simply has nowhere to be told. */
export async function emailsForEmployees(ids:string[]){
  try{
    const clean=[...new Set(ids.map(x=>(x||"").trim()).filter(Boolean))];
    if(!clean.length)return[];
    const db=await getDb();
    const rows=await db.select({email:wfUsers.email,active:wfUsers.active}).from(wfUsers)
      .where(inArray(wfUsers.employeeId,clean));
    return rows.filter(r=>r.active).map(r=>r.email);
  }catch{return[]}}

/* Who a payment request waits on once it reaches a status - the same reading of the
   flow the workbench uses to label the next action. */
export function rolesActingOn(status:string):string[]{
  // including the three that hand a request back: accounts has to answer each of them
  if(["Submitted","Requested","Accountant Review","Observation – Accounts Action",
      "Audit Query","Audit Rejected","Management Approval: No"].includes(status))
    return["Accountant"];
  if(["Pre-Audit Queue","Audit Reconfirmation"].includes(status))return["Auditor","Audit Head"];
  if(["Approved by Auditor – Ready to Release","Management Approval: Yes","Finance Queue"].includes(status))
    return["Finance"];
  if(status==="Management Approval")return["Management"];
  return[]}

/* Which screen a notification about an audit task should open. */
export const moduleForKind=(kind:string)=>
  kind==="Pre-Audit"?"preaudit":kind==="Post-Audit"?"postaudit"
  :kind==="Special Audit"?"specialaudit":"meetings";
