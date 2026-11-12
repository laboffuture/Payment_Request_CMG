/* A plain ZIP file built in the browser. Files are stored, not compressed: invoices and
   scans are PDFs and images that are already compressed, so storing is quick and costs
   almost nothing in size. Names are written as UTF-8. Up to 4 GB in all (ZIP32). */

const CRC_TABLE=(()=>{
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}
  return t})();

function crc32(data:Uint8Array){
  let c=0xffffffff;
  for(let i=0;i<data.length;i++)c=CRC_TABLE[(c^data[i])&0xff]^(c>>>8);
  return(c^0xffffffff)>>>0}

/* MS-DOS date and time, as ZIP keeps them. */
function dosTime(d:Date){
  const time=(d.getHours()<<11)|(d.getMinutes()<<5)|(Math.floor(d.getSeconds()/2));
  const date=((Math.max(d.getFullYear(),1980)-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  return{time,date}}

export type ZipEntry={name:string;data:Uint8Array;date?:Date};

export function makeZip(entries:ZipEntry[]):Blob{
  const enc=new TextEncoder();
  const parts:Uint8Array[]=[];
  const central:Uint8Array[]=[];
  let offset=0;
  for(const e of entries){
    const name=enc.encode(e.name);
    const crc=crc32(e.data);
    const{time,date}=dosTime(e.date||new Date());
    const local=new Uint8Array(30+name.length);
    const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
    lv.setUint16(8,0,true);lv.setUint16(10,time,true);lv.setUint16(12,date,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,e.data.length,true);lv.setUint32(22,e.data.length,true);
    lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);local.set(name,30);
    const head=new Uint8Array(46+name.length);
    const cv=new DataView(head.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);
    cv.setUint16(10,0,true);cv.setUint16(12,time,true);cv.setUint16(14,date,true);cv.setUint32(16,crc,true);
    cv.setUint32(20,e.data.length,true);cv.setUint32(24,e.data.length,true);cv.setUint16(28,name.length,true);
    cv.setUint32(42,offset,true);head.set(name,46);
    parts.push(local,e.data);
    central.push(head);
    offset+=local.length+e.data.length}
  const size=central.reduce((n,c)=>n+c.length,0);
  const end=new Uint8Array(22);
  const ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);
  ev.setUint32(12,size,true);ev.setUint32(16,offset,true);
  return new Blob([...parts,...central,end] as unknown as BlobPart[],{type:"application/zip"})}

/* A name that is safe as a file or folder name on Windows, macOS and Linux. */
export const safeName=(s:string)=>s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g,"_").replace(/\s+/g," ").trim().slice(0,120)||"file";
