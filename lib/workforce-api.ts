import{getDb}from"../db";
import{wfLogs}from"../db/schema";

export type Row=Record<string,unknown>;

export const str=(v:unknown,fallback="")=>typeof v==="string"?v:typeof v==="number"?String(v):fallback;
export const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0};
export const nullable=(v:unknown)=>typeof v==="string"&&v?v:null;
export const bad=(message:string,status=400)=>Response.json({error:message},{status});
export const oops=(e:unknown)=>Response.json({error:e instanceof Error?e.message:"Request failed"},{status:500});

/* Page sizes are capped server-side. A client asking for 10,000 rows gets 200; a
   single unbounded list query is what turns one careless screen into a D1 outage. */
export const MAX_PAGE=200;
export const page=(url:URL)=>{
  const limit=Math.min(Math.max(num(url.searchParams.get("limit"))||50,1),MAX_PAGE);
  const offset=Math.max(num(url.searchParams.get("offset")),0);
  return{limit,offset}};

/* LIKE patterns are capped at 50 bytes by D1 and the wildcards are escaped so a
   user typing % does not turn a search into a full table scan. */
export const search=(v:string|null)=>{
  const q=(v||"").trim().slice(0,40).replace(/[%_\\]/g,c=>"\\"+c);
  return q?`%${q}%`:null};

export const audit=(actor:string,entity:string,entityId:string,action:string,detail:string)=>({
  id:`L-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
  at:new Date().toISOString(),actor:actor||"system",entity,entityId,action,detail});

/* Writes the row and its audit entry as one D1 batch. D1 has no interactive
   transactions, so batch() is the only way to keep the two consistent. */
export async function writeWithAudit(
  statements:unknown[],actor:string,entity:string,entityId:string,action:string,detail:string){
  const db=await getDb();
  const log=db.insert(wfLogs).values(audit(actor,entity,entityId,action,detail));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.batch([...(statements as any),log as any] as any);
}

export const actorOf=(req:Request,body?:Row)=>
  str(body?.actor)||req.headers.get("oai-authenticated-user-email")||"system";
