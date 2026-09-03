import{getDb}from"../../../../../db";
import{eq}from"drizzle-orm";
import{wfEmployees,wfTasks}from"../../../../../db/schema";
import{actorOf,bad,num,oops,str,writeWithAudit}from"../../../../../lib/workforce-api";
import type{Row}from"../../../../../lib/workforce-api";
import{requireAuth}from"../../../../../lib/auth";

const FREQ=["Daily","Weekly","Monthly","One Time"];
const PRIORITY=["Low","Medium","High","Critical"];
const STATUS=["Not Started","In Progress","On Hold","Completed","Cancelled"];
const MAX_ROWS=500;
/* wf_tasks has 22 columns and D1 binds at most 100 parameters per statement, so a
   multi-row insert is chunked at four rows and the chunks go out as one batch. */
const CHUNK=4;

const week=(date:string)=>{const d=new Date(date+"T00:00:00");const t=new Date(d);
  t.setDate(d.getDate()+4-(d.getDay()||7));const y0=new Date(t.getFullYear(),0,1);
  return `${t.getFullYear()}-W${String(Math.ceil(((t.getTime()-y0.getTime())/86400000+1)/7)).padStart(2,"0")}`};
const periodOf=(f:string,d:string)=>f==="Daily"?d:f==="Weekly"?week(d):f==="Monthly"?d.slice(0,7):d;
const isDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));

/* Validates every row against the live employee register before writing anything.
   Bad rows come back with their line number and the reason, and good rows still
   import — a single typo does not reject the whole sheet. */
export async function POST(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const rows=Array.isArray(body.rows)?body.rows as Row[]:[];
    if(!rows.length)return bad("No rows supplied");
    if(rows.length>MAX_ROWS)
      return bad(`At most ${MAX_ROWS} rows per import. Split the sheet and run it again.`,413);
    const db=await getDb();

    const wanted=Array.from(new Set(rows.map(r=>str(r.employee).trim()).filter(Boolean)));
    const people=wanted.length
      ?await db.select({id:wfEmployees.id,code:wfEmployees.code,name:wfEmployees.name,
          deptId:wfEmployees.deptId,active:wfEmployees.active}).from(wfEmployees)
      :[];
    const byKey=new Map<string,typeof people[number]>();
    for(const p of people){
      byKey.set(p.id.toLowerCase(),p);
      byKey.set(p.code.toLowerCase(),p);
      byKey.set(p.name.toLowerCase(),p)}

    const good:Record<string,unknown>[]=[];
    const jdUpdates=new Map<string,string>();
    const bad_:{row:number;reason:string}[]=[];
    const stamp=new Date().toISOString();

    rows.forEach((r,i)=>{
      const line=num(r.line)||i+1;
      const name=str(r.name).trim();
      const who=str(r.employee).trim();
      const freq=str(r.frequency).trim()||"Daily";
      const due=str(r.due).trim();
      if(!name)return bad_.push({row:line,reason:"task name is required"});
      if(!who)return bad_.push({row:line,reason:"employee is required"});
      const person=byKey.get(who.toLowerCase());
      if(!person)return bad_.push({row:line,reason:`no employee matches "${who}"`});
      if(!person.active)return bad_.push({row:line,reason:`${person.name} is inactive`});
      if(FREQ.indexOf(freq)<0)
        return bad_.push({row:line,reason:`frequency "${freq}" must be one of ${FREQ.join(", ")}`});
      if(!due||!isDate(due))
        return bad_.push({row:line,reason:"due date is required as YYYY-MM-DD"});
      const priority=str(r.priority).trim()||"Medium";
      if(PRIORITY.indexOf(priority)<0)
        return bad_.push({row:line,reason:`priority "${priority}" is not valid`});
      const status=str(r.status).trim()||"Not Started";
      if(STATUS.indexOf(status)<0)
        return bad_.push({row:line,reason:`status "${status}" is not valid`});
      const ends=str(r.ends).trim();
      if(ends&&!isDate(ends))
        return bad_.push({row:line,reason:"end date must be YYYY-MM-DD or left blank"});
      if(ends&&ends<due)
        return bad_.push({row:line,reason:"end date is before the start date"});
      // an optional job-description column updates the person's own JD in the same pass
      const jd=str(r.jd).trim();
      if(jd)jdUpdates.set(person.id,jd);
      const qty=num(r.qty);
      const done=Math.min(num(r.done),qty||Number.MAX_SAFE_INTEGER);
      const id=`T-imp-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2,6)}`;
      good.push({id,seriesId:str(r.seriesId)||`S-imp-${name.toLowerCase().replace(/\W+/g,"-")}-${person.id}`,
        name,description:str(r.description),frequency:freq,period:periodOf(freq,due),
        start:isDate(str(r.start))?str(r.start):due,due,priority,employeeId:person.id,
        deptId:person.deptId,assignedBy:str(r.assignedBy)||actorOf(req,body),
        expectedOutput:str(r.expectedOutput),remarks:str(r.remarks),status,
        progress:status==="Completed"?100:Math.min(Math.max(num(r.progress),0),100),
        qty,done:status==="Completed"&&qty?qty:done,blocker:str(r.blocker),
        nextAction:str(r.nextAction),
        completedAt:status==="Completed"?(isDate(str(r.completedAt))?str(r.completedAt):due):"",
        endsAt:ends,updatedAt:stamp})});

    if(good.length){
      const statements=[];
      for(let i=0;i<good.length;i+=CHUNK)
        statements.push(db.insert(wfTasks).values(good.slice(i,i+CHUNK) as never));
      // job descriptions ride along in the same batch so one sheet can do both
      jdUpdates.forEach((jd,id)=>
        statements.push(db.update(wfEmployees).set({jd}).where(eq(wfEmployees.id,id))));
      await writeWithAudit(statements,actorOf(req,body),"task","import","Tasks imported",
        `${good.length} imported, ${bad_.length} rejected`+
        (jdUpdates.size?`, ${jdUpdates.size} job description${jdUpdates.size===1?"":"s"} updated`:""));
    }
    return Response.json({imported:good.length,rejected:bad_.length,errors:bad_.slice(0,100),
      employees:Array.from(new Set(good.map(g=>g.employeeId))).length,
      jdUpdated:jdUpdates.size},
      {status:good.length?201:422});
  }catch(e){return oops(e)}}
