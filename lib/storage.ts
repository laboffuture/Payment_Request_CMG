import{eq}from"drizzle-orm";
import{getDb}from"../db";
import{wfAttachmentBlobs}from"../db/schema";

/* File storage with two backends.

   When an object-storage bucket is bound (`MEDIA`) the bytes go there, which is where
   invoices and purchase orders belong — no row-size ceiling and no pressure on the
   database's storage budget. Where no bucket is bound the file falls back to a
   dedicated table, capped much lower, so a deployment without object storage still
   works rather than failing at upload. */

const R2_LIMIT=15*1024*1024;   // a generous ceiling for a scanned document
const DB_LIMIT=700*1024;       // D1 rows are capped at 2 MB; base64 inflates by a third

type Bucket={
  put:(key:string,value:ArrayBuffer|Uint8Array,opts?:unknown)=>Promise<unknown>;
  get:(key:string)=>Promise<{arrayBuffer:()=>Promise<ArrayBuffer>}|null>;
  delete:(key:string)=>Promise<void>};

async function bucket():Promise<Bucket|null>{
  try{
    const{env}=await import("../db/bindings");
    const b=(env as unknown as Record<string,unknown>).MEDIA;
    return b?b as Bucket:null;
  }catch{return null}}

export const storageLimit=async()=>await bucket()?R2_LIMIT:DB_LIMIT;
export const usingObjectStore=async()=>!!await bucket();

const toBytes=(base64:string)=>{
  const binary=atob(base64);
  const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out};

export async function putFile(id:string,base64:string){
  const b=await bucket();
  if(b){
    const key=`attachments/${id}`;
    await b.put(key,toBytes(base64));
    return key}
  const db=await getDb();
  await db.insert(wfAttachmentBlobs).values({id,data:base64});
  return `db:${id}`}

export async function getFile(storageKey:string):Promise<Uint8Array|null>{
  if(storageKey.startsWith("db:")){
    const db=await getDb();
    const [row]=await db.select().from(wfAttachmentBlobs)
      .where(eq(wfAttachmentBlobs.id,storageKey.slice(3))).limit(1);
    return row?toBytes(row.data):null}
  const b=await bucket();
  if(!b)return null;
  const obj=await b.get(storageKey);
  return obj?new Uint8Array(await obj.arrayBuffer()):null}

export async function deleteFile(storageKey:string){
  if(storageKey.startsWith("db:")){
    const db=await getDb();
    await db.delete(wfAttachmentBlobs).where(eq(wfAttachmentBlobs.id,storageKey.slice(3)));
    return}
  const b=await bucket();
  if(b)await b.delete(storageKey)}
