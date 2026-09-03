import{and,eq,gt}from"drizzle-orm";
import{getDb}from"../db";
import{wfSessions,wfUsers}from"../db/schema";
import{SESSION_COOKIE,SESSION_HOURS,randomHex,readCookie}from"./credentials";
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
  return{token,maxAge:SESSION_HOURS*3600}}

export async function destroySession(token:string){
  if(!token)return;
  const db=await getDb();
  await db.delete(wfSessions).where(eq(wfSessions.token,token))}

/* Resolves the caller. Returns null when there is no valid session, when it has
   expired, or when the account behind it has since been deactivated. */
export async function currentActor(req:Request):Promise<Actor|null>{
  const token=readCookie(req,SESSION_COOKIE);
  if(!token)return null;
  const db=await getDb();
  const now=new Date().toISOString();
  const [row]=await db.select().from(wfSessions)
    .where(and(eq(wfSessions.token,token),gt(wfSessions.expiresAt,now))).limit(1);
  if(!row)return null;
  const [user]=await db.select().from(wfUsers).where(eq(wfUsers.id,row.userId)).limit(1);
  if(!user||!user.active)return null;
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
const TOKEN_ROLES=["Administrator","Audit Head","Management","Accountant","Auditor","Finance","Requestor"];
const ORG_ROLES=["Administrator","Audit Head","Management","Auditor","Finance"];

export const hasWriteRole=(roles:string[]=[])=>roles.some(r=>WRITE_ROLES.includes(r));

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
