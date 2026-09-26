import{and,desc,eq,sql}from"drizzle-orm";
import{getDb}from"../../../db";
import{wfPlanning,wfReceivables,wfUsers}from"../../../db/schema";
import{companyLock,inCompany,requireAuth}from"../../../lib/auth";
import{emailsForRoles,notify}from"../../../lib/notify";
import{ACCOUNTS_ROLES,AUDIT_ROLES,FIELD_LABEL,FIRST_OPEN,RECEIVABLE_ROLES,REQUIRED_TO_LEAVE,
  RETURNABLE_TO,STAGES,mayAct,stageIndex}from"../../../lib/planning-stages";
import type{Stage}from"../../../lib/planning-stages";
import{actorOf,bad,num,oops,page,str,writeWithAudit}from"../../../lib/workforce-api";
import type{Row}from"../../../lib/workforce-api";

/* Accounts Receivable, module 2: Planning & Procurement.

   As in the Job Notification route, every stage change is decided here rather than in
   the screen: the role, the stage the entry is moving from, whether the reader is its
   project manager and the fields the stage requires are all checked on this side. */

const now=()=>new Date().toISOString();
const lower=(v:unknown)=>str(v).trim().toLowerCase();
const sees=(roles:string[]=[])=>roles.some(r=>RECEIVABLE_ROLES.includes(r));

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const db=await getDb();
    const me=lower(actor?.email);
    const lock=await companyLock(actor);

    /* How many entries name the reader as project manager - which is what puts
       Accounts Receivable in the menu of somebody whose role would not show it. */
    if(url.searchParams.get("assigned")==="me"){
      const[r]=await db.select({n:sql<number>`count(*)`}).from(wfPlanning)
        .where(sql`lower(${wfPlanning.pmEmail}) = ${me}`);
      return Response.json({count:Number(r?.n||0)});
    }
    /* The people a project manager can be chosen from: everyone with an active login,
       since the manager is emailed and acts in the portal. Accounts only. */
    if(url.searchParams.get("people")){
      if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))return bad("Only accounts assign a project manager.",403);
      const people=await db.select({name:wfUsers.name,email:wfUsers.email}).from(wfUsers)
        .where(eq(wfUsers.active,1)).orderBy(wfUsers.name);
      return Response.json({people});
    }
    /* The jobs planning can start on: verified in Job Notification, and not planned yet. */
    if(url.searchParams.get("jobs")){
      if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))return bad("Only accounts start a plan.",403);
      /* Filtered here rather than with NOT IN, which would pass D1's bound-parameter
         limit once there are more than a hundred plans. */
      const planned=new Set((await db.select({id:wfPlanning.jobId}).from(wfPlanning)).map(r=>r.id));
      const jobs=(await db.select({id:wfReceivables.id,ref:wfReceivables.ref,customer:wfReceivables.customer,
        description:wfReceivables.description,companyId:wfReceivables.companyId}).from(wfReceivables)
        .where(eq(wfReceivables.stage,"Verified")).orderBy(desc(wfReceivables.createdAt)))
        .filter(j=>!planned.has(j.id)).filter(j=>inCompany(lock,{id:j.companyId})).slice(0,200);
      return Response.json({jobs});
    }
    const{limit,offset}=page(url);
    /* Accounts and audit see every plan; a project manager whose role would not show
       Accounts Receivable sees only the plans they manage. */
    const rows=await db.select().from(wfPlanning)
      .where(sees(actor?.roles)?undefined:sql`lower(${wfPlanning.pmEmail}) = ${me}`)
      .orderBy(desc(wfPlanning.createdAt)).limit(limit).offset(offset);
    return Response.json({plans:rows.filter(r=>inCompany(lock,{id:r.companyId}))});
  }catch(e){return oops(e)}}

/* Starting a plan: choosing its job. The job must be verified in Job Notification and
   not planned already; the entry starts waiting for its project manager, whatever the
   request body says about its stage. */
export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))return bad("Only accounts may start a plan.",403);
    const body=await req.json() as Row;
    const db=await getDb();
    const[job]=await db.select().from(wfReceivables).where(eq(wfReceivables.id,str(body.jobId)));
    if(!job||!inCompany(await companyLock(actor),{id:job.companyId}))return bad("Choose a job from Job Notification.");
    if(job.stage!=="Verified")return bad(`${job.ref} is at ${job.stage}. A job is planned once it is verified.`,422);
    const[already]=await db.select({ref:wfPlanning.ref}).from(wfPlanning).where(eq(wfPlanning.jobId,job.id));
    if(already)return bad(`${job.ref} is already being planned as ${already.ref}.`,409);
    const stamp=Date.now().toString(36);
    const row={id:`PP-${stamp}`,ref:`PP-${stamp.toUpperCase()}`,stage:FIRST_OPEN as string,
      jobId:job.id,jobRef:job.ref,customer:job.customer,companyId:job.companyId,description:job.description,
      currency:job.currency||"AED",raisedByEmail:actor?.email||"",createdAt:now(),updatedAt:now()};
    await writeWithAudit([db.insert(wfPlanning).values(row)],actorOf(req,body),"planning",row.id,
      "Planning started",`${row.ref} · ${job.ref} · ${job.customer}`);
    const[saved]=await db.select().from(wfPlanning).where(eq(wfPlanning.id,row.id));
    return Response.json({plan:saved},{status:201});
  }catch(e){return oops(e)}}

/* Moving an entry along (`action: "advance"`) or, for audit, sending it back
   (`action: "return"`). Advancing moves exactly one stage from wherever the row actually
   is, guarded by that stage, so two people pressing at once cannot move it twice. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const id=str(body.id);
    if(!id)return bad("id is required");
    const db=await getDb();
    const[row]=await db.select().from(wfPlanning).where(eq(wfPlanning.id,id));
    if(!row||!inCompany(await companyLock(actor),{id:row.companyId}))return bad("That entry no longer exists",404);
    const from=row.stage as Stage;
    const isManager=!!row.pmEmail&&lower(row.pmEmail)===lower(actor?.email);
    if(!mayAct(from,actor?.roles,isManager))
      return bad(`Your role cannot act on an entry at ${from}.`,403);
    const who=actor?.name||actor?.email||"";
    const tellBack=[row.raisedByEmail,row.pmEmail].filter(Boolean);

    if(str(body.action,"advance")==="return"){
      if(!actor?.roles.some(r=>AUDIT_ROLES.includes(r)))return bad("Only audit may send an entry back.",403);
      const to=str(body.stage) as Stage;
      if(!RETURNABLE_TO.includes(to))return bad(`An entry may be sent back to ${RETURNABLE_TO.join(", ")}.`);
      const note=str(body.note).trim();
      if(!note)return bad("Say what needs correcting before sending it back.");
      const patch={stage:to,returnNote:note,returnedAt:now(),submittedAt:"",updatedAt:now()};
      await writeWithAudit([db.update(wfPlanning).set(patch).where(eq(wfPlanning.id,id))],
        actorOf(req,body),"planning",id,`Returned to ${to}`,`${row.ref} · ${note}`);
      await notify(tellBack.length?tellBack:await emailsForRoles(ACCOUNTS_ROLES),
        {title:`${row.ref} sent back to ${to}`,body:note,reference:row.ref,tone:"warning",
          detail:[{label:"Customer",value:row.customer},{label:"Job",value:row.jobRef}],
          action:`Open the plan in Accounts Receivable → Planning & Procurement, correct ${to.toLowerCase()} and send it on again.`,
          module:"accountsreceived",recordId:id},actor?.email);
      return Response.json({plan:{...row,...patch}});
    }

    const next=STAGES[stageIndex(from)+1];
    if(!next||from==="Verified")return bad("This entry is already verified.");
    const filled:Row={...row,...body};
    const missing=REQUIRED_TO_LEAVE[from].filter(f=>f==="bomCost"?!(num(filled[f])>0):!str(filled[f]).trim());
    if(missing.length)return bad(`${missing.map(f=>FIELD_LABEL[f]||f).join(", ")} must be filled in first.`,422);

    const patch:Row={stage:next,updatedAt:now(),returnNote:"",returnedAt:""};
    let manager:{name:string;email:string}|undefined;
    if(from==="Assign Project Manager"){
      /* Only someone with a login: the manager is emailed and acts in the portal. */
      const[u]=await db.select({name:wfUsers.name,email:wfUsers.email,active:wfUsers.active}).from(wfUsers)
        .where(sql`lower(${wfUsers.email}) = ${lower(body.pmEmail)}`);
      if(!u||!u.active)return bad("Choose the project manager from the list of people with a login.",422);
      manager={name:u.name,email:u.email};
      Object.assign(patch,{pmName:u.name||u.email,pmEmail:u.email,pmAt:now()});
    }
    if(from==="Project Schedule and Planning"){
      const start=str(body.startDate,row.startDate),end=str(body.endDate,row.endDate);
      if(end<start)return bad("The target completion date cannot be before the start date.",422);
      Object.assign(patch,{startDate:start,endDate:end,planNotes:str(body.planNotes,row.planNotes).trim(),planAt:now()});
    }
    if(from==="Detailed BOM - Procurement Planning")
      Object.assign(patch,{bomSummary:str(body.bomSummary,row.bomSummary).trim(),bomCost:num(filled.bomCost),
        currency:str(body.currency,row.currency||"AED"),procurementNotes:str(body.procurementNotes,row.procurementNotes).trim(),
        bomAt:now(),submittedAt:now()});
    if(from==="Audit Verification")
      Object.assign(patch,{verifiedBy:who,verifiedAt:now(),remarks:str(body.remarks,row.remarks).trim()});

    const res=await db.update(wfPlanning).set(patch)
      .where(and(eq(wfPlanning.id,id),eq(wfPlanning.stage,from)));
    if((res as{meta?:{changes?:number}})?.meta?.changes===0)
      return bad("Somebody else moved this entry. Reopen it to see where it is now.",409);
    await writeWithAudit([],actorOf(req,body),"planning",id,`${from} → ${next}`,`${row.ref} · ${row.customer}`);

    const detail=[{label:"Customer",value:row.customer},{label:"Job",value:row.jobRef},
      {label:"Description",value:row.description}];
    // The manager hears they have a plan to make; audit hears when one reaches them;
    // whoever started it and the manager hear the verdict.
    if(manager)
      await notify([manager.email],{title:`${row.ref}: you are the project manager for ${row.customer}`,
        body:row.description,reference:row.ref,detail,
        action:"Prepare the project schedule and plan, then the detailed BOM and procurement plan, in Accounts Receivable → Planning & Procurement.",
        module:"accountsreceived",recordId:id},actor?.email);
    if(next==="Audit Verification")
      await notify(await emailsForRoles(["Auditor","Audit Head"]),{title:`${row.ref} is ready for audit verification`,
        body:[row.customer,row.jobRef].filter(Boolean).join(" · "),reference:row.ref,detail,
        action:"Check the schedule, the BOM and the procurement plan, then verify it or send it back.",
        module:"accountsreceived",recordId:id},actor?.email,["Auditor","Audit Head"]);
    if(next==="Verified")
      await notify(tellBack.length?tellBack:await emailsForRoles(ACCOUNTS_ROLES),{title:`${row.ref} verified by audit`,
        body:str(patch.remarks)||`${row.customer} · ${row.jobRef}`,reference:row.ref,tone:"good",detail,
        action:"Nothing further is needed on this plan.",module:"accountsreceived",recordId:id},actor?.email);

    const[saved]=await db.select().from(wfPlanning).where(eq(wfPlanning.id,id));
    return Response.json({plan:saved});
  }catch(e){return oops(e)}}
