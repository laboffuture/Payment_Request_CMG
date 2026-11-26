import{and,asc,eq}from"drizzle-orm";
import{getDb}from"../../../../db";
import{auditLogs,paymentReleases,paymentRequests}from"../../../../db/schema";
import{companyLock,hasWriteRole,inCompany,requireAuth}from"../../../../lib/auth";
import{notify}from"../../../../lib/notify";
import{FINANCE_STAGES,RELEASED}from"../../../../lib/payment-stages";
import{bad,oops,str}from"../../../../lib/workforce-api";

/* Releasing an approved request, in full or in parts.

   Finance enters what was paid now and the day it was paid, with the bank's reference.
   Every payment is kept as a row of its own. While the payments add up to less than the
   request, it stays at "Ready to Release" showing what is still to pay; the payment that
   completes it marks it Payment Released. Booking a request as an expense is unchanged and
   stays on the main payments route. */

const cents=(n:number)=>Math.round(n*100)/100;
const money=(c:string,n:number)=>`${c} ${n.toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:2})}`;
/* Today in India, as the date input gives it. */
const todayIST=()=>new Date(Date.now()+330*60000).toISOString().slice(0,10);

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"write");
    if(response)return response;
    if(!hasWriteRole(actor?.roles))return bad("Your role cannot release payments.",403);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const id=Number(body.id);
    if(!Number.isFinite(id))return bad("id is required");
    const db=await getDb();
    const[old]=await db.select().from(paymentRequests).where(eq(paymentRequests.id,id)).limit(1);
    if(!old)return bad("Not found",404);
    if(!inCompany(await companyLock(actor),{name:old.company}))return bad("Not found",404);
    if(!FINANCE_STAGES.includes(old.status))
      return bad(`${old.requestNo} is at "${old.status}" - payments are released once audit has approved it.`,409);

    const total=cents(Number(old.amount)||0);
    const before=cents(Number(old.paidAmount)||0);
    const remaining=cents(total-before);
    const amount=cents(Number(String(body.amount??"").replace(/[,\s]/g,"")));
    if(!Number.isFinite(amount)||amount<=0)return bad("Enter the amount paid, above zero.",422);
    if(amount>remaining+0.001)
      return bad(`Only ${money(old.currency,remaining)} is left to pay on ${old.requestNo}.`,422);
    const paidOn=str(body.paidOn).trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)||Number.isNaN(Date.parse(paidOn+"T00:00:00Z")))
      return bad("Enter the date it was paid.",422);
    if(paidOn>todayIST())return bad("The date paid cannot be in the future.",422);
    const utr=str(body.utrNumber).trim().slice(0,60);
    if(!utr)return bad("Enter the UTR number for this payment.",422);
    const remark=str(body.note).trim().slice(0,1000);

    const after=cents(before+amount);
    const left=cents(total-after);
    const full=left<=0.001;
    const who=actor?.name||actor?.email||"system";
    const now=new Date().toISOString();
    /* Every UTR stays on the request, so a report shows all the references it was paid with. */
    const utrs=[...new Set([...String(old.utrNumber||"").split(",").map(s=>s.trim()).filter(Boolean),utr])].join(", ");
    const what=`${money(old.currency,amount)} paid on ${paidOn} · UTR ${utr}`;

    /* Only if nobody else has paid against it in the meantime: two people releasing the same
       request at once must not both be counted. */
    const[payment]=await db.update(paymentRequests).set({
      paidAmount:after,utrNumber:utrs,updatedAt:now,lastActionBy:who,lastActionAt:now,
      lastActionNote:remark||(full?"":`Part payment: ${what}. ${money(old.currency,left)} still to pay.`),
      ...(full?{status:RELEASED,owner:"Accounts & Finance"}:{})})
      .where(and(eq(paymentRequests.id,id),eq(paymentRequests.status,old.status),eq(paymentRequests.paidAmount,old.paidAmount)))
      .returning();
    if(!payment)return bad(`Someone has just recorded a payment on ${old.requestNo}. Reload it to see what is left to pay.`,409);

    await db.insert(paymentReleases).values({paymentId:id,amount,paidOn,utrNumber:utr,note:remark,createdBy:who});
    await db.insert(auditLogs).values({recordId:id,action:full?(before>0?"Final payment released":"Payment released"):"Part payment released",
      actor:who,previousValue:`Paid ${money(old.currency,before)} of ${money(old.currency,total)}`,
      newValue:`${what} · ${full?"paid in full":`${money(old.currency,left)} still to pay`}`});
    /* The status move is logged the way every other one is, so the trail, the release date
       and the latest remark read it as they always have. */
    if(full)await db.insert(auditLogs).values({recordId:id,action:"Status changed",actor:who,
      previousValue:old.status,newValue:remark?`${RELEASED} — ${remark}`:RELEASED});
    else if(remark)await db.insert(auditLogs).values({recordId:id,action:"Remark",actor:who,
      previousValue:old.status,newValue:`${old.status} — ${remark}`});

    await notify([old.raisedBy||""],{
      title:full?`Your request ${old.requestNo}: ${RELEASED}`
        :`${old.requestNo}: ${money(old.currency,amount)} paid, ${money(old.currency,left)} still to pay`,
      body:`${old.vendor} · ${what}`,
      reference:old.requestNo,
      detail:[{label:"Vendor",value:String(old.vendor||"")},{label:"Amount",value:money(old.currency,total)},
        {label:"Paid now",value:`${money(old.currency,amount)} on ${paidOn}`},{label:"UTR number",value:utr},
        {label:"Paid so far",value:money(old.currency,after)},{label:"Still to pay",value:money(old.currency,left)}],
      tone:"good",
      action:full?"Nothing further is needed from you.":"The rest will be released later; nothing is needed from you.",
      email:true,module:"payments",recordId:String(id)},actor?.email);

    const releases=await db.select().from(paymentReleases).where(eq(paymentReleases.paymentId,id)).orderBy(asc(paymentReleases.id));
    return Response.json({payment:{...payment,releases,releasedAt:full?paidOn:""},full,left});
  }catch(e){return oops(e)}}
