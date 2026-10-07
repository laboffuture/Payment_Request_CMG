"use client";

/* Preview of a file the user has picked but not uploaded yet.

   Images, PDFs and text the browser shows by itself. Excel (.xlsx) and Word (.docx) files
   are zip archives of XML, so they are opened here with the browser's own
   DecompressionStream - no library - and shown as a table per sheet or as the document's
   paragraphs. Old binary formats (.xls, .doc) and anything else get a plain "open it"
   fallback. Nothing leaves the browser: the file is read from memory. */

import{useEffect,useMemo,useState}from"react";
import{Download,X}from"lucide-react";

type Sheet={name:string;rows:string[][]};
type View={kind:"image"|"pdf"|"none"}|{kind:"text";text:string}|{kind:"table";sheets:Sheet[]}
  |{kind:"doc";paragraphs:string[]}|{kind:"error";message:string};

const ROW_LIMIT=300;
const ext=(name:string)=>name.toLowerCase().split(".").pop()||"";
const kindOf=(f:File)=>{const e=ext(f.name);
  if(f.type.startsWith("image/"))return"image";
  if(f.type==="application/pdf"||e==="pdf")return"pdf";
  if(e==="xlsx")return"xlsx";if(e==="docx")return"docx";if(e==="csv")return"csv";
  if(f.type.startsWith("text/")||e==="txt")return"text";
  return"none"};

/* ---- a minimal zip reader: central directory -> entry -> inflate ---------------- */
async function unzip(buf:ArrayBuffer):Promise<Map<string,()=>Promise<string>>>{
  const v=new DataView(buf),u8=new Uint8Array(buf);
  let eocd=-1;
  for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50){eocd=i;break}
  if(eocd<0)throw new Error("This file is not a valid Office document.");
  const count=v.getUint16(eocd+10,true);let p=v.getUint32(eocd+16,true);
  const out=new Map<string,()=>Promise<string>>(),dec=new TextDecoder();
  for(let n=0;n<count&&v.getUint32(p,true)===0x02014b50;n++){
    const method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),nameLen=v.getUint16(p+28,true),
      extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nameLen));
    out.set(name,async()=>{
      const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
      const raw=u8.slice(start,start+size);
      if(method===0)return dec.decode(raw);
      const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text()});
    p+=46+nameLen+extra+comment}
  return out}

const xml=(s:string)=>new DOMParser().parseFromString(s,"application/xml");
/* By local name: some tools write <x:sheet>/<x:c>, Excel itself writes <sheet>/<c>. */
const tags=(node:Document|Element,name:string)=>Array.from(node.getElementsByTagNameNS("*",name));
const textOf=(el:Element)=>tags(el,"t").map(t=>t.textContent||"").join("");
const colIndex=(ref:string)=>{let n=0;for(const ch of ref.replace(/\d+/g,""))n=n*26+ch.charCodeAt(0)-64;return n-1};

/* Excel stores dates as day numbers; a cell is a date when its number format says so. */
const BUILTIN_DATES=new Set([14,15,16,17,18,19,20,21,22,45,46,47]);
const asDate=(serial:number)=>new Date(Math.round((serial-25569)*86400000))
  .toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});

async function readXlsx(buf:ArrayBuffer):Promise<Sheet[]>{
  const zip=await unzip(buf),read=async(path:string)=>{const f=zip.get(path);return f?f():""};
  const strings=tags(xml(await read("xl/sharedStrings.xml")),"si").map(textOf);
  const styles=xml(await read("xl/styles.xml")),custom=new Map<number,string>();
  tags(styles,"numFmt").forEach(f=>custom.set(+(f.getAttribute("numFmtId")||0),f.getAttribute("formatCode")||""));
  const xfs=tags(styles,"cellXfs")[0];
  const dateStyle=(xfs?tags(xfs,"xf"):[]).map(xf=>{const id=+(xf.getAttribute("numFmtId")||0);
    return BUILTIN_DATES.has(id)||/[dmy]/i.test((custom.get(id)||"").replace(/"[^"]*"|\[[^\]]*\]/g,""))});
  const rels=new Map(tags(xml(await read("xl/_rels/workbook.xml.rels")),"Relationship")
    .map(r=>[r.getAttribute("Id")||"",r.getAttribute("Target")||""]));
  const sheets:Sheet[]=[];
  for(const s of tags(xml(await read("xl/workbook.xml")),"sheet")){
    const rid=s.getAttribute("r:id")||s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")||"";
    const target=(rels.get(rid)||"").replace(/^\/?(xl\/)?/,"");
    const doc=xml(await read(`xl/${target}`)),rows:string[][]=[];
    for(const row of tags(doc,"row").slice(0,ROW_LIMIT)){
      const cells:string[]=[];
      tags(row,"c").forEach((c,i)=>{
        const ref=c.getAttribute("r"),at=ref?colIndex(ref):i,type=c.getAttribute("t"),
          raw=tags(c,"v")[0]?.textContent??"";
        let value=raw;
        if(type==="s")value=strings[+raw]??"";
        else if(type==="inlineStr")value=textOf(c);
        else if(type==="b")value=raw==="1"?"TRUE":"FALSE";
        else if(raw!==""&&(!type||type==="n")&&dateStyle[+(c.getAttribute("s")||0)])value=asDate(+raw);
        cells[at]=value});
      rows.push(Array.from(cells,x=>x??""))}
    // Formatted but empty rows at the bottom are not worth showing.
    while(rows.length&&rows[rows.length-1].every(v=>v===""))rows.pop();
    sheets.push({name:s.getAttribute("name")||`Sheet ${sheets.length+1}`,rows})}
  return sheets}

async function readDocx(buf:ArrayBuffer):Promise<string[]>{
  const zip=await unzip(buf),f=zip.get("word/document.xml");
  if(!f)throw new Error("This Word file has no readable text.");
  return tags(xml(await f()),"p").map(p=>tags(p,"t").map(t=>t.textContent||"").join(""))}

/* CSV with quoted fields ("a, b" and "" inside quotes). */
function readCsv(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],cell="",q=false;
  for(let i=0;i<text.length&&rows.length<ROW_LIMIT;i++){const ch=text[i];
    if(q){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')q=false;else cell+=ch}
    else if(ch==='"')q=true;else if(ch===",")row.push(cell),cell="";
    else if(ch==="\n"){row.push(cell.replace(/\r$/,""));rows.push(row);row=[];cell=""}else cell+=ch}
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows}

export default function FilePreview({file,onClose}:{file:File;onClose:()=>void}){
  const url=useMemo(()=>URL.createObjectURL(file),[file]);
  const kind=kindOf(file);
  const[view,setView]=useState<View|null>(kind==="image"||kind==="pdf"||kind==="none"?{kind}:null);
  const[tab,setTab]=useState(0);
  useEffect(()=>()=>URL.revokeObjectURL(url),[url]);
  useEffect(()=>{const esc=(e:KeyboardEvent)=>e.key==="Escape"&&onClose();
    window.addEventListener("keydown",esc);return()=>window.removeEventListener("keydown",esc)},[onClose]);
  useEffect(()=>{let live=true;
    const done=(v:View)=>{if(live)setView(v)};
    (async()=>{try{
      if(kind==="xlsx")done({kind:"table",sheets:await readXlsx(await file.arrayBuffer())});
      else if(kind==="docx")done({kind:"doc",paragraphs:await readDocx(await file.arrayBuffer())});
      else if(kind==="csv")done({kind:"table",sheets:[{name:file.name,rows:readCsv(await file.text())}]});
      else if(kind==="text")done({kind:"text",text:(await file.text()).slice(0,200000)});
    }catch(e){done({kind:"error",message:e instanceof Error?e.message:"Could not read this file."})}})();
    return()=>{live=false}},[file,kind]);

  const sheet=view?.kind==="table"?view.sheets[Math.min(tab,view.sheets.length-1)]:null;
  const width=sheet?Math.max(1,...sheet.rows.map(r=>r.length)):0;

  return <div className="file-preview" role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`}>
    <button type="button" className="file-preview-scrim" aria-label="Close preview" onClick={onClose}/>
    <section>
      <header><b title={file.name}>{file.name}</b>
        <a href={url} download={file.name} title="Download"><Download/></a>
        <button type="button" aria-label="Close preview" onClick={onClose}><X/></button></header>
      <div className="file-preview-body">
        {!view&&<p className="file-preview-note">Opening…</p>}
        {view?.kind==="image"&&<img src={url} alt={file.name}/>}
        {view?.kind==="pdf"&&<iframe src={url} title={file.name}/>}
        {view?.kind==="text"&&<pre>{view.text}</pre>}
        {view?.kind==="doc"&&<article>{view.paragraphs.map((p,i)=>p?<p key={i}>{p}</p>:<br key={i}/>)}</article>}
        {view?.kind==="table"&&sheet&&<>
          {view.sheets.length>1&&<nav>{view.sheets.map((s,i)=><button type="button" key={s.name+i}
            className={i===tab?"active":""} onClick={()=>setTab(i)}>{s.name}</button>)}</nav>}
          {sheet.rows.length?<div className="file-preview-table"><table><tbody>
            {sheet.rows.map((r,i)=><tr key={i}><th>{i+1}</th>
              {Array.from({length:width},(_,j)=><td key={j}>{r[j]??""}</td>)}</tr>)}
          </tbody></table></div>:<p className="file-preview-note">This sheet is empty.</p>}
          {sheet.rows.length>=ROW_LIMIT&&<p className="file-preview-note">Showing the first {ROW_LIMIT} rows.</p>}</>}
        {view?.kind==="none"&&<p className="file-preview-note">This file type cannot be shown here.
          Use the download button to open it.</p>}
        {view?.kind==="error"&&<p className="file-preview-note">{view.message} Use the download button to open it.</p>}
      </div>
    </section>
  </div>}
