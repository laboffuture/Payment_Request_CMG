import{getDb}from"../db";
import{asc,eq}from"drizzle-orm";
import{settingOptions,wfObservations}from"../db/schema";
import{PRE_AUDIT_AREAS}from"./pre-audit-areas";

/* Today's date in India, where the audit team works. The server runs on UTC, which until
   05:30 is still yesterday - a task filed at 2 am must not be dated the day before. */
export const indiaToday=()=>new Date(Date.now()+330*60_000).toISOString().slice(0,10);

/* Observations are numbered OBS-AUD-001, -002, ... as their ref, the number people
   read; the id behind it stays a key nothing shows. Each observation takes the next number. */
const OBS_PREFIX="OBS-AUD-";
const obsNumber=(n:number)=>`${OBS_PREFIX}${String(n).padStart(3,"0")}`;
const highestObsNumber=(refs:string[])=>refs.reduce((top,ref)=>{
  if(!ref.startsWith(OBS_PREFIX))return top;
  const n=Number(ref.slice(OBS_PREFIX.length));
  return Number.isFinite(n)&&n>top?n:top},0);
export async function nextObservationRef(db:Awaited<ReturnType<typeof getDb>>){
  const rows=await db.select({ref:wfObservations.ref}).from(wfObservations);
  return obsNumber(highestObsNumber(rows.map(r=>String(r.ref||"")))+1)}

/* Remarks are kept as a JSON list of {by, at, text}, added to and never edited. */
export type Remark={by:string;at:string;text:string};
export const remarksOf=(v:unknown):Remark[]=>{try{const r=JSON.parse(String(v||"")||"[]");return Array.isArray(r)?r:[]}catch{return[]}};

/* The Area/Process list: the fixed areas, then the ones the Audit Head has added (kept in
   setting_options under their own list). */
export const AREA_LIST_ID="pre-audit.area";
export async function preAuditAreas(db:Awaited<ReturnType<typeof getDb>>){
  const added=await db.select({name:settingOptions.name}).from(settingOptions)
    .where(eq(settingOptions.listId,AREA_LIST_ID)).orderBy(asc(settingOptions.position),asc(settingOptions.name));
  const fixed:string[]=[...PRE_AUDIT_AREAS];
  return[...fixed,...added.map(a=>a.name).filter(n=>!fixed.includes(n))]}
