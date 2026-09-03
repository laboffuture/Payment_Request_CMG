import{eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfEmployees,wfPhotos}from"../../../../db/schema";
import{actorOf,bad,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

/* Photos are capped hard. The client resizes to 256px before upload, which lands
   around 15-25 KB; 80 KB is the ceiling a hand-crafted request can push through.
   At 10,000 employees that is 800 MB worst case against D1's 10 GB budget. Move to
   R2 before this becomes the largest table in the database. */
const MAX_BYTES=80*1024;
const ALLOWED=["image/jpeg","image/png","image/webp"];

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("employeeId")||"";
    if(!id)return bad("employeeId is required");
    const [row]=await (await getDb()).select().from(wfPhotos).where(eq(wfPhotos.employeeId,id)).limit(1);
    if(!row)return new Response(null,{status:404});
    const binary=atob(row.data);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Response(bytes,{headers:{
      "content-type":row.mime,
      "content-length":String(bytes.length),
      // immutable because the URL carries ?v=photoAt; a new photo means a new URL
      "cache-control":"public, max-age=31536000, immutable",
      "etag":`"${row.updatedAt}"`}});
  }catch(e){return oops(e)}}

export async function PUT(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.employeeId);
    const dataUrl=str(body.dataUrl);
    if(!id||!dataUrl)return bad("employeeId and dataUrl are required");
    const match=/^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if(!match)return bad("dataUrl must be a base64 data URL");
    const [,mime,data]=match;
    if(!ALLOWED.includes(mime))return bad(`Unsupported image type ${mime}`,415);
    const pad=(/=+$/.exec(data)||[""])[0].length;
    const bytes=Math.floor(data.length*3/4)-pad;
    if(bytes>MAX_BYTES)return bad(`Image is ${Math.round(bytes/1024)} KB; the limit is ${MAX_BYTES/1024} KB`,413);
    const updatedAt=new Date().toISOString();
    const db=await getDb();
    await writeWithAudit([
      db.insert(wfPhotos).values({employeeId:id,mime,data,bytes,updatedAt})
        .onConflictDoUpdate({target:wfPhotos.employeeId,set:{mime,data,bytes,updatedAt}}),
      db.update(wfEmployees).set({photoAt:updatedAt}).where(eq(wfEmployees.id,id))],
      actorOf(req,body),"employee",id,"Photo updated",`${Math.round(bytes/1024)} KB`);
    return Response.json({photoAt:updatedAt,bytes});
  }catch(e){return oops(e)}}

export async function DELETE(req:Request){
  try{
    const{response}=await requireAuth(req,"org");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("employeeId")||"";
    if(!id)return bad("employeeId is required");
    const db=await getDb();
    await writeWithAudit([
      db.delete(wfPhotos).where(eq(wfPhotos.employeeId,id)),
      db.update(wfEmployees).set({photoAt:""}).where(eq(wfEmployees.id,id))],
      actorOf(req),"employee",id,"Photo removed","");
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
