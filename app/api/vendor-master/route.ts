import{and,asc,desc,eq,ne,sql}from"drizzle-orm";
import{getDb}from"../../../db";
import{settingOptions,wfAttachments,wfCompanies,wfLogs,wfVendorMaster}from"../../../db/schema";
import{companyLock,currentActor,inCompany}from"../../../lib/auth";
import type{Actor}from"../../../lib/auth";
import{emailsForRoles,notify}from"../../../lib/notify";
import{deleteFile,getFile,putFile,storageLimit}from"../../../lib/storage";
import{setVendorOffered}from"../../../lib/vendors";
import{ACCOUNT_TYPES,BANK_PROOF,BASE_CURRENCIES,COUNTRIES,DEFAULT_CATEGORIES,DEFAULT_TDS_SECTIONS,DOC_KINDS,FIELDS,FIELD_KEYS,
  FULL_BANK_ROLES,GST_REG_TYPES,MOVE,MOVE_FROM,PAYMENT_TERMS,REQUIRED_TO_LEAVE,STATES_BY_COUNTRY,VENDOR_SOURCES,VENDOR_TYPES,
  YES_NO,YES_NO_NA,editableSections,formatErrors,holderMatches,isProcurement,maskAccount,mayView,missingFields,movesFor,
  sameName,termDays}from"../../../lib/vendor-master";
import type{Choices,Move,VendorStatus}from"../../../lib/vendor-master";
import{bad,oops,str,writeWithAudit}from"../../../lib/workforce-api";
import type{Row}from"../../../lib/workforce-api";

/* Vendor Master. Every rule is decided here, whatever the screen offered: who may act at
   a status, which sections they may change, what must be filled in before the vendor
   moves on, the duplicate checks, and maker-checker at final approval.

   The module is reached by procurement as well, whose logins often hold only Material
   roles, so it checks its own roles rather than requiring payment access. */

type Db=Awaited<ReturnType<typeof getDb>>;
type Vendor=typeof wfVendorMaster.$inferSelect;
const now=()=>new Date().toISOString();
const lower=(v:unknown)=>str(v).trim().toLowerCase();

async function signedIn(req:Request):Promise<{actor:Actor|null;response:Response|null}>{
  const actor=await currentActor(req);
  if(!actor)return{actor:null,response:bad("Sign in to continue.",401)};
  if(!mayView(actor.roles))return{actor,response:bad("Your role does not include the Vendor Master.",403)};
  return{actor,response:null}}

/* The dropdowns that come from the database: companies, and the two Settings lists. */
async function choices(db:Db){
  const companies=(await db.select({id:wfCompanies.id,name:wfCompanies.name,active:wfCompanies.active}).from(wfCompanies)
    .orderBy(asc(wfCompanies.name))).filter(c=>c.active).map(({id,name})=>({id,name}));
  const opts=await db.select({listId:settingOptions.listId,name:settingOptions.name}).from(settingOptions)
    .where(eq(settingOptions.active,1)).orderBy(asc(settingOptions.position));
  const list=(id:string,fallback:string[])=>{const l=opts.filter(o=>o.listId===id).map(o=>o.name);return l.length?l:fallback};
  /* The four currencies the specification names, and any other the payment form uses. */
  const currencies=[...new Set([...BASE_CURRENCIES,...list("payment.currency",[])])];
  return{companies,categories:list("vendor.category",DEFAULT_CATEGORIES),tdsSections:list("vendor.tdsSection",DEFAULT_TDS_SECTIONS),
    currencies,docKinds:DOC_KINDS}}

const fixed:Partial<Record<Choices,string[]>>={vendorTypes:VENDOR_TYPES,yesNo:YES_NO,yesNoNa:YES_NO_NA,gstTypes:GST_REG_TYPES,
  accountTypes:ACCOUNT_TYPES,terms:PAYMENT_TERMS,sources:VENDOR_SOURCES,countries:COUNTRIES};

const values=(v:Vendor)=>Object.fromEntries(FIELD_KEYS.map(k=>[k,str((v as Row)[k])])) as Record<string,string>;

/* What a reader is shown. The account number is masked for anybody who only reads. */
const shown=(v:Vendor,roles:string[])=>roles.some(r=>FULL_BANK_ROLES.includes(r))?v:{...v,accountNumber:maskAccount(v.accountNumber)};

async function docsOf(db:Db,id:string){
  return db.select({id:wfAttachments.id,kind:wfAttachments.kind,fileName:wfAttachments.fileName,mime:wfAttachments.mime,
    bytes:wfAttachments.bytes,uploadedBy:wfAttachments.uploadedBy,uploadedAt:wfAttachments.uploadedAt}).from(wfAttachments)
    .where(and(eq(wfAttachments.entityType,"vendor"),eq(wfAttachments.entityId,id))).orderBy(desc(wfAttachments.uploadedAt))}

async function load(db:Db,id:string,actor:Actor){
  const[v]=await db.select().from(wfVendorMaster).where(eq(wfVendorMaster.id,id));
  if(!v||!inCompany(await companyLock(actor),{id:v.companyId,name:v.companyName}))return null;
  return v}

/* Cleans what was typed, and fills in what follows from other answers, before it is
   checked: a vendor not registered for GST has no GSTIN, a 30 Days term is 30 days. */
function tidy(v:Record<string,string>){
  const out:Record<string,string>={};
  for(const k of FIELD_KEYS)out[k]=str(v[k]).replace(k==="address"||k==="holderExplanation"?/[ \t]+/g:/\s+/g," ").trim();
  for(const k of["pan","gstin","ifsc","udyamNo","cinNo"])out[k]=out[k].toUpperCase().replace(/\s/g,"");
  out.accountNumber=out.accountNumber.replace(/\s/g,"").toUpperCase();
  out.email=out.email.toLowerCase();
  if(!out.country)out.country="India";
  if(out.gstRegistered==="No"){out.gstin="";out.gstRegType="Unregistered"}
  if(out.tdsApplicable==="No")out.tdsSection="";
  if(out.msmeRegistered==="No")out.udyamNo="";
  if(out.retentionApplicable!=="Yes")out.retentionPercent="";
  const days=termDays(out.paymentTerms);
  if(days!==null)out.creditDays=String(days);
  if(out.accountHolder&&holderMatches(out))out.holderExplanation="";
  return out}

/* Every check that holds whatever the status: the dropdowns hold one of their choices,
   the formats are right, and the vendor is not already registered for the company. */
async function problems(db:Db,v:Record<string,string>,selfId:string){
  const c=await choices(db);
  const lists:Partial<Record<Choices,string[]>>={...fixed,categories:c.categories,tds:c.tdsSections,currencies:c.currencies,
    companies:c.companies.map(x=>x.id),states:STATES_BY_COUNTRY[v.country]};
  const out:string[]=[];
  for(const f of FIELDS){
    const list=f.choices&&lists[f.choices];
    if(f.type==="select"&&list&&v[f.key]&&!list.includes(v[f.key]))out.push(`${f.label} must be one of the listed choices.`);
  }
  out.push(...formatErrors(v));
  if(out.length)return out;
  const others=(await db.select({id:wfVendorMaster.id,code:wfVendorMaster.vendorCode,legalName:wfVendorMaster.legalName,
    gstin:wfVendorMaster.gstin,accountNumber:wfVendorMaster.accountNumber,ifsc:wfVendorMaster.ifsc,status:wfVendorMaster.status})
    .from(wfVendorMaster).where(and(eq(wfVendorMaster.companyId,v.companyId),ne(wfVendorMaster.status,"Rejected"),ne(wfVendorMaster.id,selfId))));
  const same=others.find(o=>sameName(o.legalName,v.legalName));
  if(same)out.push(`${same.code} is already registered for this company as ${same.legalName} (${same.status}).`);
  const gst=v.gstin&&others.find(o=>o.gstin===v.gstin);
  if(gst)out.push(`GSTIN ${v.gstin} is already on ${gst.code} - ${gst.legalName}.`);
  const acct=v.accountNumber&&others.find(o=>o.accountNumber===v.accountNumber&&o.ifsc===v.ifsc);
  if(acct)out.push(`That bank account is already on ${acct.code} - ${acct.legalName}.`);
  return out}

const columns=(v:Record<string,string>,companies:{id:string;name:string}[])=>
  ({...v,companyName:companies.find(c=>c.id===v.companyId)?.name||""});

/* Suppliers brought over from Material Management keep their own numbers (V-0200); only VEN- ones count here. */
async function nextCode(db:Db){
  const[top]=await db.select({n:sql<string>`max(cast(substr(${wfVendorMaster.vendorCode},5) as integer))`}).from(wfVendorMaster)
    .where(sql`${wfVendorMaster.vendorCode} like 'VEN-%'`);
  return`VEN-${String((Number(top?.n)||0)+1).padStart(6,"0")}`}

/* Who to tell when a vendor arrives at a status. A role nobody holds falls back to the
   administrators, so a vendor never waits on an empty inbox. */
async function inbox(status:VendorStatus,v:Vendor){
  const roles:Partial<Record<VendorStatus,string[]>>={"Procurement Verification":["Procurement","Procurement Manager"],
    "Accounts Verification":["Accountant"],"Pending Approval":["Accountant"]};
  const named=roles[status];
  if(named){const to=await emailsForRoles(named);return to.length?to:await emailsForRoles(["Administrator"])}
  return v.createdByEmail?[v.createdByEmail]:[]}

export async function GET(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response||!actor)return response!;
    const url=new URL(req.url);
    const db=await getDb();
    const id=url.searchParams.get("id")||"";
    const file=url.searchParams.get("file")||"";
    if(id){
      const v=await load(db,id,actor);
      if(!v)return bad("That vendor is not on the register.",404);
      if(file){
        const[a]=await db.select().from(wfAttachments).where(and(eq(wfAttachments.id,file),
          eq(wfAttachments.entityType,"vendor"),eq(wfAttachments.entityId,id)));
        if(!a)return bad("Not found",404);
        const bytes=await getFile(a.storageKey);
        if(!bytes)return bad("The file is no longer in storage",410);
        return new Response(bytes as unknown as BodyInit,{headers:{"content-type":a.mime,"content-length":String(bytes.length),
          "content-disposition":`inline; filename="${a.fileName.replace(/"/g,"")}"`,"cache-control":"private, max-age=3600"}});
      }
      const history=await db.select().from(wfLogs).where(and(eq(wfLogs.entity,"vendor"),eq(wfLogs.entityId,id))).orderBy(asc(wfLogs.at));
      const creator=lower(v.createdByEmail)===lower(actor.email);
      return Response.json({vendor:shown(v,actor.roles),history,documents:await docsOf(db,id),
        moves:movesFor(v.status,actor.roles,creator),editable:editableSections(v.status,actor.roles),
        canDelete:v.status==="Draft"&&!v.submittedAt&&isProcurement(actor.roles)});
    }
    const lock=await companyLock(actor);
    const rows=(await db.select({id:wfVendorMaster.id,vendorCode:wfVendorMaster.vendorCode,status:wfVendorMaster.status,
      legalName:wfVendorMaster.legalName,tradeName:wfVendorMaster.tradeName,vendorType:wfVendorMaster.vendorType,
      vendorCategory:wfVendorMaster.vendorCategory,companyId:wfVendorMaster.companyId,companyName:wfVendorMaster.companyName,
      city:wfVendorMaster.city,country:wfVendorMaster.country,contactPerson:wfVendorMaster.contactPerson,mobile:wfVendorMaster.mobile,
      gstin:wfVendorMaster.gstin,pan:wfVendorMaster.pan,statusNote:wfVendorMaster.statusNote,createdBy:wfVendorMaster.createdBy,
      updatedAt:wfVendorMaster.updatedAt}).from(wfVendorMaster).orderBy(desc(wfVendorMaster.updatedAt)))
      .filter(v=>inCompany(lock,{id:v.companyId,name:v.companyName}));
    return Response.json({vendors:rows,choices:await choices(db),roles:actor.roles,canCreate:isProcurement(actor.roles)});
  }catch(e){return oops(e)}}

/* A new vendor, as a draft (`action` omitted), or a document added to one (`action: "upload"`). */
export async function POST(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response||!actor)return response!;
    const body=await req.json() as Row;
    const db=await getDb();
    const who=actor.name||actor.email;
    if(str(body.action)==="upload"){
      const v=await load(db,str(body.id),actor);
      if(!v)return bad("That vendor is not on the register.",404);
      if(!editableSections(v.status,actor.roles).length)return bad(`Documents cannot be added to a vendor at ${v.status} by your role.`,403);
      const kind=str(body.kind);
      if(!DOC_KINDS.includes(kind))return bad(`Document type must be one of ${DOC_KINDS.join(", ")}.`,422);
      const fileName=str(body.fileName).slice(0,200);
      const match=/^data:([^;,]*)(?:;[^,;]*)*;base64,(.*)$/.exec(str(body.dataUrl));
      if(!fileName||!match||!match[2])return bad("Choose a file to upload.",422);
      const ext=(/\.([a-z0-9]+)$/i.exec(fileName)||[])[1]?.toLowerCase()||"";
      const byExt:Record<string,string>={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
        heic:"image/heic",heif:"image/heif"};
      const mime=/^(image\/|application\/pdf$)/.test(match[1])?match[1]:byExt[ext]||"";
      if(!mime)return bad(`${fileName}: upload a PDF or a photo of the document.`,415);
      const data=match[2];
      const bytes=Math.floor(data.length*3/4)-((/=+$/.exec(data)||[""])[0].length);
      const limit=await storageLimit();
      if(bytes>limit)return bad(`That file is ${Math.round(bytes/1024)} KB; the limit is ${Math.round(limit/1024)} KB.`,413);
      const attId=`AT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      const storageKey=await putFile(attId,data);
      await writeWithAudit([db.insert(wfAttachments).values({id:attId,entityType:"vendor",entityId:v.id,kind,fileName,mime,bytes,
        storageKey,note:"",uploadedBy:who,uploadedAt:now()})],who,"vendor",v.id,"Document uploaded",`${kind} · ${fileName}`);
      return Response.json({documents:await docsOf(db,v.id)},{status:201});
    }
    if(!isProcurement(actor.roles))return bad("Only procurement registers a new vendor.",403);
    const c=await choices(db);
    const v=tidy(body as Record<string,string>);
    if(!v.legalName)return bad("Enter the vendor's legal name.",422);
    if(!v.companyId)return bad("Choose the company / entity the vendor is registered for.",422);
    if(!inCompany(await companyLock(actor),{id:v.companyId}))return bad("You cannot register vendors for that company.",403);
    const wrong=await problems(db,v,"");
    if(wrong.length)return bad(wrong.join(" "),422);
    const at=now();
    for(let attempt=0;;attempt++){
      const id=`VM-${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
      const vendorCode=await nextCode(db);
      try{
        await writeWithAudit([db.insert(wfVendorMaster).values({...columns(v,c.companies),id,vendorCode,legalName:v.legalName,
          status:"Draft",createdBy:who,createdByEmail:actor.email,createdAt:at,updatedAt:at})],who,"vendor",id,"Registered as draft",
          `${vendorCode} · ${v.legalName}`);
        const[saved]=await db.select().from(wfVendorMaster).where(eq(wfVendorMaster.id,id));
        return Response.json({vendor:saved},{status:201});
      }catch(e){
        // Two people registering at the same moment drew the same number; draw again.
        if(attempt<2&&/UNIQUE/i.test(String(e)))continue;
        throw e}
    }
  }catch(e){return oops(e)}}

/* Saving the form (`action: "save"`), or moving the vendor on (`action`: one of MOVE). A
   move carries the form too, so pressing Submit saves what is on the screen first. */
export async function PATCH(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response||!actor)return response!;
    const body=await req.json() as Row;
    const db=await getDb();
    const v=await load(db,str(body.id),actor);
    if(!v)return bad("That vendor is not on the register.",404);
    const who=actor.name||actor.email;
    const action=str(body.action,"save");
    const from=v.status as VendorStatus;
    const c=await choices(db);

    /* The form: only the sections this person may change at this status are taken. */
    let merged=values(v);
    const sent=(body.fields&&typeof body.fields==="object"?body.fields:{}) as Record<string,string>;
    const may=editableSections(from,actor.roles);
    const changed=FIELDS.filter(f=>may.includes(f.section)&&f.key in sent&&str(sent[f.key])!==merged[f.key]);
    if(action==="save"&&!may.length)return bad(`Your role cannot change a vendor at ${from}.`,403);
    if(changed.length){
      merged=tidy({...merged,...Object.fromEntries(changed.map(f=>[f.key,str(sent[f.key])]))});
      if(!merged.legalName)return bad("Enter the vendor's legal name.",422);
      if(!merged.companyId)return bad("Choose the company / entity.",422);
      if(!inCompany(await companyLock(actor),{id:merged.companyId}))return bad("You cannot register vendors for that company.",403);
      const wrong=await problems(db,merged,v.id);
      if(wrong.length)return bad(wrong.join(" "),422);
    }
    const formPatch=changed.length?{...columns(merged,c.companies),legalName:merged.legalName}:{};

    if(action==="save"){
      if(!changed.length)return Response.json({vendor:shown(v,actor.roles)});
      const res=await db.update(wfVendorMaster).set({...formPatch,updatedAt:now()})
        .where(and(eq(wfVendorMaster.id,v.id),eq(wfVendorMaster.status,from)));
      if((res as{meta?:{changes?:number}})?.meta?.changes===0)return bad("Somebody else moved this vendor. Reopen it.",409);
      await writeWithAudit([],who,"vendor",v.id,"Details updated",changed.map(f=>f.label).join(", "));
      const[saved]=await db.select().from(wfVendorMaster).where(eq(wfVendorMaster.id,v.id));
      return Response.json({vendor:shown(saved,actor.roles)});
    }

    if(!(action in MOVE))return bad("Unknown action");
    const move=action as Move;
    const creator=lower(v.createdByEmail)===lower(actor.email);
    if(!MOVE_FROM[move].includes(from))return bad(`This vendor is ${from}. Reopen it to see where it is now.`,409);
    if(!movesFor(from,actor.roles,creator).includes(move))
      return bad(move==="approve"&&creator?"You registered this vendor, so another authorised approver must approve it (maker-checker)."
        :`Your role cannot act on a vendor at ${from}.`,403);
    const note=str(body.note).trim();
    if(MOVE[move].note&&!note)return bad("Give the reason.",422);

    /* What must be in place before the vendor moves on. */
    const forward=["submit","toVerification","procVerify","accVerify","approve"].includes(move);
    if(forward){
      const missing=missingFields(merged,REQUIRED_TO_LEAVE[from]||[]);
      if(missing.length)return bad(`Fill in ${missing.join(", ")} first.`,422);
      const wrong=await problems(db,merged,v.id);
      if(wrong.length)return bad(wrong.join(" "),422);
      const docs=await docsOf(db,v.id);
      if(move==="toVerification"&&!docs.length)return bad("Upload the vendor's supporting documents first.",422);
      if((move==="accVerify"||move==="approve")&&!docs.some(d=>d.kind===BANK_PROOF))
        return bad("Upload the cancelled cheque or bank proof first - it is required before activation.",422);
    }

    const to=MOVE[move].to;
    const at=now();
    const patch:Row={...formPatch,status:to,updatedAt:at,statusNote:forward?"":note};
    if(move==="submit")patch.submittedAt=at;
    if(move==="procVerify")Object.assign(patch,{procVerifiedBy:who,procVerifiedAt:at});
    if(move==="accVerify")Object.assign(patch,{accountsVerifiedBy:who,accountsVerifiedAt:at});
    if(move==="approve")Object.assign(patch,{approvedBy:who,approvedByEmail:actor.email,approvedAt:at});
    const res=await db.update(wfVendorMaster).set(patch).where(and(eq(wfVendorMaster.id,v.id),eq(wfVendorMaster.status,from)));
    if((res as{meta?:{changes?:number}})?.meta?.changes===0)return bad("Somebody else moved this vendor. Reopen it.",409);
    await writeWithAudit([],who,"vendor",v.id,`${from} → ${to}`,[changed.length?`Updated ${changed.map(f=>f.label).join(", ")}`:"",note].filter(Boolean).join(" · "));
    const[saved]=await db.select().from(wfVendorMaster).where(eq(wfVendorMaster.id,v.id));

    /* Activation makes the vendor available to POs and payment requests; leaving Active
       takes it out, unless the same name is active for another company. */
    if(to==="Active")await setVendorOffered(saved.legalName,true,actor.email);
    else if(from==="Active"){
      const[still]=await db.select({id:wfVendorMaster.id}).from(wfVendorMaster)
        .where(and(eq(wfVendorMaster.status,"Active"),sql`lower(${wfVendorMaster.legalName}) = ${saved.legalName.toLowerCase()}`)).limit(1);
      if(!still)await setVendorOffered(saved.legalName,false);
    }

    const ask:Partial<Record<VendorStatus,string>>={
      "Procurement Verification":"Verify the vendor's identity, category, due diligence and commercial information.",
      "Accounts Verification":"Verify the PAN, GST, TDS, MSME, bank details and payment terms against the documents.",
      "Pending Approval":"Review the verified vendor and approve its activation, or return it.",
      "Active":"The vendor is active and can now be used in POs and payment requests.",
      "Returned":"Correct the vendor's details and submit it again.",
      "Rejected":"Nothing further is needed; the registration was rejected."};
    const tell=await inbox(to,saved);
    if(to!=="Submitted"&&tell.length)await notify(tell,{title:`${saved.vendorCode} ${saved.legalName}: ${to}`,
      body:note||`${saved.companyName} · ${saved.vendorType}`,reference:saved.vendorCode,
      tone:["Returned","Rejected","Suspended","Blocked"].includes(to)?"warning":to==="Active"?"good":"normal",
      detail:[{label:"Vendor",value:saved.legalName},{label:"Company",value:saved.companyName},{label:"Status",value:to},
        ...(note?[{label:"Reason",value:note}]:[])],
      action:ask[to]||`The vendor is now ${to}.`,module:"vendors",recordId:saved.id},actor.email);
    return Response.json({vendor:shown(saved,actor.roles)});
  }catch(e){return oops(e)}}

/* A document removed (`file`), or a draft that was never submitted deleted. */
export async function DELETE(req:Request){
  try{
    const{actor,response}=await signedIn(req);
    if(response||!actor)return response!;
    const url=new URL(req.url);
    const db=await getDb();
    const v=await load(db,url.searchParams.get("id")||"",actor);
    if(!v)return bad("That vendor is not on the register.",404);
    const who=actor.name||actor.email;
    const file=url.searchParams.get("file")||"";
    if(file){
      if(!editableSections(v.status,actor.roles).length)return bad(`Documents cannot be removed from a vendor at ${v.status} by your role.`,403);
      const[a]=await db.select().from(wfAttachments).where(and(eq(wfAttachments.id,file),
        eq(wfAttachments.entityType,"vendor"),eq(wfAttachments.entityId,v.id)));
      if(!a)return bad("Not found",404);
      await deleteFile(a.storageKey);
      await writeWithAudit([db.delete(wfAttachments).where(eq(wfAttachments.id,a.id))],who,"vendor",v.id,"Document removed",`${a.kind} · ${a.fileName}`);
      return Response.json({documents:await docsOf(db,v.id)});
    }
    if(!(v.status==="Draft"&&!v.submittedAt&&isProcurement(actor.roles)))
      return bad("Only a draft that was never submitted can be deleted. Reject it instead.",403);
    for(const a of await docsOf(db,v.id)){
      const[row]=await db.select({key:wfAttachments.storageKey}).from(wfAttachments).where(eq(wfAttachments.id,a.id));
      if(row)await deleteFile(row.key);
    }
    await writeWithAudit([db.delete(wfAttachments).where(and(eq(wfAttachments.entityType,"vendor"),eq(wfAttachments.entityId,v.id))),
      db.delete(wfVendorMaster).where(and(eq(wfVendorMaster.id,v.id),eq(wfVendorMaster.status,"Draft")))],
      who,"vendor",v.id,"Draft deleted",`${v.vendorCode} · ${v.legalName}`);
    return Response.json({deleted:true});
  }catch(e){return oops(e)}}
