/* The payment request report: every column a request can carry, for the requestor's
   download and the Accounts / Audit one alike.

   Each screen used to keep its own column list, written by hand, and each had drifted:
   the requestor's left out the job, the description, the invoice, the terms, the mode
   of payment, the TDS figures and the UTR, and neither carried the extra fields an
   administrator adds to the form. One list, used by both, so a field added to a request
   cannot be forgotten in one of the reports again. */

import{STAGES,stageIndex}from"./payment-stages";

export type ReportRow={requestNo:string;status:string;company:string;department:string;vendor:string;
  amount:number;currency:string;due:string;urgency:string;owner:string;nature?:string;description?:string;
  jbCode?:string;project?:string;jobLocation?:string;jobNo?:string;workType?:string;projectCode?:string;
  poNumber?:string;invoiceNumber?:string;invoiceDate?:string;paymentTerms?:string;period?:string;
  paymentMode?:string;tds?:string;tdsPercent?:string;tdsValue?:string;utrNumber?:string;raisedBy?:string;
  createdAt?:string;lastActionBy?:string;lastActionAt?:string;lastActionNote?:string;latestRemark?:string;
  rejectionNote?:string;rejectedBy?:string;resubmitNote?:string;extra?:string};

type Column={head:string;value:(p:ReportRow)=>string|number;
  /* Columns that belong to older requests only (the job number and type of works were
     asked for once and then dropped) appear only when some row in the report has one. */
  onlyIfUsed?:boolean};

const day=(v?:string)=>(v||"").slice(0,10);
const net=(p:ReportRow)=>p.tds==="Yes"&&Number(p.tdsValue)?Math.round((Number(p.amount)-Number(p.tdsValue))*100)/100:"";

const COLUMNS:Column[]=[
  {head:"Request",value:p=>p.requestNo},
  {head:"Status",value:p=>p.status},
  {head:"Stage",value:p=>STAGES[stageIndex(p.status)]},
  {head:"Company",value:p=>p.company},
  {head:"Department",value:p=>p.department},
  {head:"Nature of payment",value:p=>p.nature||""},
  {head:"Vendor / beneficiary",value:p=>p.vendor},
  {head:"Description",value:p=>p.description||""},
  {head:"JB code",value:p=>p.jbCode||""},
  {head:"Project",value:p=>p.project||""},
  {head:"Job location",value:p=>p.jobLocation||""},
  {head:"Job number",value:p=>p.jobNo||"",onlyIfUsed:true},
  {head:"Type of works",value:p=>p.workType||"",onlyIfUsed:true},
  {head:"Project code",value:p=>p.projectCode||"",onlyIfUsed:true},
  {head:"PO number",value:p=>p.poNumber||""},
  {head:"Invoice number",value:p=>p.invoiceNumber||""},
  {head:"Invoice date",value:p=>p.invoiceDate||""},
  {head:"Payment terms",value:p=>p.paymentTerms||""},
  {head:"Period",value:p=>p.period||""},
  {head:"Mode of payment",value:p=>p.paymentMode||""},
  {head:"Currency",value:p=>p.currency},
  {head:"Amount",value:p=>p.amount},
  {head:"TDS",value:p=>p.tds||""},
  {head:"TDS %",value:p=>p.tdsPercent||""},
  {head:"TDS value",value:p=>p.tdsValue||""},
  {head:"Net payable",value:net},
  {head:"Due date",value:p=>p.due},
  {head:"Urgency",value:p=>p.urgency},
  {head:"Owner",value:p=>p.owner},
  {head:"Raised by",value:p=>p.raisedBy||""},
  {head:"Raised on",value:p=>day(p.createdAt)},
  {head:"Last action by",value:p=>p.lastActionBy||""},
  {head:"Last action on",value:p=>day(p.lastActionAt)},
  {head:"Remarks",value:p=>p.lastActionNote||p.latestRemark||""},
  {head:"Query / rejection reason",value:p=>p.rejectionNote?`${p.rejectionNote}${p.rejectedBy?` (${p.rejectedBy})`:""}`:""},
  {head:"Resubmission note",value:p=>p.resubmitNote||""},
  {head:"UTR number",value:p=>p.utrNumber||""}];

/* The extra fields an administrator has added to the request form, stored on each
   request as [{id,label,value}]. Every label any row carries becomes a column. */
const extras=(p:ReportRow):{id:string;label:string;value:string}[]=>{
  try{const v=JSON.parse(p.extra||"[]");return Array.isArray(v)?v:[]}catch{return[]}};

/** The report as rows: the heading row first, then one row per request. */
export function paymentReport(rows:ReportRow[]):(string|number)[][]{
  const used=COLUMNS.filter(c=>!c.onlyIfUsed||rows.some(r=>String(c.value(r)||"").trim()));
  const extraCols:{id:string;label:string}[]=[];
  for(const r of rows)for(const x of extras(r))
    if(x&&x.id&&!extraCols.some(c=>c.id===x.id))extraCols.push({id:x.id,label:String(x.label||x.id)});
  return[[...used.map(c=>c.head),...extraCols.map(c=>c.label)],
    ...rows.map(r=>{const ex=extras(r);
      return[...used.map(c=>c.value(r)),...extraCols.map(c=>String(ex.find(x=>x.id===c.id)?.value??""))]})]}

/** Where the Amount column sits, for a report that adds a total beneath it. */
export const amountColumn=(report:(string|number)[][])=>report[0].indexOf("Amount");
