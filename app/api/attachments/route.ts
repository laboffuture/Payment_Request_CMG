import{and,desc,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{wfAttachments}from"../../../db/schema";
import{requireAuth}from"../../../lib/auth";
import{actorOf,bad,oops,str}from"../../../lib/workforce-api";
import{deleteFile,getFile,putFile,storageLimit,usingObjectStore}from"../../../lib/storage";
import type{Row}from"../../../lib/workforce-api";

/* Documents for anything in the system. Every kind is optional and any number can be
   attached — a payment request often carries an invoice, a purchase order and a
   delivery order together, and nothing should force a choice between them. */
export const ATTACH_KINDS=["Invoice","Proforma invoice","Purchase order","Delivery order",
  "Quotation","Contract","Bank/payment proof","Statement","Reconciliation","Photo","Other"];
const ENTITIES=["payment","batch","ticket","task","observation","employee","audit-task","query","training"];
const ALLOWED_MIME=[/^image\//,/^application\/pdf$/,/^application\/vnd\./,/^application\/msword$/,
  /^text\/csv$/,/^text\/plain$/,/^application\/zip$/,/^application\/vnd\.ms-excel$/];

/* List what is attached to one record, or stream a single file back. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const db=await getDb();
    const id=url.searchParams.get("id");

    if(id){
      const [row]=await db.select().from(wfAttachments).where(eq(wfAttachments.id,id)).limit(1);
      if(!row)return bad("Not found",404);
      const bytes=await getFile(row.storageKey);
      if(!bytes)return bad("The file is no longer in storage",410);
      return new Response(bytes as unknown as BodyInit,{headers:{
        "content-type":row.mime,
        "content-length":String(bytes.length),
        "content-disposition":`inline; filename="${row.fileName.replace(/"/g,"")}"`,
        "cache-control":"private, max-age=3600"}});
    }

    const entityType=url.searchParams.get("entityType")||"";
    const entityId=url.searchParams.get("entityId")||"";
    if(!entityType||!entityId)return bad("entityType and entityId are required");
    const rows=await db.select({id:wfAttachments.id,kind:wfAttachments.kind,
      fileName:wfAttachments.fileName,mime:wfAttachments.mime,bytes:wfAttachments.bytes,
      note:wfAttachments.note,uploadedBy:wfAttachments.uploadedBy,
      uploadedAt:wfAttachments.uploadedAt}).from(wfAttachments)
      .where(and(eq(wfAttachments.entityType,entityType),eq(wfAttachments.entityId,entityId)))
      .orderBy(desc(wfAttachments.uploadedAt));
    return Response.json({attachments:rows,kinds:ATTACH_KINDS,
      limit:await storageLimit(),objectStore:await usingObjectStore()});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const entityType=str(body.entityType);
    const entityId=str(body.entityId);
    const fileName=str(body.fileName).slice(0,200);
    const dataUrl=str(body.dataUrl);
    if(!entityType||!entityId)return bad("entityType and entityId are required");
    if(ENTITIES.indexOf(entityType)<0)return bad(`entityType must be one of ${ENTITIES.join(", ")}`);
    if(!fileName)return bad("fileName is required");
    if(!dataUrl)return bad("No file supplied");

    const match=/^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if(!match)return bad("The file must be a base64 data URL");
    const [,mime,data]=match;
    if(!ALLOWED_MIME.some(r=>r.test(mime)))
      return bad(`${mime} is not an accepted file type`,415);

    const pad=(/=+$/.exec(data)||[""])[0].length;
    const bytes=Math.floor(data.length*3/4)-pad;
    const limit=await storageLimit();
    if(bytes>limit)
      return bad(`That file is ${Math.round(bytes/1024)} KB; the limit here is `+
        `${Math.round(limit/1024)} KB`,413);

    const kind=str(body.kind,"Other");
    if(ATTACH_KINDS.indexOf(kind)<0)return bad(`kind must be one of ${ATTACH_KINDS.join(", ")}`);

    const id=`AT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const storageKey=await putFile(id,data);
    const row={id,entityType,entityId,kind,fileName,mime,bytes,storageKey,
      note:str(body.note).slice(0,300),uploadedBy:actor?.name||actorOf(req,body),
      uploadedAt:new Date().toISOString()};
    await (await getDb()).insert(wfAttachments).values(row);
    const{storageKey:_hidden,...safe}=row;
    return Response.json({attachment:safe},{status:201});
  }catch(e){return oops(e)}}

/* Removing the row and the stored bytes together, so nothing is orphaned in storage. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [row]=await db.select().from(wfAttachments).where(eq(wfAttachments.id,id)).limit(1);
    if(!row)return bad("Not found",404);
    await deleteFile(row.storageKey);
    await db.delete(wfAttachments).where(eq(wfAttachments.id,id));
    return Response.json({deleted:true,by:actor?.name||""});
  }catch(e){return oops(e)}}
