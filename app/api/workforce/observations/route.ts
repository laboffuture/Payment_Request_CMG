import{and,count,desc,eq,inArray,like,or}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfEmployees,wfObsReplies,wfObsTags,wfObservations}from"../../../../db/schema";
import{actorOf,bad,num,oops,page,search,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

const now=()=>new Date().toISOString();
const shape=(o:Row)=>({id:str(o.id),ref:str(o.ref),title:str(o.title),detail:str(o.detail),
  deptId:str(o.deptId,"d-group"),taskId:str(o.taskId),risk:str(o.risk,"Medium"),
  status:str(o.status,"Open"),raisedBy:str(o.raisedBy),raisedAt:str(o.raisedAt)||now(),
  target:str(o.target),resolvedAt:str(o.resolvedAt),resolution:str(o.resolution),
  replyCount:num(o.replyCount),lastReplyAt:str(o.lastReplyAt)});

/* Tag rows are read for the page of observations being returned, never for the whole
   table, so the cost of listing does not grow with history. */
async function decorate(rows:{id:string}[]){
  if(!rows.length)return{tags:new Map<string,{id:string;name:string}[]>()};
  const db=await getDb();
  const ids=rows.map(r=>r.id);
  const tags=await db.select({observationId:wfObsTags.observationId,employeeId:wfObsTags.employeeId,
    name:wfEmployees.name}).from(wfObsTags)
    .leftJoin(wfEmployees,eq(wfEmployees.id,wfObsTags.employeeId))
    .where(inArray(wfObsTags.observationId,ids));
  const map=new Map<string,{id:string;name:string}[]>();
  for(const t of tags){
    const list=map.get(t.observationId)||[];
    list.push({id:t.employeeId,name:t.name||t.employeeId});
    map.set(t.observationId,list)}
  return{tags:map}}

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const db=await getDb();
    const id=url.searchParams.get("id");
    if(id){
      const [row]=await db.select().from(wfObservations).where(eq(wfObservations.id,id)).limit(1);
      if(!row)return bad("Not found",404);
      const{tags}=await decorate([row]);
      const replies=await db.select().from(wfObsReplies)
        .where(eq(wfObsReplies.observationId,id)).orderBy(wfObsReplies.at);
      return Response.json({observation:{...row,tags:tags.get(id)||[]},replies});
    }
    const{limit,offset}=page(url);
    const taggedTo=url.searchParams.get("taggedTo");
    const status=url.searchParams.get("status");
    const deptId=url.searchParams.get("deptId");
    const q=search(url.searchParams.get("q"));

    // "tagged to me" resolves through the indexed join table first
    let idFilter:string[]|null=null;
    if(taggedTo){
      const mine=await db.select({id:wfObsTags.observationId}).from(wfObsTags)
        .where(eq(wfObsTags.employeeId,taggedTo)).limit(500);
      idFilter=mine.map(m=>m.id);
      if(!idFilter.length)return Response.json({observations:[],total:0,limit,offset});
    }
    const filters=[
      idFilter?inArray(wfObservations.id,idFilter):undefined,
      status?eq(wfObservations.status,status):undefined,
      deptId?eq(wfObservations.deptId,deptId):undefined,
      q?or(like(wfObservations.title,q),like(wfObservations.ref,q)):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const [rows,[total]]=await Promise.all([
      db.select().from(wfObservations).where(where)
        .orderBy(desc(wfObservations.raisedAt)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfObservations).where(where)]);
    const{tags}=await decorate(rows);
    return Response.json({observations:rows.map(r=>({...r,tags:tags.get(r.id)||[]})),
      total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    if(!str(body.title))return bad("title is required");
    const tagged=Array.isArray(body.tags)?(body.tags as string[]).slice(0,50):[];
    if(!tagged.length)return bad("Tag at least one employee so somebody can respond",422);
    const id=str(body.id)||`OB-${Date.now().toString(36)}`;
    const row=shape({...body,id,
      ref:str(body.ref)||`OBS-${Date.now().toString(36).toUpperCase()}`,raisedAt:now()});
    const db=await getDb();
    await writeWithAudit([
      db.insert(wfObservations).values(row),
      db.insert(wfObsTags).values(tagged.map(e=>({id:`OT-${Math.random().toString(36).slice(2,10)}`,
        observationId:id,employeeId:e})))],
      actorOf(req,body),"observation",id,"Observation raised",
      `${row.ref} · tagged ${tagged.length} employee${tagged.length===1?"":"s"}`);
    return Response.json({observation:{...row,tags:tagged.map(t=>({id:t,name:t}))}},{status:201});
  }catch(e){return oops(e)}}

export async function PATCH(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [existing]=await db.select().from(wfObservations).where(eq(wfObservations.id,id)).limit(1);
    if(!existing)return bad("Not found",404);
    const action=str(body.action);
    let row=shape({...existing,...body,id});
    if(action==="resolve")row={...row,status:"Resolved",resolvedAt:now(),
      resolution:str(body.resolution)||row.resolution};
    if(action==="reopen")row={...row,status:"Open",resolvedAt:"",resolution:""};
    const statements:unknown[]=[db.update(wfObservations).set(row).where(eq(wfObservations.id,id))];
    // retagging replaces the set rather than accumulating stale names
    if(Array.isArray(body.tags)){
      const tagged=(body.tags as string[]).slice(0,50);
      if(!tagged.length)return bad("An observation must stay tagged to at least one employee",422);
      statements.push(db.delete(wfObsTags).where(eq(wfObsTags.observationId,id)));
      statements.push(db.insert(wfObsTags).values(tagged.map(e=>
        ({id:`OT-${Math.random().toString(36).slice(2,10)}`,observationId:id,employeeId:e}))));
    }
    await writeWithAudit(statements,actorOf(req,body),"observation",id,
      action==="resolve"?"Observation resolved":action==="reopen"?"Observation reopened":"Observation updated",
      `${row.ref} · ${row.status}`);
    return Response.json({observation:row});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    await writeWithAudit([
      db.delete(wfObsReplies).where(eq(wfObsReplies.observationId,id)),
      db.delete(wfObsTags).where(eq(wfObsTags.observationId,id)),
      db.delete(wfObservations).where(eq(wfObservations.id,id))],
      actorOf(req),"observation",id,"Observation deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
