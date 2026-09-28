import{asc,eq}from"drizzle-orm";
import{getDb}from"../db";
import{wfUsers}from"../db/schema";

/* The roles whose holders audit: who a pre-audit task is audited by, and who raises an
   observation. */
export const AUDITOR_ROLES=["Auditor","Audit Head"];

/** The people with an active login and an auditing role, by name. */
export async function auditors(){
  const db=await getDb();
  const rows=await db.select({name:wfUsers.name,email:wfUsers.email,roles:wfUsers.roles}).from(wfUsers)
    .where(eq(wfUsers.active,1)).orderBy(asc(wfUsers.name));
  return rows.filter(r=>{try{return(JSON.parse(r.roles||"[]") as string[]).some(x=>AUDITOR_ROLES.includes(x))}catch{return false}})
    .map(r=>({name:r.name||r.email,email:r.email}))}
