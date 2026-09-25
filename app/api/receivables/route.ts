import{and,count,desc,eq,like,or,sql}from"drizzle-orm";
import{getDb}from"../../../db";
import{wfAttachments,wfPlanning,wfReceivables,wfUsers}from"../../../db/schema";
import{deleteFile}from"../../../lib/storage";
import{requireAuth}from"../../../lib/auth";
import{emailsForRoles,notify}from"../../../lib/notify";
import{ACCOUNTS_ROLES,AUDIT_ROLES,JOB_DEPARTMENTS,REQUIRED_TO_LEAVE,RETURNABLE_TO,STAGES,
  mayAct,stageIndex}from"../../../lib/receivable-stages";
import type{Stage}from"../../../lib/receivable-stages";
import{actorOf,bad,num,oops,page,search,str,writeWithAudit}from"../../../lib/workforce-api";
import type{Row}from"../../../lib/workforce-api";

/* Accounts Receivable.

   Every stage change happens here rather than in the screen. The screen hides the
   buttons a role may not press, but hiding a button is not a rule: the same request
   can be sent by hand, so the role, the stage it is moving from and the fields that
   stage requires are all checked again on this side. */

const now=()=>new Date().toISOString();
const today=()=>now().slice(0,10);

const shape=(r:Row)=>({id:str(r.id),ref:str(r.ref),stage:str(r.stage,"Job Notification"),
  customer:str(r.customer),companyId:str(r.companyId),department:str(r.department),
  description:str(r.description),notifiedOn:str(r.notifiedOn)||today(),
  crmJobNo:str(r.crmJobNo),crmOwner:str(r.crmOwner),crmAt:str(r.crmAt),
  soNo:str(r.soNo),amount:num(r.amount),currency:str(r.currency,"AED"),soAt:str(r.soAt),
  submittedAt:str(r.submittedAt),verifiedBy:str(r.verifiedBy),verifiedAt:str(r.verifiedAt),
  remarks:str(r.remarks),returnNote:str(r.returnNote),returnedAt:str(r.returnedAt),
  raisedByEmail:str(r.raisedByEmail),createdAt:str(r.createdAt)||now(),updatedAt:str(r.updatedAt)||now(),
  jobName:str(r.jobName),projectName:str(r.projectName),jobCode:str(r.jobCode),jobLocation:str(r.jobLocation),
  pmName:str(r.pmName),pmEmail:str(r.pmEmail),startDate:str(r.startDate),endDate:str(r.endDate),poNumber:str(r.poNumber),
  contractValue:num(r.contractValue),contractCurrency:str(r.contractCurrency,"AED")||"AED",jobType:str(r.jobType),
  scope:str(r.scope),boqAvailable:str(r.boqAvailable),managementApproval:str(r.managementApproval),
  priority:str(r.priority,"Normal")||"Normal",remarksNote:str(r.remarksNote)});

/* The job notification number and job code, JN-2026-0001 and JC-2026-0001: the next in
   the year after the highest already issued. The server's to give, like payment request
   numbers, so two people submitting together cannot be handed the same one. */
async function nextNumbers(){
  const db=await getDb();
  const year=new Date().getFullYear();
  const rows=await db.select({ref:wfReceivables.ref,code:wfReceivables.jobCode}).from(wfReceivables);
  const top=(prefix:string,vals:string[])=>vals.reduce((n,v)=>{
    const m=new RegExp(`^${prefix}-${year}-(\\d+)$`).exec(v||"");return m?Math.max(n,Number(m[1])):n},0);
  const pad=(n:number)=>String(n).padStart(4,"0");
  return{jobNo:`JN-${year}-${pad(top("JN",rows.map(r=>r.ref))+1)}`,
    jobCode:`JC-${year}-${pad(top("JC",rows.map(r=>r.code))+1)}`}}

/* Mandatory on the job notification, as the field specification sets them out. */
const REQUIRED_ON_RAISE:Record<string,string>={companyId:"Company",department:"Department",
  customer:"Client / customer",jobName:"Job name",pmEmail:"Project manager / responsible person",
  startDate:"Job start date",jobType:"Job type",scope:"Scope of work",
  boqAvailable:"BOQ / budget available",managementApproval:"Management approval",priority:"Priority",
  notifiedOn:"Notification date"};

export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    // The numbers the next notification will get, shown greyed on the form.
    if(url.searchParams.get("next"))return Response.json(await nextNumbers());
    const{limit,offset}=page(url);
    const db=await getDb();
    const stage=url.searchParams.get("stage");
    const companyId=url.searchParams.get("companyId");
    const q=search(url.searchParams.get("q"));
    const filters=[
      stage?eq(wfReceivables.stage,stage):undefined,
      companyId?eq(wfReceivables.companyId,companyId):undefined,
      q?or(like(wfReceivables.ref,q),like(wfReceivables.customer,q),like(wfReceivables.jobName,q),
        like(wfReceivables.jobCode,q),like(wfReceivables.crmJobNo,q),like(wfReceivables.soNo,q)):undefined].filter(Boolean);
    const where=filters.length?and(...filters):undefined;
    const[rows,[total]]=await Promise.all([
      db.select().from(wfReceivables).where(where)
        .orderBy(desc(wfReceivables.createdAt)).limit(limit).offset(offset),
      db.select({n:count()}).from(wfReceivables).where(where)]);
    return Response.json({receivables:rows,total:total?.n??0,limit,offset});
  }catch(e){return oops(e)}}

/* A job notification: the first anyone here hears that there is work to bill for.
   It always starts at stage one, whatever the request body says - a row that arrives
   claiming to be verified would skip every check that verification exists for. */
export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))
      return bad("Only accounts may raise a job notification.",403);
    const body=await req.json() as Row;
    const missing=Object.entries(REQUIRED_ON_RAISE).filter(([k])=>!str(body[k]).trim()).map(([,l])=>l);
    if(missing.length)return bad(`${missing.join(", ")} ${missing.length===1?"is":"are"} required.`,422);
    if(!["Yes","No"].includes(str(body.boqAvailable)))return bad("Say whether a BOQ / budget is available.",422);
    if(!(JOB_DEPARTMENTS as readonly string[]).includes(str(body.department)))
      return bad(`Department must be one of ${JOB_DEPARTMENTS.join(", ")}.`,422);
    if(str(body.startDate)&&str(body.endDate)&&str(body.endDate)<str(body.startDate))
      return bad("The expected completion date cannot be before the job start date.",422);
    // Optional; when given it has to be an amount.
    if(str(body.contractValue).trim()!==""&&!(Number(body.contractValue)>=0))
      return bad("Contract value / budget must be an amount.",422);
    const db=await getDb();
    /* The project manager, if named, must have a login: they are emailed and act in the
       portal. Their name is taken from the login rather than from the form. */
    let pmName="",pmEmail="";
    if(str(body.pmEmail).trim()){
      const[u]=await db.select({name:wfUsers.name,email:wfUsers.email,active:wfUsers.active}).from(wfUsers)
        .where(sql`lower(${wfUsers.email}) = ${str(body.pmEmail).trim().toLowerCase()}`);
      if(!u||!u.active)return bad("Choose the project manager from the list of people with a login.",422);
      pmName=u.name||u.email;pmEmail=u.email;
    }
    const id=`AR-${Date.now().toString(36)}`;
    let row;
    for(let attempt=0;attempt<5;attempt++){
      const{jobNo,jobCode}=await nextNumbers();
      row=shape({...body,id,ref:jobNo,jobCode,stage:"Job Notification",crmJobNo:"",soNo:"",amount:0,
        description:str(body.jobName).trim(),customer:str(body.customer).trim(),pmName,pmEmail,
        verifiedBy:"",verifiedAt:"",remarks:"",returnNote:"",returnedAt:"",raisedByEmail:actor?.email||""});
      // Another notification may have taken the number between reading and writing.
      const[taken]=await db.select({id:wfReceivables.id}).from(wfReceivables)
        .where(or(eq(wfReceivables.ref,row.ref),eq(wfReceivables.jobCode,row.jobCode)));
      if(!taken)break;
      row=undefined;
    }
    if(!row)return bad("Could not issue a notification number. Please try again.",503);
    await writeWithAudit([db.insert(wfReceivables).values(row)],
      actorOf(req,body),"receivable",id,"Job notification raised",`${row.ref} · ${row.jobCode} · ${row.customer}`);
    if(pmEmail)await notify([pmEmail],{title:`${row.ref}: you are the project manager for ${row.jobName}`,
      body:`${row.customer} · ${row.jobType}`,reference:row.ref,
      detail:[{label:"Job",value:`${row.jobName} (${row.jobCode})`},{label:"Client",value:row.customer},
        {label:"Location",value:row.jobLocation},{label:"Start",value:row.startDate},{label:"Completion",value:row.endDate},
        {label:"Scope",value:row.scope}],
      action:"No action is needed yet. You will be asked to plan the job once it is verified.",
      module:"accountsreceived",recordId:id},actor?.email);
    return Response.json({receivable:row},{status:201});
  }catch(e){return oops(e)}}

/* Moving an entry along, and sending it back.

   `action` is "advance" or "return". Advancing steps exactly one stage forward from
   wherever the row actually sits, so two people pressing the button at once cannot
   push it two stages: the second write finds the row already moved and is refused. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const[row]=await db.select().from(wfReceivables).where(eq(wfReceivables.id,id));
    if(!row)return bad("That entry no longer exists",404);

    const from=row.stage as Stage;
    const at=stageIndex(from);
    const action=str(body.action,"advance");
    if(!mayAct(from,actor?.roles))
      return bad(`Your role cannot act on an entry at ${from}.`,403);

    if(action==="return"){
      if(!actor?.roles.some(r=>AUDIT_ROLES.includes(r)))
        return bad("Only audit may send an entry back.",403);
      const to=str(body.stage) as Stage;
      if(!RETURNABLE_TO.includes(to))
        return bad(`An entry may be sent back to ${RETURNABLE_TO.join(", ")}.`);
      const note=str(body.note).trim();
      // The reason is the whole point of the return: without it the person picking
      // it up learns only that somebody was unhappy.
      if(!note)return bad("Say what needs correcting before sending it back.");
      const patch={stage:to,returnNote:note,returnedAt:now(),submittedAt:"",updatedAt:now()};
      await writeWithAudit([db.update(wfReceivables).set(patch).where(eq(wfReceivables.id,id))],
        actorOf(req,body),"receivable",id,`Returned to ${to}`,`${row.ref} · ${note}`);
      await notify(row.raisedByEmail?[row.raisedByEmail]:await emailsForRoles(ACCOUNTS_ROLES),
        {title:`${row.ref} sent back to ${to}`,body:note,
          module:"accountsreceived",recordId:id},actor?.email);
      return Response.json({receivable:{...row,...patch}});
    }

    if(action!=="advance")return bad("action must be advance or return");
    const next=STAGES[at+1];
    if(!next)return bad("This entry is already verified.");

    /* The fields this stage owes the next one. Read from the body where the move
       supplies them (the CRM number is typed as the job is recorded), falling back
       to what the row already holds. */
    const filled:Row={...row,...body};
    const missing=REQUIRED_TO_LEAVE[from].filter(f=>{
      const v=filled[f];
      return f==="amount"?!(num(v)>0):!str(v).trim()});
    if(missing.length)return bad(`${missing.join(", ")} must be filled in first.`);

    const patch:Row={stage:next,updatedAt:now(),returnNote:"",returnedAt:""};
    if(from==="Job Notification"){patch.crmJobNo=str(body.crmJobNo,row.crmJobNo);
      patch.crmOwner=str(body.crmOwner,row.crmOwner)||actor?.name||"";patch.crmAt=now()}
    if(from==="CRM JOB Creation"){patch.soNo=str(body.soNo,row.soNo);
      patch.amount=num(filled.amount);patch.currency=str(body.currency,row.currency||"AED");patch.soAt=now()}
    if(from==="Sales Order")patch.submittedAt=now();
    if(from==="Audit Verification"){patch.verifiedBy=actor?.name||actor?.email||"";
      patch.verifiedAt=now();patch.remarks=str(body.remarks,row.remarks)}

    /* Guarded by the stage we read: if somebody else moved the row in between, this
       matches nothing and the caller is told to look again rather than overwriting. */
    const res=await db.update(wfReceivables).set(patch)
      .where(and(eq(wfReceivables.id,id),eq(wfReceivables.stage,from)));
    if((res as{meta?:{changes?:number}})?.meta?.changes===0)
      return bad("Somebody else moved this entry. Reopen it to see where it is now.",409);
    await writeWithAudit([],actorOf(req,body),"receivable",id,`${from} → ${next}`,
      `${row.ref} · ${row.customer}`);

    // Audit hears when something reaches their desk; accounts hears the verdict.
    if(next==="Audit Verification")
      await notify(await emailsForRoles(["Auditor","Audit Head"]),
        {title:`${row.ref} is ready for audit verification`,
          body:[row.customer,row.crmJobNo,str(patch.soNo)||row.soNo].filter(Boolean).join(" · "),
          module:"accountsreceived",recordId:id},actor?.email,["Auditor","Audit Head"]);
    if(next==="Verified")
      await notify(row.raisedByEmail?[row.raisedByEmail]:await emailsForRoles(ACCOUNTS_ROLES),
        {title:`${row.ref} verified by audit`,body:str(patch.remarks),
          module:"accountsreceived",recordId:id},actor?.email);

    return Response.json({receivable:{...row,...patch}});
  }catch(e){return oops(e)}}

/* Deleting a job notification. An administrator's action alone, as for payment requests:
   the flow otherwise only moves forward, and this is for an entry raised in error.

   Refused once the job has a plan in Planning & Procurement, because the plan - and the
   completion cycles and collections after it - would be left pointing at a job that no
   longer exists. Its documents go with it rather than being orphaned in storage, and the
   deletion is written to the log. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"admin");
    if(response)return response;
    if(!(actor?.roles||[]).includes("Administrator"))
      return bad("Only an administrator can delete a job notification.",403);
    const id=str(new URL(req.url).searchParams.get("id"));
    if(!id)return bad("id is required");
    const db=await getDb();
    const[row]=await db.select().from(wfReceivables).where(eq(wfReceivables.id,id));
    if(!row)return bad("That entry no longer exists",404);
    const[plan]=await db.select({ref:wfPlanning.ref}).from(wfPlanning).where(eq(wfPlanning.jobId,id));
    if(plan)return bad(`${row.ref} is being planned as ${plan.ref} in Planning & Procurement, so it cannot be deleted.`,409);
    const files=await db.select().from(wfAttachments)
      .where(and(eq(wfAttachments.entityType,"receivable"),eq(wfAttachments.entityId,id)));
    for(const f of files){try{await deleteFile(f.storageKey)}catch{/* already gone from storage */}}
    await writeWithAudit([
      db.delete(wfAttachments).where(and(eq(wfAttachments.entityType,"receivable"),eq(wfAttachments.entityId,id))),
      db.delete(wfReceivables).where(eq(wfReceivables.id,id))],
      actor?.name||actor?.email||"",
      "receivable",id,"Job notification deleted",
      `${row.ref} · ${row.jobName||row.description} · ${row.customer} · with ${files.length} document(s)`);
    return Response.json({deleted:true,ref:row.ref,documents:files.length});
  }catch(e){return oops(e)}}
