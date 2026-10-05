import{eq}from"drizzle-orm";
import{getDb}from"../db";
import{appSettings,wfUsers}from"../db/schema";
import{MANAGEMENT_FIRST_COMPANIES,MANAGEMENT_SETTING}from"./payment-stages";
import type{ManagementSetting}from"./payment-stages";

/* Reading and writing the administrator's settings (app_settings). */

/** Whether management approves payment requests before accounts, and for which companies.
    No row yet - the migration has not run - means the behaviour shipped with it. */
export async function managementSetting():Promise<ManagementSetting>{
  const db=await getDb();
  const[row]=await db.select().from(appSettings).where(eq(appSettings.key,MANAGEMENT_SETTING));
  if(!row)return{enabled:true,companies:MANAGEMENT_FIRST_COMPANIES};
  try{const v=JSON.parse(row.value) as Partial<ManagementSetting>;
    const approvers:Record<string,string[]>={};
    for(const[c,list]of Object.entries(v.approvers&&typeof v.approvers==="object"?v.approvers:{}))
      if(Array.isArray(list))approvers[c]=list.map(String);
    return{enabled:!!v.enabled,companies:Array.isArray(v.companies)?v.companies.map(String):[],approvers}}
  catch{return{enabled:false,companies:[]}}}

/** The statement that saves a setting - not run here, so the caller can write it in one
    batch with its audit entry (writeWithAudit). */
export function saveSetting(db:Awaited<ReturnType<typeof getDb>>,key:string,value:unknown,by:string){
  const row={key,value:JSON.stringify(value),updatedBy:by,updatedAt:new Date().toISOString()};
  return db.insert(appSettings).values(row).onConflictDoUpdate({target:appSettings.key,
    set:{value:row.value,updatedBy:row.updatedBy,updatedAt:row.updatedAt}})}

/** The people who can be named as a company's approvers: active logins with the Management role. */
export async function managementUsers(){
  const db=await getDb();
  const rows=await db.select({name:wfUsers.name,email:wfUsers.email,roles:wfUsers.roles}).from(wfUsers)
    .where(eq(wfUsers.active,1)).orderBy(wfUsers.name);
  return rows.filter(r=>{try{return(JSON.parse(r.roles||"[]") as string[]).includes("Management")}catch{return false}})
    .map(r=>({name:r.name||r.email,email:r.email}))}
