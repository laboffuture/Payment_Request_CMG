import{and,eq,gt}from"drizzle-orm";
import{getDb}from"../db";
import{wfCompanies,wfEmployees,wfSessions,wfUsers}from"../db/schema";
import{COOKIE_DAYS,SESSION_COOKIE,SESSION_HOURS,randomHex,readBearer,readCookie}from"./credentials";
export*from"./credentials";

/* ---------- sessions ---------- */
export type Actor={userId:string;email:string;name:string;roles:string[];employeeId:string};

export async function createSession(user:{id:string;email:string;roles:string}){
  const db=await getDb();
  const token=randomHex(32);
  const now=new Date();
  const expires=new Date(now.getTime()+SESSION_HOURS*3600000);
  await db.insert(wfSessions).values({token,userId:user.id,email:user.email,roles:user.roles,
    createdAt:now.toISOString(),expiresAt:expires.toISOString(),lastSeenAt:now.toISOString()});
  return{token,maxAge:COOKIE_DAYS*24*3600}}

export async function destroySession(token:string){
  if(!token)return;
  const db=await getDb();
  await db.delete(wfSessions).where(eq(wfSessions.token,token))}

/* Resolves the caller. Returns null when there is no valid session, when it has
   expired, or when the account behind it has since been deactivated. */
const RENEW_AFTER=15*60*1000;   // rewrite the session at most every 15 minutes

export async function currentActor(req:Request):Promise<Actor|null>{
  /* The cookie first, so nothing about the browser changes: it stays HttpOnly and
     SameSite=Lax, and a request that carries one is resolved exactly as before. The header
     is what a native app sends, and both name the same row. */
  const token=readCookie(req,SESSION_COOKIE)||readBearer(req);
  if(!token)return null;
  const db=await getDb();
  const now=new Date().toISOString();
  const [row]=await db.select().from(wfSessions)
    .where(and(eq(wfSessions.token,token),gt(wfSessions.expiresAt,now))).limit(1);
  if(!row)return null;
  const [user]=await db.select().from(wfUsers).where(eq(wfUsers.id,row.userId)).limit(1);
  if(!user||!user.active)return null;

  /* The window runs from the last request, not from signing in. Without this a session
     died twelve hours after sign-in however hard the person was working, which is what
     put "Sign in to continue" in front of people mid-task.

     The row is only rewritten once the seen time is more than RENEW_AFTER old. D1 runs
     one query at a time, so writing on every request would put a write in front of
     every read the application makes. */
  const seen=Date.parse(row.lastSeenAt||row.createdAt||now);
  if(Date.now()-seen>RENEW_AFTER){
    const fresh=new Date();
    await db.update(wfSessions)
      .set({lastSeenAt:fresh.toISOString(),
            expiresAt:new Date(fresh.getTime()+SESSION_HOURS*3600000).toISOString()})
      .where(eq(wfSessions.token,token));
  }
  return{userId:user.id,email:user.email,name:user.name,employeeId:user.employeeId,
    roles:JSON.parse(user.roles||"[]") as string[]}}

/* ---------- route guards ---------- */
const WRITE_ROLES=["Administrator","Audit Head","Management","Accountant","Auditor","Finance"];
const ADMIN_ROLES=["Administrator","Audit Head"];
/* Changing the organisation chart - departments, roles, employees and their photos - is
   a narrower right than ordinary write access. The Accountant works payments and audit
   queues but only reads the register, and that is enforced here rather than by hiding
   buttons, so the rule holds however the request arrives. */
/* Tokens are how work is requested of the data-entry team, so a Requestor raises and
   updates them even though they may change nothing else. */
const TOKEN_ROLES=["Administrator","Audit Head","Management","Accountant","Auditor","Finance","Requestor","Department Head"];
const ORG_ROLES=["Administrator","Audit Head","Management","Finance"];

export const hasWriteRole=(roles:string[]=[])=>roles.some(r=>WRITE_ROLES.includes(r));

/* The observation register belongs to the people who raise and answer findings:
   administration, accounts and audit. Checked on the server as well as the menu, so
   hiding the entry is not the only thing keeping anybody out. */
const OBSERVATION_ROLES=["Administrator","Audit Head","Auditor","Accountant"];
export const canSeeObservations=(roles:string[]=[])=>roles.some(r=>OBSERVATION_ROLES.includes(r));

/* Work is private to the person it was assigned to. These are the roles that hand
   the work out and answer for it, so they keep sight of all of it; everybody else
   sees their own. Kept here so the routes cannot drift apart on who is who. */
const SUPERVISOR_ROLES=["Administrator","Audit Head","Management"];
export const seesAllWork=(roles:string[]=[])=>roles.some(r=>SUPERVISOR_ROLES.includes(r));

/* ---------- department heads ---------- */
/* A Department Head reads what his own department raised, raises his own work like a
   requestor, and does nothing else: he is deliberately absent from WRITE_ROLES, so he
   cannot accept, verify, reject or release anything.

   Only when the role stands alone. Somebody who is also an Accountant or a supervisor
   keeps the wider view their other role gives them - narrowing on the mere presence of
   this role would take away access they already had. */
const DEPARTMENT_ROLES=["Department Head"];
export const seesDepartmentOnly=(roles:string[]=[])=>
  roles.some(r=>DEPARTMENT_ROLES.includes(r))
  &&!roles.some(r=>WRITE_ROLES.includes(r))
  &&!roles.some(r=>SUPERVISOR_ROLES.includes(r));

/* The addresses a department head may read requests from: the requestors an administrator
   has assigned to him, and always himself.

   Assigned rather than derived. Deriving it from the organisation chart looked tidier,
   but the department recorded on a request and the department of the person who raised it
   disagree across the live register, and the vocabularies differ too - "Project" on the
   form against "Projects" on the staff record - so a head would have been shown other
   departments' work while his own people's stayed hidden.

   An empty list means his own requests alone. It is not a fallback to his department or to
   the register: a head who has been given the role but nobody to watch sees only himself
   until somebody is assigned. Seeing too little is a complaint; the other way is a leak.

   null means no scoping applies at all, which is not the same as an empty list. */
export async function departmentPeers(actor:Actor|null):Promise<string[]|null>{
  if(!actor||!seesDepartmentOnly(actor.roles))return null;
  const me=(actor.email||"").toLowerCase();
  const db=await getDb();
  const[row]=await db.select({visibleRaisers:wfUsers.visibleRaisers})
    .from(wfUsers).where(eq(wfUsers.id,actor.userId)).limit(1);
  let assigned:string[]=[];
  /* Whatever is stored, a broken value must narrow rather than widen. */
  try{const parsed=JSON.parse(row?.visibleRaisers||"[]");
    if(Array.isArray(parsed))assigned=parsed.map(x=>String(x||"").toLowerCase()).filter(Boolean)}
  catch{assigned=[]}
  return Array.from(new Set([...assigned,me]))}

/* The one company a user works for in the portal, when an administrator has set it on
   their employee record. Everyone else - and every administrator, whatever is set - gets
   null: no restriction. Asked afresh on each request rather than held in the session, so
   changing it takes effect at once rather than at the next sign-in.

   A company that has since been deleted narrows to nothing rather than widening to all:
   the lock names a company that cannot be matched, so nothing is shown. */
export type CompanyLock={id:string;name:string};
export async function companyLock(actor:Actor|null):Promise<CompanyLock|null>{
  if(!actor||actor.roles.includes("Administrator")||!actor.employeeId)return null;
  const db=await getDb();
  const[e]=await db.select({companyId:wfEmployees.portalCompanyId}).from(wfEmployees)
    .where(eq(wfEmployees.id,actor.employeeId)).limit(1);
  if(!e?.companyId)return null;
  const[c]=await db.select({id:wfCompanies.id,name:wfCompanies.name}).from(wfCompanies)
    .where(eq(wfCompanies.id,e.companyId)).limit(1);
  return c||{id:e.companyId,name:"\u0000no such company"}}

/* Whether a company, by name or id, is inside a lock. No lock means yes. Names are
   compared without regard to case or spacing, since payment requests store the name. */
const squashName=(v:string)=>String(v||"").toLowerCase().replace(/\s+/g," ").trim();
export const inCompany=(lock:CompanyLock|null,company:{id?:string;name?:string})=>
  !lock||(!!company.id&&company.id===lock.id)||(!!company.name&&squashName(company.name)===squashName(lock.name));

const deny=(message:string,status:number)=>
  Response.json({error:message},{status});

/* Put this at the top of every handler. `read` needs any signed-in account, `write`
   needs a role that is allowed to change data, `admin` needs an administrator. */
export async function requireAuth(req:Request,level:"read"|"write"|"org"|"token"|"admin"="read"){
  const actor=await currentActor(req);
  if(!actor)return{actor:null,response:deny("Sign in to continue.",401)};
  if(level==="token"&&!actor.roles.some(r=>TOKEN_ROLES.includes(r)))
    return{actor,response:deny("Your role cannot change tokens.",403)};
  if(level==="org"&&!actor.roles.some(r=>ORG_ROLES.includes(r)))
    return{actor,response:deny("Your role can view the organisation chart but not change it.",403)};
  if(level==="write"&&!actor.roles.some(r=>WRITE_ROLES.includes(r)))
    return{actor,response:deny("Your role cannot change this data.",403)};
  if(level==="admin"&&!actor.roles.some(r=>ADMIN_ROLES.includes(r)))
    return{actor,response:deny("Only an administrator can do this.",403)};
  return{actor,response:null}}
