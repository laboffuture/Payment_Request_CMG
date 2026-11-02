/* Vendor Master: the register of the vendors the group buys from and pays, each one
   registered, verified and approved before it can be used.

   The flow, as the business sets it out:
     1 New Vendor Registration   Procurement           Draft                    -> Submit
     2 Document Upload           Procurement           Submitted                -> Procurement Verification
     3 Procurement Verification  Procurement           Procurement Verification -> Accounts Verification
     4 Accounts Verification     Accounts              Accounts Verification    -> Final Approval
     5 Final Approval            Accounts              Pending Approval         -> Active
     6 Vendor Activation         System                Active                   -> PO / Payment Request

   A status is the step a vendor is waiting at. Held in one place so the API route and the
   screen read the same fields, the same rules and the same flow; the server checks every
   one of them again. */

export const STATUSES=["Draft","Submitted","Procurement Verification","Accounts Verification","Pending Approval",
  "Active","Returned","Rejected","Suspended","Blocked","Inactive","Expired"] as const;
export type VendorStatus=typeof STATUSES[number];

/* The six steps, in order, for the flow strip on the screen. */
export const FLOW:{status:VendorStatus;step:string;who:string}[]=[
  {status:"Draft",step:"New vendor registration",who:"Procurement"},
  {status:"Submitted",step:"Document upload",who:"Procurement"},
  {status:"Procurement Verification",step:"Procurement verification",who:"Procurement"},
  {status:"Accounts Verification",step:"Accounts verification",who:"Accounts"},
  {status:"Pending Approval",step:"Final approval",who:"Accounts"},
  {status:"Active",step:"Vendor activation",who:"System"}];

/* After Active, the states a vendor may be put in, and back again. */
export const HOLDS=["Suspended","Blocked","Inactive","Expired"] as const;

export const PROCUREMENT_ROLES=["Procurement","Procurement Manager","Administrator"];
export const ACCOUNTS_ROLES=["Accountant","Administrator"];
export const APPROVER_ROLES=["Management","Management (Material)","Administrator"];
/* Who opens the module. Finance and audit read it; the account number is masked for them. */
export const VIEW_ROLES=[...new Set([...PROCUREMENT_ROLES,...ACCOUNTS_ROLES,...APPROVER_ROLES,"Finance","Auditor","Audit Head"])];
export const FULL_BANK_ROLES=[...new Set([...PROCUREMENT_ROLES,...ACCOUNTS_ROLES,...APPROVER_ROLES])];

const any=(roles:string[],list:string[])=>roles.some(r=>list.includes(r));
export const isProcurement=(roles:string[]=[])=>any(roles,PROCUREMENT_ROLES);
export const isAccounts=(roles:string[]=[])=>any(roles,ACCOUNTS_ROLES);
export const isApprover=(roles:string[]=[])=>any(roles,APPROVER_ROLES);
export const mayView=(roles:string[]=[])=>any(roles,VIEW_ROLES);

export const SECTIONS=["Basic Information","Tax & Statutory","Bank Details","Commercial","Due Diligence"] as const;
export type Section=typeof SECTIONS[number];

/* The fixed dropdowns. Vendor category and TDS section are kept under Settings instead,
   because they are the business's own vocabulary. */
export const VENDOR_TYPES=["Supplier","Contractor","Subcontractor","Service Provider","Consultant","Professional","Transporter","Other"];
export const YES_NO=["Yes","No"];
export const YES_NO_NA=["Yes","No","N/A"];
export const GST_REG_TYPES=["Regular","Composition","SEZ","Unregistered","Other"];
export const ACCOUNT_TYPES=["Current","Savings","Other"];
export const BASE_CURRENCIES=["AED","INR","USD","QAR"];
export const PAYMENT_TERMS=["Immediate","7 Days","15 Days","30 Days","45 Days","60 Days","90 Days","Milestone","Contract"];
export const VENDOR_SOURCES=["Existing","Project Requirement","Sourcing","Management Recommendation","Tender","Other"];
export const DOC_KINDS=["Cancelled cheque / bank proof","PAN card","GST certificate","MSME / Udyam certificate",
  "Company registration / CIN","Quotation / comparison","Site visit report","Other"];
export const BANK_PROOF=DOC_KINDS[0];
export const DEFAULT_CATEGORIES=["Civil materials","Steel & metals","Cement & aggregates","Electrical","Plumbing","MEP",
  "Interiors & furniture","Hardware & tools","Paints & finishes","IT & electronics","Office supplies","Labour supply",
  "Equipment rental","Logistics","Professional services","Food & kitchen","Other"];
export const DEFAULT_TDS_SECTIONS=["194C - Contractors","194J - Professional / technical fees","194I - Rent",
  "194H - Commission / brokerage","194Q - Purchase of goods","194A - Interest","195 - Non-resident payments","Other"];

/* The credit period a payment term stands for; Milestone and Contract are entered. */
export const termDays=(terms:string):number|null=>terms==="Immediate"?0:/^(\d+) Days$/.test(terms)?Number(terms.split(" ")[0]):null;

export type Owner="Procurement"|"Accounts";
export type FieldType="text"|"long"|"select"|"number"|"email"|"tel";
export type Choices="vendorTypes"|"categories"|"companies"|"countries"|"states"|"yesNo"|"yesNoNa"|"gstTypes"|"tds"|
  "accountTypes"|"currencies"|"terms"|"sources";
export type Field={key:string;label:string;section:Section;type:FieldType;owner:Owner;choices?:Choices;
  /* Yes, or a test of the other answers for a conditional field. */
  required:boolean|((v:Record<string,string>)=>boolean);hint?:string;sensitive?:boolean};

const india=(v:Record<string,string>)=>(v.country||"India")==="India";

export const FIELDS:Field[]=[
  {key:"legalName",label:"Vendor legal name",section:"Basic Information",type:"text",owner:"Procurement",required:true,hint:"Checked for duplicates"},
  {key:"tradeName",label:"Trade name",section:"Basic Information",type:"text",owner:"Procurement",required:false},
  {key:"vendorType",label:"Vendor type",section:"Basic Information",type:"select",owner:"Procurement",choices:"vendorTypes",required:true},
  {key:"vendorCategory",label:"Vendor category",section:"Basic Information",type:"select",owner:"Procurement",choices:"categories",required:true},
  {key:"companyId",label:"Company / entity",section:"Basic Information",type:"select",owner:"Procurement",choices:"companies",required:true},
  {key:"country",label:"Country",section:"Basic Information",type:"select",owner:"Procurement",choices:"countries",required:true},
  {key:"state",label:"State",section:"Basic Information",type:"select",owner:"Procurement",choices:"states",required:true},
  {key:"city",label:"City",section:"Basic Information",type:"text",owner:"Procurement",required:true},
  {key:"address",label:"Registered address",section:"Basic Information",type:"long",owner:"Procurement",required:true},
  {key:"contactPerson",label:"Contact person",section:"Basic Information",type:"text",owner:"Procurement",required:true},
  {key:"mobile",label:"Mobile number",section:"Basic Information",type:"tel",owner:"Procurement",required:true},
  {key:"email",label:"Email ID",section:"Basic Information",type:"email",owner:"Procurement",required:true},
  {key:"website",label:"Website",section:"Basic Information",type:"text",owner:"Procurement",required:false},

  {key:"pan",label:"PAN",section:"Tax & Statutory",type:"text",owner:"Accounts",required:true,hint:"Outside India: the tax registration number"},
  {key:"gstRegistered",label:"GST registered",section:"Tax & Statutory",type:"select",owner:"Accounts",choices:"yesNo",required:true},
  {key:"gstin",label:"GSTIN",section:"Tax & Statutory",type:"text",owner:"Accounts",required:v=>v.gstRegistered==="Yes",hint:"Mandatory if GST registered"},
  {key:"gstRegType",label:"GST registration type",section:"Tax & Statutory",type:"select",owner:"Accounts",choices:"gstTypes",required:v=>v.gstRegistered==="Yes"},
  {key:"tdsApplicable",label:"TDS applicable",section:"Tax & Statutory",type:"select",owner:"Accounts",choices:"yesNo",required:india},
  {key:"tdsSection",label:"TDS section",section:"Tax & Statutory",type:"select",owner:"Accounts",choices:"tds",required:v=>v.tdsApplicable==="Yes",hint:"Mandatory if TDS applicable"},
  {key:"msmeRegistered",label:"MSME registered",section:"Tax & Statutory",type:"select",owner:"Accounts",choices:"yesNo",required:true},
  {key:"udyamNo",label:"Udyam / MSME number",section:"Tax & Statutory",type:"text",owner:"Accounts",required:v=>v.msmeRegistered==="Yes",hint:"Mandatory if MSME registered"},
  {key:"cinNo",label:"CIN / registration number",section:"Tax & Statutory",type:"text",owner:"Accounts",required:false,hint:"Where the entity type has one"},

  {key:"bankName",label:"Bank name",section:"Bank Details",type:"text",owner:"Accounts",required:true,hint:"Verified against the bank proof"},
  {key:"bankBranch",label:"Branch",section:"Bank Details",type:"text",owner:"Accounts",required:true},
  {key:"accountHolder",label:"Account holder name",section:"Bank Details",type:"text",owner:"Accounts",required:true,hint:"Should match the legal or trade name"},
  {key:"holderExplanation",label:"Why the account holder name differs",section:"Bank Details",type:"long",owner:"Accounts",
    required:v=>!!v.accountHolder&&!holderMatches(v),hint:"Needed when the holder name is not the vendor's name"},
  {key:"accountNumber",label:"Account number",section:"Bank Details",type:"text",owner:"Accounts",required:true,sensitive:true},
  {key:"ifsc",label:"IFSC",section:"Bank Details",type:"text",owner:"Accounts",required:true,hint:"Outside India: SWIFT / IBAN"},
  {key:"accountType",label:"Account type",section:"Bank Details",type:"select",owner:"Accounts",choices:"accountTypes",required:true},

  {key:"currency",label:"Currency",section:"Commercial",type:"select",owner:"Accounts",choices:"currencies",required:true},
  {key:"paymentTerms",label:"Payment terms",section:"Commercial",type:"select",owner:"Accounts",choices:"terms",required:true},
  {key:"creditDays",label:"Credit period (days)",section:"Commercial",type:"number",owner:"Accounts",required:true,hint:"Follows the payment terms"},
  {key:"advanceAllowed",label:"Advance allowed",section:"Commercial",type:"select",owner:"Accounts",choices:"yesNo",required:true},
  {key:"retentionApplicable",label:"Retention applicable",section:"Commercial",type:"select",owner:"Accounts",choices:"yesNo",required:false},
  {key:"retentionPercent",label:"Retention %",section:"Commercial",type:"number",owner:"Accounts",required:v=>v.retentionApplicable==="Yes",hint:"Mandatory if retention applies"},

  {key:"vendorSource",label:"Vendor source",section:"Due Diligence",type:"select",owner:"Procurement",choices:"sources",required:true},
  {key:"quotationComparison",label:"Quotation / commercial comparison",section:"Due Diligence",type:"select",owner:"Procurement",choices:"yesNoNa",required:true},
  {key:"siteVisit",label:"Vendor site visit completed",section:"Due Diligence",type:"select",owner:"Procurement",choices:"yesNoNa",required:true},
];
export const FIELD_KEYS=FIELDS.map(f=>f.key);
export const fieldLabel=(k:string)=>FIELDS.find(f=>f.key===k)?.label||k;
export const isRequired=(f:Field,v:Record<string,string>)=>typeof f.required==="function"?f.required(v):f.required;

/* "M/s. Sri Sai Enterprises" and "SRI SAI ENTERPRISES" are the same name. */
const squash=(s:string)=>(s||"").toLowerCase().replace(/^m\/?s\.?\s*/,"").replace(/[^a-z0-9]/g,"");
export const sameName=(a:string,b:string)=>!!squash(a)&&squash(a)===squash(b);
export function holderMatches(v:Record<string,string>){
  return sameName(v.accountHolder,v.legalName)||sameName(v.accountHolder,v.tradeName)}

/* The sections each step requires before the vendor moves on, building up: what was
   required to leave an earlier step is still required later. */
export const REQUIRED_TO_LEAVE:Partial<Record<VendorStatus,Section[]>>={
  "Draft":["Basic Information","Commercial"],
  "Returned":["Basic Information","Commercial"],
  "Submitted":["Basic Information","Commercial"],
  "Procurement Verification":["Basic Information","Commercial","Due Diligence"],
  "Accounts Verification":[...SECTIONS],
  "Pending Approval":[...SECTIONS]};

export function missingFields(v:Record<string,string>,sections:readonly Section[]){
  return FIELDS.filter(f=>sections.includes(f.section)&&isRequired(f,v)&&!String(v[f.key]??"").trim()).map(f=>f.label)}

/* Format checks on what has been entered, empty fields aside. India's formats are strict;
   elsewhere the same fields hold the local tax number and SWIFT or IBAN. */
export function formatErrors(v:Record<string,string>){
  const out:string[]=[];
  const t=(k:string)=>String(v[k]??"").trim();
  const inIndia=india(v);
  const mobile=t("mobile").replace(/[\s()-]/g,"");
  if(mobile&&!(inIndia?/^(\+?91)?[6-9]\d{9}$/:/^\+?\d{7,15}$/).test(mobile))
    out.push(inIndia?"Mobile number must be a 10-digit Indian mobile number.":"Mobile number must be 7 to 15 digits, with an optional +.");
  if(t("email")&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t("email")))out.push("Email ID is not a valid email address.");
  if(t("website")&&!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t("website")))out.push("Website is not a valid web address.");
  const pan=t("pan").toUpperCase();
  if(pan&&inIndia&&!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))out.push("PAN must be 10 characters, like ABCDE1234F.");
  const gstin=t("gstin").toUpperCase();
  if(gstin&&inIndia){
    if(!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))out.push("GSTIN must be 15 characters, like 33ABCDE1234F1Z5.");
    else if(pan&&gstin.slice(2,12)!==pan)out.push("GSTIN does not contain the PAN entered (characters 3 to 12).");
  }
  if(t("udyamNo")&&inIndia&&!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(t("udyamNo").toUpperCase()))
    out.push("Udyam number must look like UDYAM-TN-00-0000000.");
  if(t("ifsc")&&inIndia&&!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(t("ifsc").toUpperCase()))out.push("IFSC must be 11 characters, like SBIN0001234.");
  const acct=t("accountNumber").replace(/\s/g,"");
  if(acct&&!(inIndia?/^\d{6,18}$/:/^[A-Z0-9]{6,34}$/i).test(acct))
    out.push(inIndia?"Account number must be 6 to 18 digits.":"Account number must be 6 to 34 letters or digits.");
  const credit=t("creditDays");
  if(credit&&!(/^\d+$/.test(credit)&&Number(credit)<=365))out.push("Credit period must be a whole number of days, 0 to 365.");
  const days=termDays(t("paymentTerms"));
  if(credit&&days!==null&&/^\d+$/.test(credit)&&Number(credit)!==days)
    out.push(`Payment terms are ${t("paymentTerms")}, so the credit period is ${days} days.`);
  const ret=t("retentionPercent");
  if(ret&&!(Number.isFinite(Number(ret))&&Number(ret)>0&&Number(ret)<=100))out.push("Retention % must be above 0 and at most 100.");
  if(v.gstRegistered==="No"&&gstin)out.push("GSTIN is entered but GST registered is No.");
  return out}

/* Which sections a person may change at a status. Procurement keeps the record until it
   is verified; accounts then complete and correct the tax, bank and commercial terms. */
export function editableSections(status:string,roles:string[]=[]):Section[]{
  if(["Draft","Returned","Submitted"].includes(status)&&isProcurement(roles))return[...SECTIONS];
  if(status==="Procurement Verification"&&isProcurement(roles))return["Basic Information","Due Diligence"];
  if(status==="Accounts Verification"&&isAccounts(roles))return["Tax & Statutory","Bank Details","Commercial"];
  return[]}

export type Move="submit"|"toVerification"|"procVerify"|"accVerify"|"approve"|"return"|"reject"|
  "suspend"|"block"|"inactivate"|"expire"|"reactivate"|"revise";

export const MOVE:Record<Move,{label:string;to:VendorStatus;note:boolean}>={
  submit:{label:"Submit",to:"Submitted",note:false},
  toVerification:{label:"Send for procurement verification",to:"Procurement Verification",note:false},
  procVerify:{label:"Verified - send to accounts",to:"Accounts Verification",note:false},
  accVerify:{label:"Verified - send for final approval",to:"Pending Approval",note:false},
  approve:{label:"Approve and activate",to:"Active",note:false},
  return:{label:"Query",to:"Returned",note:true},
  reject:{label:"Reject",to:"Rejected",note:true},
  suspend:{label:"Suspend",to:"Suspended",note:true},
  block:{label:"Block",to:"Blocked",note:true},
  inactivate:{label:"Mark inactive",to:"Inactive",note:true},
  expire:{label:"Mark expired",to:"Expired",note:true},
  reactivate:{label:"Reactivate",to:"Active",note:true},
  revise:{label:"Change details (re-verify)",to:"Returned",note:true}};

/* What a person may do to a vendor at its status. Final approval is maker-checker: whoever
   registered the vendor cannot also approve it. */
export function movesFor(status:string,roles:string[]=[],isCreator=false):Move[]{
  const p=isProcurement(roles),a=isAccounts(roles),m=isApprover(roles);
  /* At each check the reviewer can query the vendor back to procurement; closing it as
     Rejected is the administrator's decision alone. */
  const reject:Move[]=roles.includes("Administrator")?["reject"]:[];
  switch(status){
    case"Draft":case"Returned":return p?["submit"]:[];
    case"Submitted":return p?["toVerification"]:[];
    case"Procurement Verification":return p?["procVerify","return",...reject]:[];
    case"Accounts Verification":return a?["accVerify","return",...reject]:[];
    // Final approval is the accounts team's - still never the person who registered the vendor.
    case"Pending Approval":return a?[...(isCreator?[]:["approve" as Move]),"return",...reject]:[];
    case"Active":return[...(m?["suspend","block","inactivate","expire"] as Move[]:[]),...(p||a?["revise" as Move]:[])];
    case"Suspended":case"Blocked":case"Inactive":case"Expired":return m?["reactivate"]:[];
    default:return[]}}

/* The statuses a status may come from, for each move - so the server moves only a row
   that is still where the person saw it. */
export const MOVE_FROM:Record<Move,VendorStatus[]>={
  submit:["Draft","Returned"],toVerification:["Submitted"],procVerify:["Procurement Verification"],
  accVerify:["Accounts Verification"],approve:["Pending Approval"],
  return:["Procurement Verification","Accounts Verification","Pending Approval"],
  reject:["Procurement Verification","Accounts Verification","Pending Approval"],
  suspend:["Active"],block:["Active"],inactivate:["Active"],expire:["Active"],
  reactivate:["Suspended","Blocked","Inactive","Expired"],revise:["Active"]};

/* Who a vendor waits on, for the list. */
export const WAITING_ON:Partial<Record<VendorStatus,string>>={
  "Draft":"Procurement","Returned":"Procurement","Submitted":"Procurement","Procurement Verification":"Procurement",
  "Accounts Verification":"Accounts","Pending Approval":"Accounts"};

export const maskAccount=(n:string)=>{const s=(n||"").replace(/\s/g,"");return s.length>4?`${"•".repeat(Math.min(8,s.length-4))}${s.slice(-4)}`:s};

export const INDIAN_STATES=["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh",
  "Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh",
  "Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur",
  "Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
  "Uttar Pradesh","Uttarakhand","West Bengal"];
export const STATES_BY_COUNTRY:Record<string,string[]>={
  "India":INDIAN_STATES,
  "United Arab Emirates":["Abu Dhabi","Ajman","Dubai","Fujairah","Ras Al Khaimah","Sharjah","Umm Al Quwain"],
  "Qatar":["Ad Dawhah (Doha)","Al Daayen","Al Khor","Al Rayyan","Al Shamal","Al Wakrah","Al-Shahaniya","Umm Salal"],
  "Saudi Arabia":["Al Bahah","Al Jawf","Al Madinah","Al Qassim","Asir","Eastern Province","Ha'il","Jazan","Makkah","Najran",
    "Northern Borders","Riyadh","Tabuk"],
  "Bahrain":["Capital","Muharraq","Northern","Southern"]};

/* The country master. The group's own countries lead, then the rest A to Z. */
export const COUNTRIES=["India","United Arab Emirates","Qatar","Saudi Arabia","Bahrain","Oman","Kuwait",
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria",
  "Azerbaijan","Bahamas","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia",
  "Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada",
  "Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba",
  "Cyprus","Czech Republic","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France",
  "Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti",
  "Honduras","Hong Kong","Hungary","Iceland","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica",
  "Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia",
  "Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta",
  "Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco",
  "Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea",
  "North Macedonia","Norway","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines",
  "Poland","Portugal","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines",
  "Samoa","San Marino","Sao Tome and Principe","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia",
  "Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname",
  "Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga",
  "Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Kingdom","United States",
  "Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];
