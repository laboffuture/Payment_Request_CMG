import{and,desc,eq,sql}from"drizzle-orm";
import{getBindings,getDb}from"../../../db";
import{wfBillingJobs,wfCompletions,wfPlanning,wfReceivables}from"../../../db/schema";
import{requireAuth}from"../../../lib/auth";
import{emailsForRoles,notify}from"../../../lib/notify";
import{ACCOUNTS_ROLES,AUDIT_ROLES,BILLING_ROLES,COST_CONTROL_ROLES,DEFAULT_EVERY_DAYS,FIELD_LABEL,FIRST,
  MANAGEMENT_ROLES,REQUIRED_TO_LEAVE,RETURNABLE_FROM,STAGES,mayAct,stageIndex}from"../../../lib/completion-stages";
import type{Stage}from"../../../lib/completion-stages";
import{actorOf,bad,num,oops,str,writeWithAudit}from"../../../lib/workforce-api";
import type{Row}from"../../../lib/workforce-api";

/* Accounts Receivable, module 3: Completion and Billing.

   Two things live here: the jobs register, and the completion cycles each active job
   produces on its schedule. As in the other modules, every stage change is decided on
   this side - the role, the stage moved from, whether the reader is the job's project
   manager, and the fields each stage requires. */

type Db=Awaited<ReturnType<typeof getDb>>;
const now=()=>new Date().toISOString();
const lower=(v:unknown)=>str(v).trim().toLowerCase();
const addDays=(iso:string,days:number)=>new Date(new Date(iso||now()).getTime()+days*86400000).toISOString();
const stamp=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,4);

/* The people to tell at a stage. A stage whose role nobody holds yet - there is no Cost
   Control or Management user at first - falls back to the administrators, who can act
   there, so a cycle never waits on an empty inbox. */
async function owners(roles:string[]){
  const named=roles.filter(r=>r!=="Administrator");
  const people=await emailsForRoles(named);
  return people.length?{to:people,roles:named}:{to:await emailsForRoles(["Administrator"]),roles:["Administrator"]}}

/* Every job whose plan is verified belongs on the register. Added here, on the way in,
   rather than only when a plan is verified, so plans verified before this module existed
   are listed too. A new job is active and first asked for completion one period after its
   plan was verified. */
async function syncJobs(db:Db){
  const listed=new Set((await db.select({planId:wfBillingJobs.planId}).from(wfBillingJobs)).map(r=>r.planId));
  const plans=(await db.select().from(wfPlanning).where(eq(wfPlanning.stage,"Verified"))).filter(p=>!listed.has(p.id));
  for(const p of plans){
    const[job]=await db.select({amount:wfReceivables.amount,currency:wfReceivables.currency})
      .from(wfReceivables).where(eq(wfReceivables.id,p.jobId));
    const id=`BJ-${stamp()}`;
    await db.insert(wfBillingJobs).values({id,ref:p.jobRef||id.toUpperCase(),jobId:p.jobId,planId:p.id,jobRef:p.jobRef,
      customer:p.customer,companyId:p.companyId,description:p.description,pmName:p.pmName,pmEmail:p.pmEmail,
      contractValue:num(job?.amount),currency:job?.currency||p.currency||"AED",active:1,everyDays:DEFAULT_EVERY_DAYS,
      nextRequestAt:addDays(p.verifiedAt||now(),DEFAULT_EVERY_DAYS),createdAt:now(),updatedAt:now()});
  }}

/* Issues a completion request to one job: a new cycle waiting on its project manager,
   who is emailed. Refused while an earlier request is still waiting on the manager - a
   second one would only ask the same question twice. */
async function issue(db:Db,job:typeof wfBillingJobs.$inferSelect,by:string,actorEmail?:string){
  const[open]=await db.select({ref:wfCompletions.ref}).from(wfCompletions)
    .where(and(eq(wfCompletions.billingJobId,job.id),eq(wfCompletions.stage,FIRST)));
  const at=now();
  await db.update(wfBillingJobs).set({lastRequestedAt:at,nextRequestAt:addDays(at,job.everyDays||DEFAULT_EVERY_DAYS),updatedAt:at})
    .where(eq(wfBillingJobs.id,job.id));
  if(open)return{created:false,ref:open.ref};
  const s=stamp();
  const row={id:`CB-${s}`,ref:`CB-${s.toUpperCase()}`,stage:FIRST as string,billingJobId:job.id,jobRef:job.jobRef,
    customer:job.customer,pmName:job.pmName,pmEmail:job.pmEmail,contractValue:job.contractValue,currency:job.currency,
    requestedAt:at,requestedBy:by,createdAt:at,updatedAt:at};
  await writeWithAudit([db.insert(wfCompletions).values(row)],by,"completion",row.id,"Completion requested",
    `${row.ref} · ${job.jobRef} · ${job.customer}`);
  const to=job.pmEmail?[job.pmEmail]:await emailsForRoles(ACCOUNTS_ROLES);
  await notify(to,{title:`${job.jobRef}: completion update requested`,body:`${job.customer} · ${job.description}`,
    reference:row.ref,detail:[{label:"Customer",value:job.customer},{label:"Job",value:job.jobRef},
      {label:"Description",value:job.description}],
    action:"Open Accounts Receivable → Completion and Billing and update how far the project has been completed.",
    module:"accountsreceived",recordId:row.id},actorEmail);
  return{created:true,ref:row.ref}}

/* Everything that is due: every active job whose next request date has passed. Run by
   the daily timer, and again whenever the module is opened, so a missed timer run only
   delays a request until somebody next looks. */
async function issueDue(db:Db,by:string){
  const due=await db.select().from(wfBillingJobs)
    .where(and(eq(wfBillingJobs.active,1),sql`${wfBillingJobs.nextRequestAt} <> '' and ${wfBillingJobs.nextRequestAt} <= ${now()}`));
  const out=[];
  for(const j of due)out.push({job:j.jobRef,...await issue(db,j,by)});
  return out}

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const db=await getDb();
    const me=lower(actor?.email);
    const all=(actor?.roles||[]).some(r=>BILLING_ROLES.includes(r));
    if(url.searchParams.get("assigned")==="me"){
      const[r]=await db.select({n:sql<number>`count(*)`}).from(wfBillingJobs)
        .where(sql`lower(${wfBillingJobs.pmEmail}) = ${me}`);
      return Response.json({count:Number(r?.n||0)});
    }
    await syncJobs(db);
    await issueDue(db,"schedule");
    const mine=(col:typeof wfBillingJobs.pmEmail|typeof wfCompletions.pmEmail)=>all?undefined:sql`lower(${col}) = ${me}`;
    const jobs=await db.select().from(wfBillingJobs).where(mine(wfBillingJobs.pmEmail)).orderBy(desc(wfBillingJobs.createdAt));
    const cycles=await db.select().from(wfCompletions).where(mine(wfCompletions.pmEmail))
      .orderBy(desc(wfCompletions.createdAt)).limit(300);
    /* Per job: what has been invoiced so far and the last certified completion, so the
       invoice can be suggested as the certified value not yet billed. */
    const billed=await db.select({job:wfCompletions.billingJobId,
      invoiced:sql<number>`coalesce(sum(case when ${wfCompletions.invoiceNo} <> '' then ${wfCompletions.invoiceAmount} else 0 end),0)`,
      certified:sql<number>`coalesce(max(case when ${wfCompletions.stage} in ('Raise Invoice','Audit Verification','Verified') then ${wfCompletions.certifiedPercent} end),0)`})
      .from(wfCompletions).groupBy(wfCompletions.billingJobId);
    return Response.json({jobs,cycles,totals:Object.fromEntries(billed.map(b=>[b.job,{invoiced:Number(b.invoiced),certified:Number(b.certified)}]))});
  }catch(e){return oops(e)}}

/* POST does three things:
   ?run=due             - issue every due request; for the daily timer (bearer token) or accounts
   {action:"request"}   - accounts ask one job for its completion now
   {action:"job"}       - accounts switch a job active/inactive or change how often it is asked */
export async function POST(req:Request){
  try{
    const url=new URL(req.url);
    if(url.searchParams.get("run")==="due"){
      /* The timer has no session: it proves itself with a shared token from .dev.vars,
         compared only when one is configured. Anyone else needs an accounts role. */
      const env=await getBindings() as{COMPLETION_CRON_TOKEN?:string};
      const token=str(env.COMPLETION_CRON_TOKEN).trim();
      const sent=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
      if(!(token&&sent===token)){
        const{actor,response}=await requireAuth(req,"read");
        if(response)return response;
        if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))return bad("Only accounts can issue requests.",403);
      }
      const db=await getDb();
      await syncJobs(db);
      return Response.json({issued:await issueDue(db,"schedule")});
    }
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))return bad("Only accounts manage the jobs register.",403);
    const body=await req.json() as Row;
    const db=await getDb();
    const[job]=await db.select().from(wfBillingJobs).where(eq(wfBillingJobs.id,str(body.id)));
    if(!job)return bad("That job is not on the register.",404);
    const who=actor?.name||actor?.email||"";
    if(str(body.action)==="request"){
      if(!job.active)return bad(`${job.jobRef} is inactive. Make it active to request its completion.`,422);
      const r=await issue(db,job,who,actor?.email);
      return r.created?Response.json(r,{status:201})
        :bad(`${r.ref} is still waiting on the project manager, so no new request was sent.`,409);
    }
    if(str(body.action)==="job"){
      const patch:Row={updatedAt:now()};
      if(body.active!==undefined){
        patch.active=body.active?1:0;
        // Coming back to life, the job is asked one period from now rather than at once.
        if(body.active&&!job.active)patch.nextRequestAt=addDays(now(),job.everyDays||DEFAULT_EVERY_DAYS);
      }
      if(body.everyDays!==undefined){
        const d=Math.round(num(body.everyDays));
        if(d<1||d>90)return bad("Ask between every 1 and every 90 days.",422);
        patch.everyDays=d;patch.nextRequestAt=addDays(job.lastRequestedAt||now(),d);
      }
      await writeWithAudit([db.update(wfBillingJobs).set(patch).where(eq(wfBillingJobs.id,job.id))],who,"billing-job",job.id,
        "Job updated",`${job.jobRef} · ${patch.active===undefined?"":patch.active?"active":"inactive"} ${patch.everyDays?`every ${patch.everyDays} days`:""}`.trim());
      const[saved]=await db.select().from(wfBillingJobs).where(eq(wfBillingJobs.id,job.id));
      return Response.json({job:saved});
    }
    return bad("Unknown action");
  }catch(e){return oops(e)}}

/* A cycle moving along (`action: "advance"`), or being sent back by management or audit
   (`action: "return"`). Advancing moves one stage from wherever the row actually is,
   guarded by that stage, so two people pressing at once cannot move it twice. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const db=await getDb();
    const id=str(body.id);
    const[row]=await db.select().from(wfCompletions).where(eq(wfCompletions.id,id));
    if(!row)return bad("That cycle no longer exists",404);
    const from=row.stage as Stage;
    const isManager=!!row.pmEmail&&lower(row.pmEmail)===lower(actor?.email);
    if(!mayAct(from,actor?.roles,isManager))return bad(`Your role cannot act on a cycle at ${from}.`,403);
    const who=actor?.name||actor?.email||"";
    const detail=[{label:"Customer",value:row.customer},{label:"Job",value:row.jobRef}];
    const tell=async(stage:Stage)=>stage==="Project Manager Update"?{to:row.pmEmail?[row.pmEmail]:await emailsForRoles(ACCOUNTS_ROLES),roles:undefined}
      :stage==="Cost Control Certification"?await owners(COST_CONTROL_ROLES)
      :stage==="Management Approval"?await owners(MANAGEMENT_ROLES)
      :stage==="Raise Invoice"?{to:await emailsForRoles(["Accountant"]),roles:["Accountant"]}
      :stage==="Audit Verification"?{to:await emailsForRoles(["Auditor","Audit Head"]),roles:["Auditor","Audit Head"]}
      :{to:row.pmEmail?[row.pmEmail]:[],roles:undefined};

    if(str(body.action,"advance")==="return"){
      const allowed=RETURNABLE_FROM[from]||[];
      if(!allowed.length)return bad(`A cycle cannot be sent back from ${from}.`,422);
      const to=str(body.stage) as Stage;
      if(!allowed.includes(to))return bad(`From ${from} a cycle may be sent back to ${allowed.join(", ")}.`,422);
      const note=str(body.note).trim();
      if(!note)return bad("Say what needs correcting before sending it back.",422);
      const patch={stage:to,returnNote:`${from}: ${note}`,returnedAt:now(),updatedAt:now()};
      await writeWithAudit([db.update(wfCompletions).set(patch).where(eq(wfCompletions.id,id))],
        actorOf(req,body),"completion",id,`Returned to ${to}`,`${row.ref} · ${note}`);
      const t=await tell(to);
      await notify(t.to,{title:`${row.ref} sent back to ${to}`,body:note,reference:row.ref,tone:"warning",detail,
        action:`Open the cycle in Accounts Receivable → Completion and Billing, correct it and send it on again.`,
        module:"accountsreceived",recordId:id},actor?.email,t.roles);
      return Response.json({cycle:{...row,...patch}});
    }

    const next=STAGES[stageIndex(from)+1];
    if(!next||from==="Verified")return bad("This cycle is already verified.");
    const filled:Row={...row,...body};
    const numeric=["percentComplete","certifiedPercent","invoiceAmount"];
    const missing=REQUIRED_TO_LEAVE[from].filter(f=>numeric.includes(f)
      ?(body[f]===undefined&&!num(row[f as keyof typeof row]))||str(filled[f]).trim()===""
      :!str(filled[f]).trim());
    if(missing.length)return bad(`${missing.map(f=>FIELD_LABEL[f]||f).join(", ")} must be filled in first.`,422);
    const pct=(v:unknown)=>{const n=num(v);return n>=0&&n<=100?n:NaN};

    const patch:Row={stage:next,updatedAt:now(),returnNote:"",returnedAt:""};
    if(from==="Project Manager Update"){
      const p=pct(filled.percentComplete);
      if(Number.isNaN(p))return bad("Completion % must be between 0 and 100.",422);
      Object.assign(patch,{percentComplete:p,completionNotes:str(filled.completionNotes).trim(),updatedBy:who,pmUpdatedAt:now()});
    }
    if(from==="Cost Control Certification"){
      const p=pct(filled.certifiedPercent);
      if(Number.isNaN(p))return bad("Certified completion % must be between 0 and 100.",422);
      Object.assign(patch,{certifiedPercent:p,certificationNotes:str(body.certificationNotes,row.certificationNotes).trim(),
        certifiedBy:who,certifiedAt:now()});
    }
    if(from==="Management Approval")
      Object.assign(patch,{approvalNotes:str(body.approvalNotes,row.approvalNotes).trim(),approvedBy:who,approvedAt:now()});
    if(from==="Raise Invoice"){
      const amount=num(filled.invoiceAmount);
      if(!(amount>0))return bad("Invoice amount must be above zero.",422);
      Object.assign(patch,{invoiceNo:str(filled.invoiceNo).trim(),invoiceDate:str(filled.invoiceDate),invoiceAmount:amount,
        currency:str(body.currency,row.currency||"AED"),invoicedBy:who,invoicedAt:now()});
    }
    if(from==="Audit Verification")
      Object.assign(patch,{verifiedBy:who,verifiedAt:now(),remarks:str(body.remarks,row.remarks).trim()});

    const res=await db.update(wfCompletions).set(patch).where(and(eq(wfCompletions.id,id),eq(wfCompletions.stage,from)));
    if((res as{meta?:{changes?:number}})?.meta?.changes===0)
      return bad("Somebody else moved this cycle. Reopen it to see where it is now.",409);
    await writeWithAudit([],actorOf(req,body),"completion",id,`${from} → ${next}`,`${row.ref} · ${row.jobRef}`);

    const saved={...row,...patch} as typeof row;
    const facts=[...detail,
      {label:"Completion",value:saved.percentComplete?`${saved.percentComplete}% (project manager)`:""},
      {label:"Certified",value:saved.certifiedPercent?`${saved.certifiedPercent}% by ${saved.certifiedBy}`:""},
      {label:"Invoice",value:saved.invoiceNo?`${saved.invoiceNo} · ${saved.currency} ${num(saved.invoiceAmount).toLocaleString()}`:""}];
    const ask:Record<string,string>={
      "Cost Control Certification":"Check the completion reported and certify it.",
      "Management Approval":"Review the certified completion and approve it for invoicing, or send it back.",
      "Raise Invoice":"Raise the invoice for the approved completion and record it.",
      "Audit Verification":"Check the completion, the certification, the approval and the invoice, then verify or send it back.",
      "Verified":"Nothing further is needed on this cycle."};
    const t=await tell(next);
    if(t.to.length)await notify(t.to,{title:next==="Verified"?`${row.ref} verified by audit`:`${row.ref}: ${next.toLowerCase()} needed`,
      body:`${row.customer} · ${row.jobRef}`,reference:row.ref,detail:facts,tone:next==="Verified"?"good":"normal",
      action:ask[next],module:"accountsreceived",recordId:id},actor?.email,t.roles);
    return Response.json({cycle:saved});
  }catch(e){return oops(e)}}
