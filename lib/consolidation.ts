/* Consolidated payments: who may combine payment requests into a batch, and the summary a
   batch shows on screen and in its PDF. Shared by the API and the screens so both agree. */

/* Administration, accounts, audit and finance. The API checks the login's roles; the screens
   follow the role chosen in the header. */
export const CONSOLIDATION_ROLES=["Administrator","Accountant","Auditor","Audit Head","Finance"];
export const mayConsolidate=(roles:string[]=[])=>roles.some(r=>CONSOLIDATION_ROLES.includes(r));

export type BatchPayment={id:number;requestNo:string;company:string;department:string;vendor:string;
  amount:number;currency:string;due:string;status:string;project?:string;projectCode?:string;poNumber?:string;
  jbCode?:string;invoiceNumber?:string;invoiceDate?:string;nature?:string;tdsValue?:string;paymentMode?:string;utrNumber?:string};

export type Consolidation={id:string;cpNo:string;title:string;note:string;createdBy:string;createdAt:string;
  updatedAt:string;payments:BatchPayment[]};

export type Total={currency:string;amount:number;count:number};
export type Group={name:string;count:number;totals:Total[]};

const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0};

/* Amounts are added per currency only - rupees and dirhams never make one figure. */
export function totalsOf(rows:BatchPayment[]):Total[]{
  const by=new Map<string,Total>();
  for(const r of rows){const c=r.currency||"—";const t=by.get(c)||{currency:c,amount:0,count:0};
    t.amount+=num(r.amount);t.count+=1;by.set(c,t)}
  return[...by.values()].sort((a,b)=>b.amount-a.amount)}

export function groupBy(rows:BatchPayment[],key:(r:BatchPayment)=>string):Group[]{
  const by=new Map<string,BatchPayment[]>();
  for(const r of rows){const k=key(r)||"—";by.set(k,[...(by.get(k)||[]),r])}
  return[...by].map(([name,list])=>({name,count:list.length,totals:totalsOf(list)}))
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))}

/* The two kinds of payment a batch is read by: vendor payments and sub-contractor payments,
   from the request's nature of payment. Anything else is shown as other. */
export const paymentKind=(nature?:string):"vendor"|"sub"|"other"=>
  /sub[\s-]*contract/i.test(nature||"")?"sub":/vendor/i.test(nature||"")?"vendor":"other";
export const KIND_LABEL={vendor:"Vendor payments",sub:"Sub-contractor payments",other:"Other payment types"} as const;

export const summaryOf=(rows:BatchPayment[])=>({
  count:rows.length,
  byKind:(["vendor","sub","other"] as const).map(k=>{const list=rows.filter(r=>paymentKind(r.nature)===k);
    return{kind:k,label:KIND_LABEL[k],count:list.length,totals:totalsOf(list)}}),
  byNature:groupBy(rows,r=>r.nature||"Not given"),
  totals:totalsOf(rows),
  tds:totalsOf(rows.filter(r=>num(r.tdsValue)>0).map(r=>({...r,amount:num(r.tdsValue)}))),
  byCompany:groupBy(rows,r=>r.company),
  byVendor:groupBy(rows,r=>r.vendor),
  byStatus:groupBy(rows,r=>r.status)});

export const money=(currency:string,amount:number)=>
  `${currency} ${amount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const moneyList=(totals:Total[])=>totals.length?totals.map(t=>money(t.currency,t.amount)).join(" + "):"—";
