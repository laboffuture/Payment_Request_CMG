import{asc,desc,eq,inArray}from"drizzle-orm";
import{getDb}from"../../../db";
import{paymentRequests,wfConsolidationItems,wfConsolidations,wfLogs}from"../../../db/schema";
import{companyLock,departmentPeers,inCompany,requireAuth}from"../../../lib/auth";
import type{Actor}from"../../../lib/auth";
import{mayConsolidate}from"../../../lib/consolidation";
import type{BatchPayment,Consolidation}from"../../../lib/consolidation";
import{audit,bad,oops,str}from"../../../lib/workforce-api";

/* Consolidated payments. Accounts, audit, finance and the administrator pick payment
   requests from the register and combine them into a batch (CP-26-0001) that has one summary
   and one PDF. A batch only groups requests: each request keeps its own workflow, and nothing
   here changes a request. A request sits in one batch at most (the item table is keyed by
   the payment id); taking it out, or deleting the batch, frees it again. */

type Db=Awaited<ReturnType<typeof getDb>>;
const now=()=>new Date().toISOString();
const MAX_IDS=1000;

async function signedIn(req:Request){
  const{actor,response}=await requireAuth(req,"read");
  if(response)return{actor:null,response};
  if(!mayConsolidate(actor!.roles))
    return{actor:null,response:bad("Consolidated payments are for administration, accounts, audit and finance.",403)};
  return{actor:actor as Actor,response:null}}

/* The requests this reader may see - the same scope as the payment register. */
async function visibleTo(db:Db,actor:Actor){
  const peers=await departmentPeers(actor);
  const lock=await companyLock(actor);
  const rows=await db.select().from(paymentRequests).orderBy(desc(paymentRequests.id));
  return rows.filter(r=>(!peers||peers.includes((r.raisedBy||"").toLowerCase()))&&inCompany(lock,{name:r.company}))}

const asBatchPayment=(r:typeof paymentRequests.$inferSelect):BatchPayment=>({id:r.id,requestNo:r.requestNo,
  company:r.company,department:r.department,vendor:r.vendor,amount:Number(r.amount)||0,currency:r.currency,due:r.due,
  status:r.status,project:r.project||"",projectCode:r.projectCode||"",poNumber:r.poNumber||"",
  invoiceNumber:r.invoiceNumber||"",invoiceDate:r.invoiceDate||"",nature:r.nature||"",tdsValue:r.tdsValue||"",
  paymentMode:r.paymentMode||"",utrNumber:r.utrNumber||""});

/* D1 allows 100 bound parameters a query, so long id lists are split. */
const chunks=<T,>(list:T[],size=90)=>Array.from({length:Math.ceil(list.length/size)},(_,i)=>list.slice(i*size,i*size+size));

const idList=(v:unknown)=>Array.isArray(v)?[...new Set(v.map(Number).filter(n=>Number.isInteger(n)&&n>0))]:[];

/* CP-<yy>-0001, one series per year. */
async function nextNo(db:Db){
  const yy=String(new Date().getFullYear()).slice(2);
  const rows=await db.select({cpNo:wfConsolidations.cpNo}).from(wfConsolidations);
  const top=rows.map(r=>r.cpNo.match(new RegExp(`^CP-${yy}-(\\d+)$`))).reduce((m,x)=>Math.max(m,x?Number(x[1]):0),0);
  return`CP-${yy}-${String(top+1).padStart(4,"0")}`}

/* Checks the requests can go into a batch: each one visible to this reader and not in
   another batch already. Returns the error to show, or null. */
async function checkAdd(db:Db,actor:Actor,ids:number[],batchId:string){
  if(!ids.length)return"Tick at least one payment request.";
  if(ids.length>MAX_IDS)return`At most ${MAX_IDS} payment requests at a time.`;
  const visible=new Map((await visibleTo(db,actor)).map(r=>[r.id,r]));
  const missing=ids.filter(id=>!visible.has(id));
  if(missing.length)return"Some of those payment requests are not available to you any more. Reload and try again.";
  /* Every item read and filtered here rather than with an IN list: D1 allows 100 bound
     parameters a query, and a few hundred ticked requests passed that. */
  const want=new Set(ids);
  const taken=(await db.select({paymentId:wfConsolidationItems.paymentId,batch:wfConsolidations.cpNo,
    batchId:wfConsolidations.id}).from(wfConsolidationItems)
    .innerJoin(wfConsolidations,eq(wfConsolidations.id,wfConsolidationItems.consolidationId)))
    .filter(t=>want.has(t.paymentId));
  const elsewhere=taken.filter(t=>t.batchId!==batchId);
  if(elsewhere.length){
    const named=elsewhere.slice(0,5).map(t=>`${visible.get(t.paymentId)?.requestNo} is already in ${t.batch}`).join("; ");
    return`${named}${elsewhere.length>5?` - and ${elsewhere.length-5} more`:""}. Untick those and try again.`}
  return null}

export async function GET(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response)return response;
    const db=await getDb();
    const visible=new Map((await visibleTo(db,actor)).map(r=>[r.id,r]));
    const batches=await db.select().from(wfConsolidations).orderBy(desc(wfConsolidations.createdAt));
    const items=await db.select().from(wfConsolidationItems).orderBy(asc(wfConsolidationItems.addedAt));
    /* Which batch each request is in, for the tick boxes on the register. */
    const noOf=new Map(batches.map(b=>[b.id,b.cpNo]));
    const inBatch:Record<number,string>={};
    for(const i of items)inBatch[i.paymentId]=noOf.get(i.consolidationId)||"";
    const consolidations:(Consolidation&{hidden:number})[]=batches.map(b=>{
      const mine=items.filter(i=>i.consolidationId===b.id);
      const payments=mine.map(i=>visible.get(i.paymentId)).filter(Boolean).map(r=>asBatchPayment(r!));
      return{id:b.id,cpNo:b.cpNo,title:b.title,note:b.note,createdBy:b.createdBy,createdAt:b.createdAt,
        updatedAt:b.updatedAt,payments,hidden:mine.length-payments.length}});
    return Response.json({consolidations,inBatch});
  }catch(e){return oops(e)}}

/* A new batch from the ticked requests, or more requests added to an existing one. */
export async function POST(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response)return response;
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const ids=idList(body.paymentIds);
    const db=await getDb();
    const into=str(body.consolidationId).trim();
    let batch:typeof wfConsolidations.$inferSelect|undefined;
    if(into){
      [batch]=await db.select().from(wfConsolidations).where(eq(wfConsolidations.id,into)).limit(1);
      if(!batch)return bad("That consolidated payment no longer exists.",404);
    }
    const problem=await checkAdd(db,actor,ids,batch?.id||"");
    if(problem)return bad(problem,409);
    const at=now();
    const who=actor.name||actor.email;
    if(!batch){
      const title=str(body.title).replace(/\s+/g," ").trim().slice(0,200);
      if(!title)return bad("Give the consolidated payment a title.");
      batch={id:`CP-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,cpNo:await nextNo(db),title,
        note:str(body.note).trim().slice(0,2000),createdBy:who,createdByEmail:actor.email,createdAt:at,updatedAt:at};
    }
    const existing=new Set((await db.select({paymentId:wfConsolidationItems.paymentId}).from(wfConsolidationItems)
      .where(eq(wfConsolidationItems.consolidationId,batch.id))).map(r=>r.paymentId));
    const fresh=ids.filter(id=>!existing.has(id));
    const statements:unknown[]=[];
    if(!into)statements.push(db.insert(wfConsolidations).values(batch));
    else statements.push(db.update(wfConsolidations).set({updatedAt:at}).where(eq(wfConsolidations.id,batch.id)));
    for(const id of fresh)statements.push(db.insert(wfConsolidationItems).values({paymentId:id,consolidationId:batch.id,addedBy:who,addedAt:at}));
    statements.push(db.insert(wfLogs).values(audit(actor.email,"consolidation",batch.id,into?"add":"create",
      `${batch.cpNo}: ${fresh.length} payment request(s) ${into?"added":"combined"}`)));
    /* One batch, so a request another person put in a batch a moment ago (the payment id is
       the item key) refuses the whole change rather than half of it. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try{await db.batch(statements as any)}
    catch{return bad("Some of those payment requests were put in another consolidated payment just now. Reload and try again.",409)}
    return Response.json({id:batch.id,cpNo:batch.cpNo,added:fresh.length},{status:into?200:201});
  }catch(e){return oops(e)}}

/* Edit the title or note, or take requests out of the batch. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response)return response;
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const db=await getDb();
    const[batch]=await db.select().from(wfConsolidations).where(eq(wfConsolidations.id,str(body.id))).limit(1);
    if(!batch)return bad("That consolidated payment no longer exists.",404);
    const at=now();
    const statements:unknown[]=[];
    const changes:string[]=[];
    const set:Partial<typeof wfConsolidations.$inferInsert>={updatedAt:at};
    if(typeof body.title==="string"){
      const title=body.title.replace(/\s+/g," ").trim().slice(0,200);
      if(!title)return bad("Give the consolidated payment a title.");
      if(title!==batch.title){set.title=title;changes.push("title")}
    }
    if(typeof body.note==="string"){const note=body.note.trim().slice(0,2000);if(note!==batch.note){set.note=note;changes.push("note")}}
    const remove=idList(body.remove);
    if(remove.length){
      const held=(await db.select({paymentId:wfConsolidationItems.paymentId}).from(wfConsolidationItems)
        .where(eq(wfConsolidationItems.consolidationId,batch.id))).map(r=>r.paymentId);
      const out=remove.filter(id=>held.includes(id));
      if(out.length){
        for(const part of chunks(out))statements.push(db.delete(wfConsolidationItems).where(inArray(wfConsolidationItems.paymentId,part)));
        changes.push(`${out.length} payment request(s) taken out`)}
    }
    if(!changes.length)return Response.json({ok:true});
    statements.unshift(db.update(wfConsolidations).set(set).where(eq(wfConsolidations.id,batch.id)));
    statements.push(db.insert(wfLogs).values(audit(actor.email,"consolidation",batch.id,"update",`${batch.cpNo}: ${changes.join(", ")}`)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(statements as any);
    return Response.json({ok:true});
  }catch(e){return oops(e)}}

/* Deletes the batch. The payment requests in it are not touched, only freed. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    const db=await getDb();
    const[batch]=await db.select().from(wfConsolidations).where(eq(wfConsolidations.id,id)).limit(1);
    if(!batch)return bad("That consolidated payment no longer exists.",404);
    await db.batch([
      db.delete(wfConsolidationItems).where(eq(wfConsolidationItems.consolidationId,id)),
      db.delete(wfConsolidations).where(eq(wfConsolidations.id,id)),
      db.insert(wfLogs).values(audit(actor.email,"consolidation",id,"delete",`${batch.cpNo} deleted`))]);
    return Response.json({ok:true,cpNo:batch.cpNo});
  }catch(e){return oops(e)}}
