import{and,desc,eq}from"drizzle-orm";
import{getDb}from"../../../db";
import{paymentRequests,settingOptions,wfAttachments}from"../../../db/schema";
import{hasWriteRole,requireAuth}from"../../../lib/auth";
import{actorOf,bad,oops,str}from"../../../lib/workforce-api";
import{deleteFile,getFile,putFile,storageLimit,usingObjectStore}from"../../../lib/storage";
import type{Row}from"../../../lib/workforce-api";

/* Documents for anything in the system. Every kind is optional and any number can be
   attached — a payment request often carries an invoice, a purchase order and a
   delivery order together, and nothing should force a choice between them. */
export const ATTACH_KINDS=["Invoice","Proforma invoice","Purchase order","Delivery order",
  "Quotation","Contract","Bank/payment proof","Statement","Reconciliation","Photo","Other"];
const ENTITIES=["payment","batch","ticket","task","observation","employee","audit-task","query","training","planning","completion"];
const ALLOWED_MIME=[/^image\//,/^application\/pdf$/,/^application\/vnd\./,/^application\/msword$/,
  /^text\/csv$/,/^text\/plain$/,/^application\/zip$/,/^application\/vnd\.ms-excel$/];

/* Browsers report a file's type from the operating system, which is unreliable: Windows
   sends .zip as application/x-zip-compressed, and a machine with no handler for .csv or
   .docx sends an empty type that FileReader turns into application/octet-stream. The
   upload picker accepts these extensions, so the server must too - the extension
   decides whenever the reported type is missing or one of those variants. */
const MIME_BY_EXT:Record<string,string>={
  pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",
  webp:"image/webp",heic:"image/heic",heif:"image/heif",bmp:"image/bmp",tif:"image/tiff",
  tiff:"image/tiff",doc:"application/msword",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:"application/vnd.ms-excel",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv:"text/csv",txt:"text/plain",zip:"application/zip"};
const VAGUE_MIME=/^(application\/(octet-stream|x-zip-compressed|x-zip|zip-compressed|csv)|text\/x-csv)?$/;
function resolveMime(reported:string,fileName:string){
  if(!VAGUE_MIME.test(reported))return reported;
  const ext=(/\.([a-z0-9]+)$/i.exec(fileName)||[])[1]?.toLowerCase()||"";
  return MIME_BY_EXT[ext]||reported;
}

/* The document types an administrator has configured (Settings -> Document type),
   plus the built-in ones. The upload panel offers the configured list, so rejecting
   those names here refused every file filed under a type like "Audit validated". */
async function allowedKinds(){
  const kinds=new Set(ATTACH_KINDS);
  try{
    const rows=await (await getDb()).select({name:settingOptions.name}).from(settingOptions)
      .where(and(eq(settingOptions.listId,"attachment.kind"),eq(settingOptions.active,1)));
    for(const r of rows)kinds.add(r.name);
  }catch{/* the built-in list still applies */}
  return kinds;
}

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

    // The type is optional: FileReader writes "data:;base64," for a file with no type.
    const match=/^data:([^;,]*)(?:;[^,;]*)*;base64,(.*)$/.exec(dataUrl);
    if(!match)return bad("The file must be a base64 data URL");
    const [,reported,data]=match;
    if(!data)return bad(`${fileName} is empty`);
    const mime=resolveMime(reported,fileName);
    if(!ALLOWED_MIME.some(r=>r.test(mime)))
      return bad(`${fileName}: ${mime||"this"} file type is not accepted. Use PDF, an image, `+
        `Word, Excel, CSV, text or ZIP.`,415);

    const pad=(/=+$/.exec(data)||[""])[0].length;
    const bytes=Math.floor(data.length*3/4)-pad;
    const limit=await storageLimit();
    if(bytes>limit)
      return bad(`That file is ${Math.round(bytes/1024)} KB; the limit here is `+
        `${Math.round(limit/1024)} KB`,413);

    const kind=str(body.kind,"Other");
    const kinds=await allowedKinds();
    if(!kinds.has(kind))return bad(`"${kind}" is not a document type. Use one of ${[...kinds].join(", ")}`);

    const id=`AT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const storageKey=await putFile(id,data);
    const row={id,entityType,entityId,kind,fileName,mime,bytes,storageKey,
      note:str(body.note).slice(0,300),uploadedBy:actor?.name||actorOf(req,body),
      uploadedAt:new Date().toISOString()};
    await (await getDb()).insert(wfAttachments).values(row);
    const{storageKey:_hidden,...safe}=row;
    return Response.json({attachment:safe},{status:201});
  }catch(e){return oops(e)}}

/* Removing the row and the stored bytes together, so nothing is orphaned in storage.

   A write role may remove any document. A requestor may remove only what they uploaded
   themselves, only on their own payment request, and only while it is back with them on a
   query - the one moment a wrong invoice or proforma has to be replaced. Once it is with
   accounts again the documents are evidence and stay put. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    const db=await getDb();
    const [row]=await db.select().from(wfAttachments).where(eq(wfAttachments.id,id)).limit(1);
    if(!row)return bad("Not found",404);
    if(!hasWriteRole(actor?.roles)){
      const payment=row.entityType==="payment"&&Number.isFinite(Number(row.entityId))
        ?(await db.select({raisedBy:paymentRequests.raisedBy,status:paymentRequests.status})
            .from(paymentRequests).where(eq(paymentRequests.id,Number(row.entityId))).limit(1))[0]
        :undefined;
      const own=!!payment&&!!actor?.email
        &&(payment.raisedBy||"").toLowerCase()===actor.email.toLowerCase();
      if(!own||payment?.status!=="Query Raised")
        return bad("Documents can be removed by the requestor only while their request is back with them on a query.",403);
      if(!actor?.name||row.uploadedBy!==actor.name)
        return bad("You can remove only the documents you uploaded. Ask accounts to remove this one.",403);
    }
    await deleteFile(row.storageKey);
    await db.delete(wfAttachments).where(eq(wfAttachments.id,id));
    return Response.json({deleted:true,by:actor?.name||""});
  }catch(e){return oops(e)}}
