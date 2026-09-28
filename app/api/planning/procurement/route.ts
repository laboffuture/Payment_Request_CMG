import{and,asc,eq,like,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfAttachments,wfPlanBom,wfPlanProcurement}from"../../../../db/schema";
import{requireAuth}from"../../../../lib/auth";
import{emailsForRoles,notify}from"../../../../lib/notify";
import{planFor}from"../../../../lib/planning-access";
import{APPROVER_ROLES,NEEDS_APPROVAL,PROCUREMENT_STATUSES}from"../../../../lib/planning-stages";
import{actorOf,bad,oops,str,writeWithAudit}from"../../../../lib/workforce-api";
import type{Row}from"../../../../lib/workforce-api";
import{rememberVendor}from"../../../../lib/vendors";

/* Procurement planning of a plan: one row per purchase of a BOM material.

   The approval is maker-checker. Whoever sets the commercial terms - the material, the
   quantities, the quotations, the vendor and rate chosen - is the maker; a different
   person holding an approving role (management) is the checker, and only they may
   approve or reject. Changing the commercial terms after a decision sends the purchase
   back to Pending, so what was approved is always what is recorded. The purchase
   request number is issued when the row is created and the PO number when it is
   approved, both by the server. */

const now=()=>new Date().toISOString();
const lower=(v:unknown)=>str(v).trim().toLowerCase();
const date=/^\d{4}-\d{2}-\d{2}$/;
const figure=(v:unknown)=>{const s=str(v).trim();return s===""?undefined:Number(s)};
const Q=[1,2,3] as const;
/* The fields whose change needs a fresh approval. */
const COMMERCIAL=["bomId","requiredQty","availableStock","selectedVendor","selectedRate",
  ...Q.flatMap(q=>[`q${q}Vendor`,`q${q}Amount`,`q${q}FileId`])];

/* The next number in a yearly series, e.g. PR-2026-0007. */
async function nextNumber(prefix:"PR"|"PO"){
  const column=prefix==="PR"?wfPlanProcurement.prNo:wfPlanProcurement.poNo;
  const db=await getDb();
  const stem=`${prefix}-${new Date().getFullYear()}-`;
  const[r]=await db.select({top:sql<string>`max(${column})`}).from(wfPlanProcurement).where(like(column,`${stem}%`));
  return stem+String((Number(String(r?.top||"").slice(stem.length))||0)+1).padStart(4,"0");
}

/* The fields of a purchase from the request, checked; or the reason they cannot be saved. */
async function fieldsOf(body:Row,planId:string){
  const db=await getDb();
  const[bom]=await db.select().from(wfPlanBom).where(and(eq(wfPlanBom.id,str(body.bomId)),eq(wfPlanBom.planId,planId)));
  if(!bom)return"Material: choose a line of this plan's detailed BOM.";
  const required=figure(body.requiredQty),stock=figure(body.availableStock),rate=figure(body.selectedRate);
  const missing:string[]=[];
  if(required===undefined)missing.push("Required quantity");
  if(!date.test(str(body.requiredDate)))missing.push("Required date");
  if(!str(body.selectedVendor).trim())missing.push("Selected vendor");
  if(rate===undefined)missing.push("Selected rate");
  if(!str(body.status))missing.push("Status");
  if(missing.length)return`${missing.join(", ")} must be filled in.`;
  for(const[v,l]of[[required,"Required quantity"],[stock,"Available stock"],[rate,"Selected rate"]] as const)
    if(v!==undefined&&(!Number.isFinite(v)||v<0))return`${l} must be a number, 0 or more.`;
  const status=str(body.status);
  if(!(PROCUREMENT_STATUSES as readonly string[]).includes(status))return`Status must be one of ${PROCUREMENT_STATUSES.join(", ")}.`;
  for(const[k,l]of[["poDate","PO date"],["expectedDelivery","Expected delivery"],["actualDelivery","Actual delivery"]] as const)
    if(str(body[k])&&!date.test(str(body[k])))return`Enter ${l.toLowerCase()} as a date.`;
  if(status==="Delivered"&&!str(body.actualDelivery))return"Enter the actual delivery date for a delivered purchase.";
  const quotes:Row={};
  for(const q of Q){
    const amount=figure(body[`q${q}Amount`]);
    if(amount!==undefined&&(!Number.isFinite(amount)||amount<0))return`Quotation ${q}: the amount must be a number, 0 or more.`;
    const fileId=str(body[`q${q}FileId`]);
    let fileName="";
    if(fileId){
      /* The file must be one uploaded for this plan's procurement. */
      const[a]=await db.select({name:wfAttachments.fileName}).from(wfAttachments).where(and(eq(wfAttachments.id,fileId),
        eq(wfAttachments.entityType,"procurement"),eq(wfAttachments.entityId,planId)));
      if(!a)return`Quotation ${q}: the file was not found. Choose it again.`;
      fileName=a.name;
    }
    Object.assign(quotes,{[`q${q}Vendor`]:str(body[`q${q}Vendor`]).trim().replace(/\s+/g," "),
      [`q${q}Amount`]:amount===undefined?null:amount,[`q${q}FileId`]:fileId,[`q${q}FileName`]:fileName});
  }
  const need=required!,have=stock===undefined?null:stock;
  return{bomId:bom.id,material:bom.description,unit:bom.unit,requiredQty:need,availableStock:have,
    balanceRequired:Math.max(0,Math.round((need-(have??0))*1000)/1000),requiredDate:str(body.requiredDate),
    ...quotes,selectedVendor:str(body.selectedVendor).trim().replace(/\s+/g," "),selectedRate:rate!,
    poDate:str(body.poDate),expectedDelivery:str(body.expectedDelivery),actualDelivery:str(body.actualDelivery),status};
}

/* Tell management a purchase waits for their approval. */
async function askApproval(plan:{ref:string;id:string;customer:string},f:Row,prNo:string,by?:string){
  await notify(await emailsForRoles(APPROVER_ROLES.filter(r=>r!=="Administrator")),{
    title:`${prNo} waits for your approval`,body:`${str(f.material)} from ${str(f.selectedVendor)} at ${str(f.selectedRate)}`,
    reference:prNo,tone:"normal",detail:[{label:"Plan",value:plan.ref},{label:"Customer",value:plan.customer},
      {label:"Balance required",value:`${str(f.balanceRequired)} ${str(f.unit)}`}],
    action:"Open the plan in Accounts Receivable → Planning & Procurement and approve or reject the purchase.",
    module:"accountsreceived",recordId:plan.id},by);
}

export async function GET(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const found=await planFor(actor,str(new URL(req.url).searchParams.get("planId")));
    if(!found)return bad("That plan no longer exists",404);
    const db=await getDb();
    const lines=await db.select().from(wfPlanProcurement).where(eq(wfPlanProcurement.planId,found.plan.id))
      .orderBy(asc(wfPlanProcurement.createdAt));
    return Response.json({lines,canEdit:found.edit,canApprove:found.approver});
  }catch(e){return oops(e)}}

export async function POST(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const found=await planFor(actor,str(body.planId));
    if(!found)return bad("That plan no longer exists",404);
    if(!found.edit)return bad(`Procurement for a plan at ${found.plan.stage} cannot be changed by you.`,403);
    const f=await fieldsOf(body,found.plan.id);
    if(typeof f==="string")return bad(f,422);
    if(NEEDS_APPROVAL.includes(f.status))return bad(`A purchase must be approved before its status is ${f.status}.`,422);
    const{plan}=found;
    const row={...f,id:`PC-${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`,planId:plan.id,
      jobCode:plan.jobCode||plan.jobRef,projectName:plan.projectName||plan.description,prNo:await nextNumber("PR"),
      approval:"Pending",makerEmail:actor?.email||"",createdBy:actor?.email||"",createdAt:now(),updatedAt:now()};
    const db=await getDb();
    await writeWithAudit([db.insert(wfPlanProcurement).values(row as typeof wfPlanProcurement.$inferInsert)],actorOf(req,body),
      "planning",plan.id,"Purchase planned",`${plan.ref} · ${row.prNo} · ${row.material} · ${row.selectedVendor} @ ${row.selectedRate}`);
    for(const v of new Set([row.selectedVendor,...Q.map(q=>(row as Row)[`q${q}Vendor`])].map(v=>str(v)).filter(Boolean)))
      await rememberVendor(v,actor?.email);
    await askApproval(plan,row,row.prNo,actor?.email);
    return Response.json({line:row},{status:201});
  }catch(e){return oops(e)}}

/* Saving a purchase's details, or (`action: "approve"`) the checker's decision. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const body=await req.json() as Row;
    const db=await getDb();
    const[line]=await db.select().from(wfPlanProcurement).where(eq(wfPlanProcurement.id,str(body.id)));
    const found=line&&await planFor(actor,line.planId);
    if(!line||!found)return bad("That purchase no longer exists",404);
    const{plan}=found;

    if(str(body.action)==="approve"){
      if(!found.approver)return bad("Only management may approve a purchase.",403);
      if(lower(line.makerEmail)===lower(actor?.email))
        return bad("You set these terms, so someone else must approve them (maker-checker).",403);
      if(line.approval!=="Pending")return bad(`This purchase is already ${line.approval.toLowerCase()}.`,409);
      const decision=str(body.approval);
      if(decision!=="Approved"&&decision!=="Rejected")return bad("Choose Approved or Rejected.",422);
      const patch:Row={approval:decision,approvedByName:actor?.name||actor?.email||"",approvedByEmail:actor?.email||"",
        approvedAt:now(),updatedAt:now()};
      if(decision==="Approved"){
        if(!line.poNo)patch.poNo=await nextNumber("PO");
        if(!line.poDate)patch.poDate=now().slice(0,10);
        if(!NEEDS_APPROVAL.includes(line.status)&&line.status!=="Cancelled")patch.status="PO issued";
      }
      /* Guarded by the approval still being Pending, so two decisions cannot both land. */
      const res=await db.update(wfPlanProcurement).set(patch)
        .where(and(eq(wfPlanProcurement.id,line.id),eq(wfPlanProcurement.approval,"Pending")));
      if(!(res as unknown as{meta?:{changes?:number}}).meta?.changes)return bad("Somebody else decided this purchase first.",409);
      await writeWithAudit([],actorOf(req,body),"planning",plan.id,`Purchase ${decision.toLowerCase()}`,
        `${plan.ref} · ${line.prNo} · ${line.material}${patch.poNo?` · ${String(patch.poNo)}`:""}`);
      await notify([line.makerEmail,plan.pmEmail].filter(Boolean),{title:`${line.prNo} ${decision.toLowerCase()}`,
        body:`${line.material} from ${line.selectedVendor} at ${line.selectedRate}`,reference:line.prNo,
        tone:decision==="Approved"?"good":"warning",detail:[{label:"Plan",value:plan.ref},
          ...(patch.poNo?[{label:"PO number",value:String(patch.poNo)}]:[])],
        action:"Open the plan in Accounts Receivable → Planning & Procurement.",module:"accountsreceived",recordId:plan.id},actor?.email);
      return Response.json({line:{...line,...patch}});
    }

    if(!found.edit)return bad(`Procurement for a plan at ${found.plan.stage} cannot be changed by you.`,403);
    const f=await fieldsOf(body,plan.id);
    if(typeof f==="string")return bad(f,422);
    const changed=COMMERCIAL.some(k=>String((f as Row)[k]??"")!==String((line as Row)[k]??""));
    const approval=changed?"Pending":line.approval;
    if(NEEDS_APPROVAL.includes(f.status)&&approval!=="Approved")
      return bad(changed&&line.approval==="Approved"
        ?"These changes need a fresh approval, so the purchase cannot stay at "+f.status+". Set the status back and save."
        :`A purchase must be approved before its status is ${f.status}.`,422);
    const patch:Row={...f,updatedAt:now(),...(changed?{approval:"Pending",makerEmail:actor?.email||"",
      approvedByName:"",approvedByEmail:"",approvedAt:""}:{})};
    await writeWithAudit([db.update(wfPlanProcurement).set(patch).where(eq(wfPlanProcurement.id,line.id))],
      actorOf(req,body),"planning",plan.id,"Purchase updated",
      `${plan.ref} · ${line.prNo} · ${f.material} · ${f.status}${changed&&line.approval!=="Pending"?" · approval reset to Pending":""}`);
    for(const v of new Set([f.selectedVendor,...Q.map(q=>str((f as Row)[`q${q}Vendor`]))].filter(Boolean)))
      await rememberVendor(v,actor?.email);
    if(changed&&line.approval!=="Pending")await askApproval(plan,{...line,...patch},line.prNo,actor?.email);
    return Response.json({line:{...line,...patch}});
  }catch(e){return oops(e)}}

/* A purchase may be removed until it is approved; after that it is a record of an order. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await requireAuth(req,"read");
    if(response)return response;
    const id=str(new URL(req.url).searchParams.get("id"));
    const db=await getDb();
    const[line]=await db.select().from(wfPlanProcurement).where(eq(wfPlanProcurement.id,id));
    const found=line&&await planFor(actor,line.planId);
    if(!line||!found)return bad("That purchase no longer exists",404);
    if(!found.edit)return bad(`Procurement for a plan at ${found.plan.stage} cannot be changed by you.`,403);
    if(line.approval==="Approved")return bad("An approved purchase cannot be removed. Set its status to Cancelled instead.",409);
    await writeWithAudit([db.delete(wfPlanProcurement).where(and(eq(wfPlanProcurement.id,id),eq(wfPlanProcurement.planId,line.planId)))],
      actorOf(req),"planning",line.planId,"Purchase removed",`${found.plan.ref} · ${line.prNo} · ${line.material}`);
    return Response.json({ok:true});
  }catch(e){return oops(e)}}
