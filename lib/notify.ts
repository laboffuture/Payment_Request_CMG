import{and,eq,inArray}from"drizzle-orm";
import{getDb,getBindings}from"../db";
import{settingOptions,wfNotifications,wfUsers}from"../db/schema";
import{sendMail,template}from"./mail";
import{after}from"next/server";

/* Telling people. Every flow calls these after its own write has succeeded, and none of
   them throws: a notification that cannot be stored must never undo, or report as
   failed, the payment approval or meeting it describes. The person acting is left out,
   since nobody needs telling what they have just done. */

export type Notice={title:string;body?:string;module:string;recordId:string;
  /* Only the email uses what follows. The bell shows a title and a line of body, and
     putting a table in it would crowd the screen; an email has room to say what the
     request is, what has happened to it and what the reader is expected to do. */
  reference?:string;                        // the request number, shown under the heading
  detail?:{label:string;value:string}[];    // the facts, as rows
  action?:string;                           // what this person is being asked to do
  tone?:"normal"|"warning"|"good";
  /* false keeps it to the bell. Some moves are worth seeing in the application but not
     worth an email - a request passing between accounts and audit, say, tells the person
     who raised it nothing they need to act on. */
  email?:boolean};

export async function notify(recipients:string[],n:Notice,except?:string|null,roles?:string[]){
  try{
    const skip=(except||"").trim().toLowerCase();
    const everyone=[...new Set(recipients.map(e=>(e||"").trim().toLowerCase()))].filter(Boolean);
    const to=everyone.filter(e=>e!==skip);
    if(!to.length)return;
    const db=await getDb();
    const at=new Date().toISOString();
    const rows=to.map((recipient,i)=>({
      id:`N-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2,7)}`,
      recipient,title:n.title.slice(0,160),body:(n.body||"").slice(0,300),
      module:n.module,recordId:n.recordId,createdAt:at,readAt:"",emailedAt:""}));
    // one statement per row keeps each well inside D1's bound-parameter limit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(rows.map(r=>db.insert(wfNotifications).values(r)) as any);
    /* The screen is told either way; the mail is a second delivery of the same thing and
       must never be the reason a notification fails. */
    /* After the response, not before it. Each message is a round trip to the mail server,
       and a decision that emails thirteen accountants kept the person who took it waiting
       seconds for a reply - long enough that they clicked again. */
    if(n.email!==false)after(()=>email(db,rows.map(r=>r.id),to,everyone,skip,n,roles,at));
  }catch(e){console.error("notify failed",e)}}

/* ---------- email ---------- */

/* Which group address carries which role. A role that is not here sends no mail at all,
   which is how this stays to auditors only: adding accounts later is a line here and a
   row in the settings list, not a release. */
const GROUP_FOR_ROLE:Record<string,string>={"Auditor":"mail.auditor","Audit Head":"mail.auditor"};

async function groupAddress(db:Awaited<ReturnType<typeof getDb>>,listId:string){
  try{
    const rows=await db.select({name:settingOptions.name}).from(settingOptions)
      .where(and(eq(settingOptions.listId,listId),eq(settingOptions.active,1)));
    return(rows[0]?.name||"").trim();
  }catch{return""}}

/* Emails a notification that has just been stored, when a group address is configured for
   the role being told.

   Only role-based notifications are emailed. Telling one named person - the requestor
   whose request came back, somebody tagged in an observation - is left to the screen for
   now; there is no group that means "whoever raised this".

   When the person who acted is themselves a member of the role, the group is not used. A
   distribution list is expanded by the mail server after we hand it over, so there is no
   way to leave one person out of it, and they would be emailed about their own action.
   The others are written to directly instead, which is what the screen already does.

   Nothing here throws, and a failure is not retried: the notification is stored and the
   bell shows it regardless. */
async function email(db:Awaited<ReturnType<typeof getDb>>,ids:string[],to:string[],
  everyone:string[],actor:string,n:Notice,roles?:string[],at?:string){
  try{
    if(!to.length)return;
    /* A group address where the role has one, the people themselves otherwise. Only audit
       has a group; accounts, finance and requestors are written to directly, which needs
       nothing configured because every login here carries an address.

       The group is skipped when the person acting belongs to it. A distribution list is
       expanded by the mail server after we hand it over, so one member cannot be left out,
       and they would be emailed about their own action. */
    let target=to;
    let why="You are receiving this because it is waiting on you in CMG Payment Request.";
    const listId=(roles||[]).map(r=>GROUP_FOR_ROLE[r]).find(Boolean);
    if(listId){
      const group=await groupAddress(db,listId);
      const actorIsMember=!!actor&&everyone.includes(actor);
      if(group&&!actorIsMember){
        target=[group];
        why="Sent to the audit team because this is waiting on audit."}}
    const env=await getBindings() as{APP_URL?:string};
    const link=String(env.APP_URL||"https://paymentrequest.toprockglobal.com").trim();
    const result=await sendMail({to:target,subject:n.title,
      html:template({title:n.title,reference:n.reference,intro:n.body,detail:n.detail,
        /* The footer does not promise that a reply will reach anybody: the address this
           is sent from is a system one and may not be monitored. Acting on the request is
           done in the application, which is what the button is for. */
        action:n.action,link,tone:n.tone,
        footer:`${why} This message is sent automatically — open the request to act on it.`}),
      replyTo:actor||undefined});
    if(result.sent&&ids.length)
      await db.update(wfNotifications).set({emailedAt:at||new Date().toISOString()})
        .where(inArray(wfNotifications.id,ids));
  }catch(e){console.error("notify email failed",e)}}

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
  if(["Submitted","Requested","Accountant Review","Observation - Audit Action",
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
