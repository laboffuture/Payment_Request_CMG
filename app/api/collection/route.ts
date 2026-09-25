import{and,asc,desc,eq,sql}from"drizzle-orm";
import{getBindings,getDb}from"../../../db";
import{wfCollectionEvents,wfCollections,wfCompletions}from"../../../db/schema";
import{requireAuth}from"../../../lib/auth";
import{emailsForRoles,notify}from"../../../lib/notify";
import{ACCOUNTS_ROLES,DEFAULT_CREDIT_DAYS,FOLLOW_UPS,STATUSES,isCollected,mayLog,mayVerify}
  from"../../../lib/collection-stages";
import{bad,num,oops,str,writeWithAudit}from"../../../lib/workforce-api";
import type{Row}from"../../../lib/workforce-api";

/* Accounts Receivable, module 4: Debt Collection.

   Cases are found, not raised: every invoice verified in Completion and Billing whose due
   date has passed without the case being collected is listed here. Accounts log calls,
   emails, the customer's position and payments against it; once the payments cover the
   invoice it goes to audit. Every rule is checked on this side as well as in the screen. */

type Db=Awaited<ReturnType<typeof getDb>>;
const now=()=>new Date().toISOString();
const today=()=>now().slice(0,10);
const dayPlus=(date:string,days:number)=>new Date(new Date(`${date}T00:00:00Z`).getTime()+days*86400000).toISOString().slice(0,10);
const stamp=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,4);
const RECEIVABLE_ROLES=["Accountant","Administrator","Auditor","Audit Head"];

/* Every verified invoice past its due date becomes a case, once. Run by the daily timer
   and whenever the module is opened. Accounts hear about each new one. */
async function findMissed(db:Db){
  const known=new Set((await db.select({id:wfCollections.completionId}).from(wfCollections)).map(r=>r.id).filter(Boolean));
  const invoices=(await db.select().from(wfCompletions)
    .where(and(eq(wfCompletions.stage,"Verified"),sql`${wfCompletions.invoiceNo} <> ''`))).filter(c=>!known.has(c.id));
  const created=[];
  for(const c of invoices){
    const invoiceDate=c.invoiceDate||c.invoicedAt.slice(0,10)||today();
    const due=dayPlus(invoiceDate,DEFAULT_CREDIT_DAYS);
    if(due>=today())continue;
    const s=stamp();
    const row={id:`DC-${s}`,ref:`DC-${s.toUpperCase()}`,completionId:c.id,billingJobId:c.billingJobId,jobRef:c.jobRef,
      customer:c.customer,pmName:c.pmName,invoiceNo:c.invoiceNo,invoiceDate,invoiceAmount:c.invoiceAmount,
      currency:c.currency,creditDays:DEFAULT_CREDIT_DAYS,dueDate:due,createdAt:now(),updatedAt:now()};
    await writeWithAudit([db.insert(wfCollections).values(row)],"schedule","collection",row.id,"Invoice missed",
      `${row.ref} · ${c.invoiceNo} · ${c.customer}`);
    await notify(await emailsForRoles(["Accountant"]),{title:`Invoice ${c.invoiceNo} is overdue: ${c.customer}`,
      body:`Due ${due}, not collected`,reference:row.ref,tone:"warning",
      detail:[{label:"Customer",value:c.customer},{label:"Invoice",value:c.invoiceNo},
        {label:"Amount",value:`${c.currency} ${num(c.invoiceAmount).toLocaleString()}`},{label:"Due",value:due},{label:"Job",value:c.jobRef}],
      action:"Follow up with the customer and record the call or email in Accounts Receivable → Debt Collection.",
      module:"accountsreceived",recordId:row.id},null,["Accountant"]);
    created.push(row.ref);
  }
  return created}

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    if(!actor?.roles.some(r=>RECEIVABLE_ROLES.includes(r)))return bad("Your role cannot see debt collection.",403);
    const db=await getDb();
    const caseId=new URL(req.url).searchParams.get("case");
    if(caseId){
      const events=await db.select().from(wfCollectionEvents).where(eq(wfCollectionEvents.caseId,caseId))
        .orderBy(asc(wfCollectionEvents.at));
      return Response.json({events});
    }
    await findMissed(db);
    const cases=await db.select().from(wfCollections).orderBy(desc(wfCollections.createdAt)).limit(300);
    return Response.json({cases});
  }catch(e){return oops(e)}}

/* POST:
   ?run=due               - find newly missed invoices; for the daily timer (bearer token) or accounts
   {action:"add"}         - accounts add a missed invoice by hand
   {action:"log"}         - accounts log a call, an email, a status or a payment against a case
   {action:"terms"}       - accounts change a case's credit days, and so its due date */
export async function POST(req:Request){
  try{
    const url=new URL(req.url);
    if(url.searchParams.get("run")==="due"){
      const env=await getBindings() as{COMPLETION_CRON_TOKEN?:string};
      const token=str(env.COMPLETION_CRON_TOKEN).trim();
      const sent=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
      if(!(token&&sent===token)){
        const{actor,response}=await requireAuth(req,"read");
        if(response)return response;
        if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))return bad("Only accounts can run this.",403);
      }
      return Response.json({missed:await findMissed(await getDb())});
    }
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    if(!actor?.roles.some(r=>ACCOUNTS_ROLES.includes(r)))return bad("Only accounts work debt collection.",403);
    const body=await req.json() as Row;
    const db=await getDb();
    const who=actor?.name||actor?.email||"";
    const action=str(body.action);

    if(action==="add"){
      /* An invoice raised before the portal, or outside it. It is entered already
         overdue: that is the only kind this module holds. */
      const customer=str(body.customer).trim(),invoiceNo=str(body.invoiceNo).trim();
      const invoiceDate=str(body.invoiceDate),amount=num(body.invoiceAmount);
      const credit=Math.round(num(body.creditDays||DEFAULT_CREDIT_DAYS));
      if(!customer||!invoiceNo||!invoiceDate)return bad("Customer, invoice number and invoice date are required.",422);
      if(!(amount>0))return bad("Invoice amount must be above zero.",422);
      if(credit<0||credit>365)return bad("Credit days must be between 0 and 365.",422);
      const[dupe]=await db.select({ref:wfCollections.ref}).from(wfCollections).where(sql`lower(${wfCollections.invoiceNo}) = ${invoiceNo.toLowerCase()}`);
      if(dupe)return bad(`Invoice ${invoiceNo} is already case ${dupe.ref}.`,409);
      const s=stamp();
      const row={id:`DC-${s}`,ref:`DC-${s.toUpperCase()}`,customer,jobRef:str(body.jobRef).trim(),invoiceNo,invoiceDate,
        invoiceAmount:amount,currency:str(body.currency,"AED")||"AED",creditDays:credit,dueDate:dayPlus(invoiceDate,credit),
        source:"manual",createdAt:now(),updatedAt:now()};
      await writeWithAudit([db.insert(wfCollections).values(row)],who,"collection",row.id,"Missed invoice added",
        `${row.ref} · ${invoiceNo} · ${customer}`);
      const[saved]=await db.select().from(wfCollections).where(eq(wfCollections.id,row.id));
      return Response.json({case:saved},{status:201});
    }

    const[row]=await db.select().from(wfCollections).where(eq(wfCollections.id,str(body.id)));
    if(!row)return bad("That case no longer exists",404);

    if(action==="terms"){
      if(!mayLog(row.stage,actor?.roles))return bad(`A case at ${row.stage} cannot be changed.`,422);
      const credit=Math.round(num(body.creditDays));
      if(credit<0||credit>365)return bad("Credit days must be between 0 and 365.",422);
      const patch={creditDays:credit,dueDate:dayPlus(row.invoiceDate,credit),updatedAt:now()};
      await writeWithAudit([db.update(wfCollections).set(patch).where(eq(wfCollections.id,row.id))],who,"collection",row.id,
        "Credit days changed",`${row.ref} · ${credit} days`);
      return Response.json({case:{...row,...patch}});
    }

    if(action==="log"){
      if(!mayLog(row.stage,actor?.roles))return bad(`Nothing more can be logged on a case at ${row.stage}.`,422);
      const kind=str(body.kind);
      const notes=str(body.notes).trim();
      const event={id:`CE-${stamp()}`,caseId:row.id,kind,at:now(),byName:who,byEmail:actor?.email||"",
        contact:str(body.contact).trim(),notes,status:"",amount:0,promisedDate:""};
      const patch:Row={updatedAt:now()};
      /* Whoever first follows a case up is its collector: the one told if audit sends it
         back or verifies it. */
      if(!row.collectorEmail){patch.collectorName=who;patch.collectorEmail=actor?.email||""}
      if((FOLLOW_UPS as readonly string[]).includes(kind)){
        if(!event.contact)return bad("Say who was contacted.",422);
        if(!notes)return bad("Record what was said or sent.",422);
        Object.assign(patch,{followUps:(row.followUps||0)+1,lastFollowUpAt:now(),
          status:row.status==="Not contacted"?"Contacted":row.status,
          stage:row.stage==="Invoice Missed"?"Follow Up":row.stage});
      }else if(kind==="Status"){
        const status=str(body.status);
        if(!(STATUSES as readonly string[]).includes(status))return bad(`Status must be one of ${STATUSES.join(", ")}.`,422);
        if(status==="Promised to pay"&&!str(body.promisedDate))return bad("Say when the customer promised to pay.",422);
        if(!notes)return bad("Record what the customer said.",422);
        event.status=status;event.promisedDate=str(body.promisedDate);
        Object.assign(patch,{status,promisedDate:event.promisedDate||row.promisedDate,stage:"Status Update"});
      }else if(kind==="Payment"){
        const amount=num(body.amount);
        if(!(amount>0))return bad("Payment amount must be above zero.",422);
        const received=Math.round((row.amountReceived+amount)*100)/100;
        if(received>row.invoiceAmount+0.01)
          return bad(`That would take the total received to ${row.currency} ${received.toLocaleString()}, more than the invoice. Check the amount.`,422);
        event.amount=amount;
        Object.assign(patch,{amountReceived:received,stage:"Status Update",
          status:isCollected(received,row.invoiceAmount)?"Paid in full":"Partly paid"});
      }else return bad("Log a Call, an Email, a Status or a Payment.",422);
      await writeWithAudit([db.insert(wfCollectionEvents).values(event),db.update(wfCollections).set(patch).where(eq(wfCollections.id,row.id))],
        who,"collection",row.id,`${kind} logged`,`${row.ref} · ${notes||event.status||event.amount}`);
      const[saved]=await db.select().from(wfCollections).where(eq(wfCollections.id,row.id));
      return Response.json({case:saved,event});
    }
    return bad("Unknown action");
  }catch(e){return oops(e)}}

/* Sending a collected case to audit, audit verifying it, or audit sending it back. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const db=await getDb();
    const[row]=await db.select().from(wfCollections).where(eq(wfCollections.id,str(body.id)));
    if(!row)return bad("That case no longer exists",404);
    const who=actor?.name||actor?.email||"";
    const detail=[{label:"Customer",value:row.customer},{label:"Invoice",value:row.invoiceNo},
      {label:"Amount",value:`${row.currency} ${num(row.invoiceAmount).toLocaleString()}`},
      {label:"Received",value:`${row.currency} ${num(row.amountReceived).toLocaleString()}`}];
    const collector=row.collectorEmail?[row.collectorEmail]:await emailsForRoles(ACCOUNTS_ROLES);
    const action=str(body.action);
    const move=async(from:string,patch:Row,log:string)=>{
      const res=await db.update(wfCollections).set({...patch,updatedAt:now()})
        .where(and(eq(wfCollections.id,row.id),eq(wfCollections.stage,from)));
      if((res as{meta?:{changes?:number}})?.meta?.changes===0)return false;
      await writeWithAudit([],who,"collection",row.id,log,row.ref);return true};

    if(action==="submit"){
      if(!mayLog(row.stage,actor?.roles))return bad(`Your role cannot send a case at ${row.stage} to audit.`,403);
      if(!isCollected(row.amountReceived,row.invoiceAmount))
        return bad(`Only ${row.currency} ${num(row.amountReceived).toLocaleString()} of ${row.currency} ${num(row.invoiceAmount).toLocaleString()} is recorded as received. Record the payments first.`,422);
      if(!await move(row.stage,{stage:"Audit Verification",submittedAt:now(),returnNote:"",returnedAt:""},"Sent for audit verification"))
        return bad("Somebody else moved this case. Reopen it to see where it is now.",409);
      await notify(await emailsForRoles(["Auditor","Audit Head"]),{title:`${row.ref}: collection ready for audit verification`,
        body:`${row.customer} · ${row.invoiceNo}`,reference:row.ref,detail,
        action:"Check the payments recorded against the invoice, then verify the collection or send it back.",
        module:"accountsreceived",recordId:row.id},actor?.email,["Auditor","Audit Head"]);
    }else if(action==="verify"){
      if(!mayVerify(row.stage,actor?.roles))return bad("Only audit verifies a collection, once it is sent to them.",403);
      if(!await move("Audit Verification",{stage:"Verified",status:"Collected",verifiedBy:who,verifiedAt:now(),
        remarks:str(body.remarks).trim()},"Collection verified"))
        return bad("Somebody else moved this case. Reopen it to see where it is now.",409);
      await notify(collector,{title:`${row.ref}: collection of ${row.invoiceNo} verified`,body:str(body.remarks)||row.customer,
        reference:row.ref,tone:"good",detail,action:"Nothing further is needed on this case.",module:"accountsreceived",recordId:row.id},actor?.email);
    }else if(action==="return"){
      if(!mayVerify(row.stage,actor?.roles))return bad("Only audit sends a case back.",403);
      const note=str(body.note).trim();
      if(!note)return bad("Say what needs correcting before sending it back.",422);
      if(!await move("Audit Verification",{stage:"Status Update",returnNote:note,returnedAt:now(),submittedAt:""},"Returned to Status Update"))
        return bad("Somebody else moved this case. Reopen it to see where it is now.",409);
      await notify(collector,{title:`${row.ref} sent back by audit`,body:note,reference:row.ref,tone:"warning",detail,
        action:"Correct the case in Accounts Receivable → Debt Collection and send it to audit again.",module:"accountsreceived",recordId:row.id},actor?.email);
    }else return bad("action must be submit, verify or return");
    const[saved]=await db.select().from(wfCollections).where(eq(wfCollections.id,row.id));
    return Response.json({case:saved});
  }catch(e){return oops(e)}}

