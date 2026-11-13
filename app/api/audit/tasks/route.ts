import{and,count,desc,eq,gte,like,lte,ne,or}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfAuditTasks,wfObservations}from"../../../../db/schema";
import{hasWriteRole,requireAuth,seesAllWork}from"../../../../lib/auth";
import{emailsForEmployees,emailsForRoles,moduleForKind,notify}from"../../../../lib/notify";
import{actorOf,bad,oops,page,search,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{pendingDues,recurs,todayIso}from"../../../../lib/recurrence";
import{AUDITOR_ROLES}from"../../../../lib/auditors";
import{indiaToday,nextObservationRef,remarksOf}from"../../../../lib/pre-audit";

/* Tasks, tokens and training were screens of their own. They are raised from the
   meeting form now, which is why the kind says which of them it is. */
const KINDS=["Pre-Audit","Post-Audit","Special Audit","Meeting","Task","Token","Training"];
const STATUS=["Available","Accepted","In Progress","Observation Submitted","Response Received","Completed"];
const now=()=>new Date().toISOString();
const shape=(t:Row)=>({id:str(t.id),ref:str(t.ref),title:str(t.title),kind:str(t.kind,"Pre-Audit"),
  companyId:str(t.companyId),department:str(t.department),status:str(t.status,"Available"),
  assignedTo:str(t.assignedTo),due:str(t.due),plannedStart:str(t.plannedStart),
  plannedEnd:str(t.plannedEnd),notes:str(t.notes),dataProvider:str(t.dataProvider),
  attendees:str(t.attendees),raisedByEmail:str(t.raisedByEmail),frequency:str(t.frequency),
  /* Every write goes through here, so a recurrence left out of this is silently dropped on
     insert and the form reports a success that saved nothing. */
  recurDay:str(t.recurDay),recurUntil:str(t.recurUntil),seriesId:str(t.seriesId),
  createdAt:str(t.createdAt)||now(),acceptedAt:str(t.acceptedAt),completedAt:str(t.completedAt),extra:str(t.extra),
  category:str(t.category),entity:str(t.entity),dueRule:str(t.dueRule),catalogueId:str(t.catalogueId),
  remarks:str(t.remarks),assignedEmail:str(t.assignedEmail),workDescription:str(t.workDescription),
  observations:str(t.observations),completedOn:str(t.completedOn),project:str(t.project),
  reviewedBy:str(t.reviewedBy),reviewedAt:str(t.reviewedAt),rejectReason:str(t.rejectReason),history:str(t.history)});

/* Who reviews pre-audit reports: accepts or rejects them, and sees every auditor's. */
const HEAD_ROLES=["Audit Head","Administrator"];
const isHead=(roles:string[]=[])=>roles.some(r=>HEAD_ROLES.includes(r));
/* Who reports pre-audit work: the auditors, and the Audit Head, who audits too. */
const isAuditor=(roles:string[]=[])=>roles.some(r=>AUDITOR_ROLES.includes(r));
const owns=(t:Row,actor?:{email:string}|null)=>!!actor?.email&&str(t.assignedEmail).toLowerCase()===actor.email.toLowerCase();

/* A pre-audit report's fields, as the auditor fills them in. Observations and reference
   files are optional; the rest is required. */
type Report={project:string;entity:string;title:string;department:string;workDescription:string;observations:string};
function reportFrom(body:Row):Report|string{
  const r={project:str(body.project).trim(),entity:str(body.entity).trim(),title:str(body.title).trim(),
    department:str(body.department).trim(),workDescription:str(body.workDescription).trim(),observations:str(body.observations).trim()};
  const missing=([["project","Area/Process"],["entity","Vertical"],["title","Task title"],["department","Department"],
    ["workDescription","Description"]] as const).filter(([k])=>!r[k]).map(([,l])=>l);
  if(missing.length)return`${missing.join(", ")} must be filled in.`;
  if(r.title.length>300||r.project.length>300)return"Keep the area/process and the task title under 300 characters.";
  if(r.workDescription.length>5000||r.observations.length>5000)return"Keep the description and the observations under 5,000 characters each.";
  return r}
type Step={at:string;by:string;action:string;note?:string};
const historyOf=(v:unknown):Step[]=>{try{const r=JSON.parse(str(v)||"[]");return Array.isArray(r)?r:[]}catch{return[]}};

/* Pre-audit tasks are numbered Pre-Aud-Task-001, -002, ... as their ref, the number people
   read; the id behind it stays a key nothing shows. Each task, and each occurrence of a
   repeating one, takes the next number. */
const PRE_AUDIT_PREFIX="Pre-Aud-Task-";
const preAuditNumber=(n:number)=>`${PRE_AUDIT_PREFIX}${String(n).padStart(3,"0")}`;
const highestNumber=(refs:string[])=>refs.reduce((top,ref)=>{
  if(!ref.startsWith(PRE_AUDIT_PREFIX))return top;
  const n=Number(ref.slice(PRE_AUDIT_PREFIX.length));
  return Number.isFinite(n)&&n>top?n:top},0);
async function nextPreAuditNumber(db:Awaited<ReturnType<typeof getDb>>){
  const rows=await db.select({ref:wfAuditTasks.ref}).from(wfAuditTasks).where(eq(wfAuditTasks.kind,"Pre-Audit"));
  return highestNumber(rows.map(r=>str(r.ref)))+1}

/* Creates the occurrences a recurring series is missing.

   Only the latest occurrence of each series is consulted, so a series that has run for a
   year does not have to be read in full to work out what comes next.

   The id of a generated row is built from its series and its due date rather than from a
   timestamp, so two people opening the register at the same moment produce the same id and
   the second insert is refused as a duplicate instead of creating the meeting twice. That
   is also why the inserts are attempted one at a time: one clash must not discard the
   others.

   Nothing here touches a task that does not recur. */
async function catchUpSeries(db:Awaited<ReturnType<typeof getDb>>){
  /* Named for the day, not "now": the module already has a now() that returns a full
     timestamp, and shadowing it here made createdAt:now() a call on a string. */
  const today=todayIso();
  const all=await db.select().from(wfAuditTasks);
  const latest=new Map<string,typeof all[number]>();
  for(const row of all){
    const series=str(row.seriesId)||str(row.id);
    if(!recurs(row.frequency))continue;
    const held=latest.get(series);
    if(!held||str(row.due)>str(held.due))latest.set(series,row)}
  let preAuditTop=highestNumber(all.filter(r=>r.kind==="Pre-Audit").map(r=>str(r.ref)));
  for(const[series,row]of latest){
    const dues=pendingDues({id:str(row.id),seriesId:series,frequency:str(row.frequency),
      recurDay:str(row.recurDay),recurUntil:str(row.recurUntil),due:str(row.due)},today);
    for(const due of dues){
      const id=`AT-${series}-${due}`;
      const numbered=row.kind==="Pre-Audit";
      if(numbered)preAuditTop++;
      try{
        await db.insert(wfAuditTasks).values(shape({...row,id,seriesId:series,due,
          ref:numbered?preAuditNumber(preAuditTop):`${str(row.ref)}-${due.replace(/-/g,"")}`,status:"Available",
          /* Every occurrence starts in the open pool, for any auditor to take. Remarks and
             the completion report belong to the occurrence they were written on. */
          assignedTo:"",assignedEmail:"",remarks:"",workDescription:"",observations:"",completedOn:"",
          acceptedAt:"",completedAt:"",createdAt:now()} as unknown as Row));
      /* createdAt uses the module's now(), which is the full timestamp every other row
         carries; `today` above is the plain day the recurrence arithmetic works in. */
      }catch{/* already generated by somebody else opening the register - its number is theirs */
        if(numbered)preAuditTop--}}}}

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const{limit,offset}=page(url);
    const db=await getDb();
    const kind=url.searchParams.get("kind");
    const status=url.searchParams.get("status");
    const companyId=url.searchParams.get("companyId");
    const assignedTo=url.searchParams.get("assignedTo");
    const entity=url.searchParams.get("entity");
    /* Completed between these days (inclusive), by the day the auditor filed it. */
    const from=url.searchParams.get("from"),to=url.searchParams.get("to");
    const q=search(url.searchParams.get("q"));
    /* An auditor sees only the pre-audit work they reported. The Audit Head,
       administrators and management see everyone's. */
    const own=seesAllWork(actor?.roles)?undefined
      :or(ne(wfAuditTasks.kind,"Pre-Audit"),eq(wfAuditTasks.assignedEmail,(actor?.email||"").toLowerCase()));
    const project=url.searchParams.get("project");
    const department=url.searchParams.get("department");
    const filters=[own,
      kind?eq(wfAuditTasks.kind,kind):undefined,
      status?eq(wfAuditTasks.status,status):undefined,
      companyId?eq(wfAuditTasks.companyId,companyId):undefined,
      assignedTo?eq(wfAuditTasks.assignedTo,assignedTo):undefined,
      entity?eq(wfAuditTasks.entity,entity):undefined,
      project?eq(wfAuditTasks.project,project):undefined,
      department?eq(wfAuditTasks.department,department):undefined,
      from?gte(wfAuditTasks.completedOn,from):undefined,
      to?lte(wfAuditTasks.completedOn,to):undefined,
      q?or(like(wfAuditTasks.title,q),like(wfAuditTasks.ref,q),like(wfAuditTasks.entity,q),like(wfAuditTasks.project,q),
        like(wfAuditTasks.assignedTo,q),like(wfAuditTasks.workDescription,q)):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    /* Recurring series catch up here, because nothing else can. There is no scheduler on
       this host, so "every Monday" cannot fire on Monday morning by itself; the occurrences
       that have come due are created when somebody opens the register, along with the next
       one so the queue shows what is coming rather than only what has passed.

       Done before the page is read, so what is generated appears in the same response
       rather than only on a second visit. */
    await catchUpSeries(db);
    const [rows,[total]]=await Promise.all([
      db.select().from(wfAuditTasks).where(where)
        /* Completed work reads newest first by when it was finished; the rest by due date. */
        /* Pre-audit reports read newest first by when they were reported; the rest by due date. */
        .orderBy(...(kind==="Pre-Audit"?[desc(wfAuditTasks.completedAt)]:[desc(wfAuditTasks.due)])).limit(limit).offset(offset),
      db.select({n:count()}).from(wfAuditTasks).where(where)]);
    return Response.json({tasks:rows,total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

/* Anyone signed in may raise a meeting, a task, a token or a training request - the
   training and token desks these replaced let a Requestor do that, and folding them in
   must not take it away. Audit programmes stay with the roles that can change data. */
const MEETING_KINDS=["Meeting","Task","Token","Training"];

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    if(str(body.kind,"Pre-Audit")==="Pre-Audit")return await reportWork(req,body,actor);
    if(!str(body.title))return bad("title is required");
    if(KINDS.indexOf(str(body.kind,"Pre-Audit"))<0)return bad(`kind must be one of ${KINDS.join(", ")}`);
    if(!MEETING_KINDS.includes(str(body.kind,"Pre-Audit"))&&!hasWriteRole(actor?.roles))
      return bad("Your role cannot create audit programmes.",403);
    body.status="Available";
    const id=str(body.id)||`AT-${Date.now().toString(36)}`;
    /* The first occurrence's own id becomes the series id, so a recurring task can be
       followed from the moment it is created rather than once a second one exists. A task
       that does not recur carries no series id at all. */
    const row=shape({...body,id,raisedByEmail:actor?.email||"",
      seriesId:recurs(str(body.frequency))?str(body.seriesId)||id:"",
      ref:str(body.kind,"Pre-Audit")==="Pre-Audit"?preAuditNumber(await nextPreAuditNumber(await getDb()))
        :str(body.ref)||`AUD-${Date.now().toString(36).toUpperCase()}`});
    await writeWithAudit([(await getDb()).insert(wfAuditTasks).values(row)],
      actorOf(req,body),"audit-task",id,"Audit task created",`${row.ref} · ${row.title}`);
    /* The people invited hear about it. An audit programme with nobody named goes to
       the auditors whose queue it lands in. */
    const attendeeIds=(row.attendees||"").split(",").map(x=>x.trim()).filter(Boolean);
    /* Only the audit-programme case is role-derived. A named attendee list is people, and
       there is no group address that means "whoever was invited". */
    const byRole=!attendeeIds.length&&!MEETING_KINDS.includes(row.kind);
    const invited=attendeeIds.length?await emailsForEmployees(attendeeIds)
      :MEETING_KINDS.includes(row.kind)?[]:await emailsForRoles(["Auditor","Audit Head"]);
    await notify(invited,{
      title:attendeeIds.length
        ?`${actor?.name||"Someone"} added you to a ${row.kind.toLowerCase()}: ${row.title}`
        :`New ${row.kind} task: ${row.title}`,
      body:[row.due?`Due ${row.due}`:"",row.notes].filter(Boolean).join(" · "),
      module:moduleForKind(row.kind),recordId:row.id},actor?.email,
      byRole?["Auditor","Audit Head"]:undefined);
    return Response.json({task:row},{status:201});
  }catch(e){return oops(e)}}

/* Accepting and completing are server-side transitions, so the assignee and the
   timestamps cannot drift from the status. Two auditors racing for the same task:
   the second gets a clear 409 rather than silently stealing it. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const [existing]=await db.select().from(wfAuditTasks).where(eq(wfAuditTasks.id,id)).limit(1);
    if(!existing)return bad("Not found",404);
    const action=str(body.action);
    if(existing.kind==="Pre-Audit")return await preAuditAction(req,body,existing as unknown as Row,actor);
    /* The people invited to a meeting, task, token or training may accept or complete
       it, whatever their role - an invitation that the invitee cannot answer is not one.
       Anything else still needs a role that changes data. */
    if(!hasWriteRole(actor?.roles)){
      const invitee=MEETING_KINDS.includes(existing.kind)&&!!actor?.employeeId
        &&(existing.attendees||"").split(",").map(x=>x.trim()).includes(actor.employeeId);
      if(!invitee||(action!=="accept"&&action!=="complete"))
        return bad("Your role cannot change this data.",403);
    }
    /* Remarks are only ever added to, here - never taken from the request as a whole. */
    let row=shape({...existing,...body,id,ref:existing.ref,remarks:existing.remarks});
    if(action==="remark"){
      const text=str(body.remark).trim();
      if(!text)return bad("Write the remark first.",422);
      if(text.length>2000)return bad("Keep a remark under 2,000 characters.",422);
      const list=[...remarksOf(existing.remarks),{by:actor?.name||actor?.email||"",at:now(),text}];
      await writeWithAudit([db.update(wfAuditTasks).set({remarks:JSON.stringify(list)}).where(eq(wfAuditTasks.id,id))],
        actorOf(req,body),"audit-task",id,"Remark added",`${existing.ref} · ${text.slice(0,200)}`);
      return Response.json({task:{...shape(existing),remarks:JSON.stringify(list)}});
    }
    if(action==="accept"){
      if(existing.status!=="Available")
        return bad(`Already taken by ${existing.assignedTo||"somebody else"}`,409);
      row={...row,status:"Accepted",assignedTo:actor?.name||row.assignedTo,acceptedAt:now()};
    }
    if(action==="complete")row={...row,status:"Completed",completedAt:now()};
    if(STATUS.indexOf(row.status)<0)return bad(`status must be one of ${STATUS.join(", ")}`);
    await writeWithAudit([db.update(wfAuditTasks).set(row).where(eq(wfAuditTasks.id,id))],
      actorOf(req,body),"audit-task",id,
      action==="accept"?"Audit task accepted":action==="complete"?"Audit task completed":"Audit task updated",
      `${row.ref} · ${row.status}`);
    /* Accepting tells the person who raised it; completing tells them and everyone
       who was invited. */
    if(action==="accept"||action==="complete"){
      const attendeeIds=(existing.attendees||"").split(",").map(x=>x.trim()).filter(Boolean);
      const others=action==="complete"?await emailsForEmployees(attendeeIds):[];
      await notify([existing.raisedByEmail||"",...others],{
        title:action==="accept"?`${actor?.name||"Someone"} accepted ${row.title}`:`${row.title} is completed`,
        body:`${row.kind}${action==="complete"&&actor?.name?` · closed by ${actor.name}`:""}`,
        module:moduleForKind(row.kind),recordId:row.id},actor?.email);
    }
    return Response.json({task:row});
  }catch(e){return oops(e)}}

/* What the auditor found goes to the observation register too, against the report. A
   resubmitted report updates the observation it raised rather than raising a second one. */
async function syncObservation(db:Awaited<ReturnType<typeof getDb>>,task:Row,r:Report,by:string,email:string,day:string){
  if(!r.observations)return{statements:[] as unknown[],ref:""};
  const id=str(task.id);
  const[held]=await db.select({id:wfObservations.id,ref:wfObservations.ref}).from(wfObservations)
    .where(and(eq(wfObservations.taskId,id),eq(wfObservations.raisedByEmail,email))).limit(1);
  const fields={title:r.observations.length>90?`${r.observations.slice(0,87)}…`:r.observations,detail:r.observations,
    entity:r.entity,area:r.project,dateIdentified:day};
  if(held)return{statements:[db.update(wfObservations).set(fields).where(eq(wfObservations.id,held.id))] as unknown[],ref:held.ref};
  const ref=await nextObservationRef(db);
  return{ref,statements:[db.insert(wfObservations).values({...fields,id:`OB-${Date.now().toString(36)}`,ref,deptId:"d-group",
    taskId:id,risk:"",status:"Open",raisedBy:by,raisedByEmail:email,raisedAt:now()})] as unknown[]}}

/* An auditor reports work they have finished. The auditor is whoever is signed in and the
   date is today - neither comes from the request. It goes to the Audit Head to accept or
   reject; the Audit Head's own work needs nobody's review and is accepted as reported. */
async function reportWork(req:Request,body:Row,actor:{email:string;name:string;roles:string[]}|null|undefined){
  if(!actor||!isAuditor(actor.roles))return bad("Only auditors report pre-audit work.",403);
  const r=reportFrom(body);
  if(typeof r==="string")return bad(r,422);
  const db=await getDb();
  const me=actor.name||actor.email,email=actor.email.toLowerCase(),at=now(),day=indiaToday();
  const self=actor.roles.includes("Audit Head");
  const id=`AT-${Date.now().toString(36)}`;
  const row=shape({...r,id,kind:"Pre-Audit",ref:preAuditNumber(await nextPreAuditNumber(db)),
    status:self?"Accepted":"Reported",assignedTo:me,assignedEmail:email,raisedByEmail:email,
    completedAt:at,completedOn:day,createdAt:at,
    reviewedBy:self?me:"",reviewedAt:self?at:"",
    history:JSON.stringify([{at,by:me,action:"Reported"},...(self?[{at,by:me,action:"Accepted",note:"Audit Head's own work"}]:[])])});
  const obs=await syncObservation(db,row as unknown as Row,r,me,email,day);
  await writeWithAudit([db.insert(wfAuditTasks).values(row),...obs.statements],actorOf(req,body),"audit-task",id,
    "Pre-audit work reported",`${row.ref} · ${row.title}${obs.ref?` · ${obs.ref}`:""}`);
  if(!self)await notify(await emailsForRoles(["Audit Head"]),{title:`${me} reported ${row.ref}: ${row.title}`,
    body:[r.project,r.entity,"waiting for your review"].filter(Boolean).join(" · "),
    module:moduleForKind("Pre-Audit"),recordId:id},actor.email);
  return Response.json({task:row},{status:201})}

/* A reported pre-audit task moves only by these actions, each checked here:
   accept   - the Audit Head accepts it; the task is closed
   reject   - the Audit Head rejects it, with the reason; the record stays
   resubmit - the auditor corrects a rejected report and sends it again
   remark   - the Audit Head adds a remark */
async function preAuditAction(req:Request,body:Row,existing:Row,
  actor:{email:string;name:string;roles:string[]}|null|undefined){
  const db=await getDb();
  const id=str(existing.id),ref=str(existing.ref)||id,action=str(body.action);
  const me=actor?.name||actor?.email||"",at=now();
  const steps=historyOf(existing.history);
  const after=async()=>{const[t]=await db.select().from(wfAuditTasks).where(eq(wfAuditTasks.id,id)).limit(1);
    return Response.json({task:t})};
  if(action==="accept"||action==="reject"){
    if(!isHead(actor?.roles))return bad("Only the Audit Head accepts or rejects pre-audit work.",403);
    if(existing.status!=="Reported")return bad(`${ref} is not waiting for review - it is ${str(existing.status).toLowerCase()}.`,409);
    const reason=str(body.reason).trim();
    if(action==="reject"&&!reason)return bad("Write the reason for rejecting it.",422);
    if(reason.length>2000)return bad("Keep the reason under 2,000 characters.",422);
    const accepted=action==="accept";
    await writeWithAudit([db.update(wfAuditTasks).set({status:accepted?"Accepted":"Rejected",reviewedBy:me,reviewedAt:at,
      rejectReason:accepted?"":reason,
      history:JSON.stringify([...steps,{at,by:me,action:accepted?"Accepted":"Rejected",...(reason?{note:reason}:{})}])})
      .where(eq(wfAuditTasks.id,id))],actorOf(req,body),"audit-task",id,
      accepted?"Pre-audit work accepted":"Pre-audit work rejected",`${ref}${reason?` · ${reason.slice(0,200)}`:""}`);
    /* The auditor hears the outcome. */
    await notify([str(existing.assignedEmail)],{
      title:accepted?`${me} accepted ${ref}: ${str(existing.title)}`:`${me} rejected ${ref}: ${str(existing.title)}`,
      body:accepted?"The task is closed.":`Reason: ${reason}`,
      module:moduleForKind("Pre-Audit"),recordId:id},actor?.email);
    return await after()}
  if(action==="resubmit"){
    if(!owns(existing,actor))return bad("Only the auditor who reported this can change it.",403);
    if(existing.status!=="Rejected")return bad(`${ref} can be changed only after it is rejected.`,409);
    const r=reportFrom(body);
    if(typeof r==="string")return bad(r,422);
    const day=indiaToday();
    const obs=await syncObservation(db,existing,r,me,(actor?.email||"").toLowerCase(),day);
    await writeWithAudit([db.update(wfAuditTasks).set({...r,status:"Reported",completedAt:at,completedOn:day,
      history:JSON.stringify([...steps,{at,by:me,action:"Resubmitted"}])}).where(eq(wfAuditTasks.id,id)),...obs.statements],
      actorOf(req,body),"audit-task",id,"Pre-audit work resubmitted",ref);
    await notify(await emailsForRoles(["Audit Head"]),{title:`${me} resubmitted ${ref}: ${r.title}`,
      body:[r.project,r.entity,"waiting for your review"].filter(Boolean).join(" · "),
      module:moduleForKind("Pre-Audit"),recordId:id},actor?.email);
    return await after()}
  if(action==="remark"){
    if(!isHead(actor?.roles))return bad("Only the Audit Head writes remarks on pre-audit work.",403);
    const text=str(body.remark).trim();
    if(!text)return bad("Write the remark first.",422);
    if(text.length>2000)return bad("Keep a remark under 2,000 characters.",422);
    const list=[...remarksOf(existing.remarks),{by:me,at,text}];
    await writeWithAudit([db.update(wfAuditTasks).set({remarks:JSON.stringify(list)}).where(eq(wfAuditTasks.id,id))],
      actorOf(req,body),"audit-task",id,"Remark added",`${ref} · ${text.slice(0,200)}`);
    return await after()}
  return bad("Pre-audit work is accepted, rejected, resubmitted or remarked on - nothing else.",400)}

export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!id)return bad("id is required");
    /* A pre-audit task is the Audit Head's to remove. Observations raised on it stay in
       the register: they are findings, whatever happens to the task. */
    const[task]=await (await getDb()).select({kind:wfAuditTasks.kind}).from(wfAuditTasks).where(eq(wfAuditTasks.id,id)).limit(1);
    if(task?.kind==="Pre-Audit"&&!(actor?.roles||[]).some(r=>HEAD_ROLES.includes(r)))
      return bad("Only the Audit Head deletes pre-audit tasks.",403);
    await writeWithAudit([(await getDb()).delete(wfAuditTasks).where(eq(wfAuditTasks.id,id))],
      actorOf(req),"audit-task",id,"Audit task deleted",id);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}

/* Bulk import, chunked for D1's 100-parameter limit across 16 columns. */
export async function PUT(req:Request){
  try{
    const{response}=await requireAuth(req,"write");
    if(response)return response;
    const body=await req.json() as Row;
    const list=Array.isArray(body.rows)?body.rows as Row[]:[];
    if(!list.length)return bad("No rows supplied");
    if(list.length>300)return bad("At most 300 rows per import",413);
    const good:Record<string,unknown>[]=[];
    const errors:{row:number;reason:string}[]=[];
    /* Imported pre-audit tasks take the next numbers too. */
    let preAuditTop=await nextPreAuditNumber(await getDb())-1;
    list.forEach((r,i)=>{
      const line=Number(r.line)||i+1;
      if(!str(r.title))return errors.push({row:line,reason:"title is required"});
      const kind=str(r.kind,"Pre-Audit");
      if(KINDS.indexOf(kind)<0)return errors.push({row:line,reason:`kind "${kind}" is not valid`});
      if(kind==="Pre-Audit")return errors.push({row:line,reason:"pre-audit work is reported by the auditor, not imported"});
      good.push(shape({...r,kind,id:`AT-imp-${Date.now().toString(36)}-${i}`,
        ref:kind==="Pre-Audit"?preAuditNumber(++preAuditTop):str(r.ref)||`AUD-${Date.now().toString(36).toUpperCase()}-${i}`}));
    });
    if(good.length){
      const db=await getDb();
      const statements=[];
      for(let i=0;i<good.length;i+=6)
        statements.push(db.insert(wfAuditTasks).values(good.slice(i,i+6) as never));
      await writeWithAudit(statements,actorOf(req,body),"audit-task","import","Audit tasks imported",
        `${good.length} imported, ${errors.length} rejected`);
    }
    return Response.json({imported:good.length,rejected:errors.length,errors:errors.slice(0,100)},
      {status:good.length?201:422});
  }catch(e){return oops(e)}}
