"use client";
import{useState}from"react";
import{Download,FileUp,Upload}from"lucide-react";
import{csv,today,shift,useWorkforce}from"./workforce-store";
import type{ImportResult,ImportRow}from"./workforce-store";

const COLUMNS=["task","employee","frequency","start date","end date","priority","status",
  "quantity","completed quantity","expected output","remarks","job description"];

/* A small CSV reader that copes with quoted commas and CRLF, so a sheet exported
   straight out of Excel pastes in without cleaning. */
export function parseCsv(text:string):string[][]{
  const out:string[][]=[];
  let row:string[]=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else quoted=false}
      else cell+=c}
    else if(c==='"')quoted=true;
    else if(c===","){row.push(cell);cell=""}
    else if(c==="\n"){row.push(cell);out.push(row);row=[];cell=""}
    else if(c!=="\r")cell+=c}
  if(cell||row.length){row.push(cell);out.push(row)}
  return out.filter(r=>r.some(c=>c.trim()))}

export function toRows(grid:string[][]):ImportRow[]{
  const copy=grid.slice();
  const first=(copy[0]||[]).map(c=>c.trim().toLowerCase());
  if(first[0]==="task"||first[0]==="task name"||first[1]==="employee")copy.shift();
  return copy.map((r,i)=>({line:i+1,name:(r[0]||"").trim(),employee:(r[1]||"").trim(),
    frequency:(r[2]||"Daily").trim(),due:(r[3]||"").trim(),ends:(r[4]||"").trim(),
    priority:(r[5]||"Medium").trim(),status:(r[6]||"Not Started").trim(),
    qty:Number(r[7])||0,done:Number(r[8])||0,
    expectedOutput:(r[9]||"").trim(),remarks:(r[10]||"").trim(),jd:(r[11]||"").trim()}))}

export default function TaskImport({flash,go}:{flash:(m:string)=>void;go:(v:string)=>void}){
  const wf=useWorkforce();
  const [text,setText]=useState("");
  const [rows,setRows]=useState<ImportRow[]>([]);
  const [result,setResult]=useState<ImportResult|null>(null);
  const [busy,setBusy]=useState(false);

  /* The preview is editable so a wrong cell is corrected here rather than in the
     spreadsheet and re-uploaded. */
  const edit=(index:number,key:keyof ImportRow,value:string|number)=>
    setRows(list=>list.map((r,i)=>i===index?{...r,[key]:value}:r));
  const drop=(index:number)=>setRows(list=>list.filter((_,i)=>i!==index));

  const preview=()=>{
    const parsed=toRows(parseCsv(text));
    setRows(parsed);setResult(null);
    flash(parsed.length?`${parsed.length} row${parsed.length===1?"":"s"} read`:"Nothing to read")};

  const readFile=(file?:File)=>{
    if(!file)return;
    const reader=new FileReader();
    reader.onerror=()=>flash("Could not read that file");
    reader.onload=()=>{const body=String(reader.result);setText(body);
      const parsed=toRows(parseCsv(body));setRows(parsed);setResult(null);
      flash(`${parsed.length} row${parsed.length===1?"":"s"} read from ${file.name}`)};
    reader.readAsText(file)};

  /* Sent in batches of 200 so one request never exceeds what a Worker invocation
     can write, and a large sheet still lands in a handful of round trips. */
  const run=async()=>{
    if(!rows.length)return flash("Read a sheet first");
    setBusy(true);
    const total:ImportResult={imported:0,rejected:0,employees:0,errors:[]};
    try{
      for(let i=0;i<rows.length;i+=200){
        const out=await wf.api.importTasks(rows.slice(i,i+200));
        total.imported+=out.imported;
        total.rejected+=out.rejected;
        total.employees=Math.max(total.employees,out.employees||0);
        total.errors=total.errors.concat(out.errors||[])}
      setResult(total);
      flash(`${total.imported} task${total.imported===1?"":"s"} imported, ${total.rejected} rejected`)}
    catch(e){flash(e instanceof Error?e.message:"Import failed")}
    finally{setBusy(false)}};

  const template=()=>csv([COLUMNS,
    ["Customer receipt posting","EMP-007","Daily",today(),"","High","In Progress","0","0",
     "All receipts posted same day","",""],
    ["Invoice entry batch","EMP-011","Daily",today(),shift(today(),90),"High","Not Started",
     "100","0","","",""],
    ["Bank reconciliation preparation","Suresh Babu","Weekly",shift(today(),3),"","High",
     "Not Started","0","0","Recon working sheet","",
     "Prepares bank reconciliations and reports variances to the GL head."],
    ["Petty cash count","EMP-010","Monthly",shift(today(),10),"","Critical","Not Started",
     "0","0","","",""]],
    "workforce-task-import-template.csv");

  return <div className="page">
    <div className="intro"><div><small>BULK DATA</small><h2>Import tasks</h2>
      <p>Load a whole sheet of work in one go. Every row is checked against the employee
        register before anything is written.</p></div>
      <div className="wf-head-tools">
        <button onClick={template}><Download/>Download template</button>
        <label className="wf-filebtn"><Upload/>Choose CSV
          <input type="file" accept=".csv,text/csv" hidden
            onChange={e=>{readFile(e.target.files?.[0]);e.target.value=""}}/></label>
      </div></div>

    <section className="panel">
      <div className="panel-head"><div><small>COLUMNS</small><h2>Sheet format</h2></div></div>
      <div className="wf-format">
        {[["task","required","the task name"],
          ["employee","required","employee ID, code or full name"],
          ["frequency","required","Daily, Weekly, Monthly or One Time"],
          ["start date","required","YYYY-MM-DD — weekly repeats on this weekday, monthly on this date"],
          ["end date","optional","YYYY-MM-DD — leave blank to run open ended"],
          ["priority","optional","Low, Medium, High or Critical"],
          ["status","optional","Not Started, In Progress, On Hold, Completed, Cancelled"],
          ["quantity","optional","target count for volume work"],
          ["completed quantity","optional","how many are already done"],
          ["expected output","optional","what finished looks like"],
          ["remarks","optional","free text"],
          ["job description","optional","sets this person's own JD, overriding the role's"]].map(c=>
          <div key={c[0]}><b>{c[0]}</b><span className={c[1]==="required"?"req":""}>{c[1]}</span>
            <small>{c[2]}</small></div>)}
      </div>
      <p className="wf-note wf-format-note">A header row is detected and skipped. Recurring tasks
        get their next occurrence automatically once the due date passes.</p>
    </section>

    <section className="panel">
      <div className="panel-head"><div><small>PASTE OR UPLOAD</small><h2>Sheet contents</h2></div>
        <span>{rows.length} rows read</span></div>
      <div className="wf-import-body">
        <textarea value={text} onChange={e=>setText(e.target.value)}
          placeholder="Paste rows straight from Excel or Google Sheets, or use Choose CSV above."/>
        <div className="wf-head-tools">
          <button onClick={preview}><FileUp/>Read sheet</button>
          <button className="primary" disabled={busy||!rows.length} onClick={run}>
            {busy?"Importing…":`Import ${rows.length||""} task${rows.length===1?"":"s"}`}</button>
        </div>
      </div>
    </section>

    {!!rows.length&&!result&&<section className="panel table-panel">
      <div className="panel-head"><div><small>PREVIEW</small><h2>Check and correct before importing</h2></div>
        <span>{rows.length} rows · first 50 shown</span></div>
      <p className="wf-note wf-format-note">Every cell below is editable. Fix anything wrong here
        rather than going back to the spreadsheet, then import.</p>
      <div className="table-wrap"><table className="wf-wide wf-editgrid"><thead><tr>
        <th>#</th><th>TASK</th><th>EMPLOYEE</th><th>FREQUENCY</th><th>START</th><th>END</th>
        <th>PRIORITY</th><th>STATUS</th><th>QTY</th><th>DONE</th><th>JOB DESCRIPTION</th>
        <th></th></tr></thead>
        <tbody>{rows.slice(0,50).map((r,i)=><tr key={r.line}>
          <td>{r.line}</td>
          {([["name","text"],["employee","text"]] as [keyof ImportRow,string][]).map(([k])=>
            <td key={String(k)}><input value={String(r[k]||"")} className={r[k]?"":"bad"}
              onChange={e=>edit(i,k,e.target.value)}/></td>)}
          <td><select value={r.frequency} onChange={e=>edit(i,"frequency",e.target.value)}>
            {["Daily","Weekly","Monthly","One Time"].map(f=><option key={f}>{f}</option>)}</select></td>
          <td><input type="date" value={r.due} className={r.due?"":"bad"}
            onChange={e=>edit(i,"due",e.target.value)}/></td>
          <td><input type="date" value={r.ends||""} onChange={e=>edit(i,"ends",e.target.value)}/></td>
          <td><select value={r.priority} onChange={e=>edit(i,"priority",e.target.value)}>
            {["Low","Medium","High","Critical"].map(f=><option key={f}>{f}</option>)}</select></td>
          <td><select value={r.status} onChange={e=>edit(i,"status",e.target.value)}>
            {["Not Started","In Progress","On Hold","Completed","Cancelled"].map(f=>
              <option key={f}>{f}</option>)}</select></td>
          <td><input type="number" min="0" value={r.qty||0}
            onChange={e=>edit(i,"qty",Number(e.target.value))}/></td>
          <td><input type="number" min="0" value={r.done||0}
            onChange={e=>edit(i,"done",Number(e.target.value))}/></td>
          <td><input value={r.jd||""} placeholder="leave blank to keep"
            onChange={e=>edit(i,"jd",e.target.value)}/></td>
          <td><button className="wf-small" onClick={()=>drop(i)}>Remove</button></td>
        </tr>)}</tbody></table></div>
    </section>}

    {result&&<section className="panel">
      <div className="panel-head"><div><small>RESULT</small><h2>Import finished</h2></div></div>
      <div className="metrics wf-metrics-3" style={{padding:"0 18px"}}>
        <article className="green"><span>Imported</span><b>{result.imported}</b>
          <small>across {result.employees} employee{result.employees===1?"":"s"}</small></article>
        <article className={result.rejected?"red":""}><span>Rejected</span><b>{result.rejected}</b>
          <small>{result.rejected?"listed below":"nothing rejected"}</small></article>
        <article className="violet"><span>Job descriptions</span><b>{result.jdUpdated||0}</b>
          <small>updated from the sheet</small></article>
        <article><span>Rows read</span><b>{rows.length}</b><small>from the sheet</small></article>
      </div>
      {!!result.errors.length&&<div className="table-wrap"><table><thead><tr>
        <th>ROW</th><th>WHY IT WAS REJECTED</th></tr></thead>
        <tbody>{result.errors.map((e,i)=><tr key={i}><td>{e.row}</td><td>{e.reason}</td></tr>)}</tbody>
        </table></div>}
      <div className="wf-import-body">
        <div className="wf-head-tools">
          <button onClick={()=>{setText("");setRows([]);setResult(null)}}>Import another sheet</button>
          <button className="primary" onClick={()=>go("worktasks")}>Open the task register</button>
        </div>
      </div>
    </section>}
  </div>}
