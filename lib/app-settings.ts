import{eq}from"drizzle-orm";
import{getDb}from"../db";
import{appSettings}from"../db/schema";
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
    return{enabled:!!v.enabled,companies:Array.isArray(v.companies)?v.companies.map(String):[]}}
  catch{return{enabled:false,companies:[]}}}

/** The statement that saves a setting - not run here, so the caller can write it in one
    batch with its audit entry (writeWithAudit). */
export function saveSetting(db:Awaited<ReturnType<typeof getDb>>,key:string,value:unknown,by:string){
  const row={key,value:JSON.stringify(value),updatedBy:by,updatedAt:new Date().toISOString()};
  return db.insert(appSettings).values(row).onConflictDoUpdate({target:appSettings.key,
    set:{value:row.value,updatedBy:row.updatedBy,updatedAt:row.updatedAt}})}
