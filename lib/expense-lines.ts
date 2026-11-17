/* Petty cash expense submission: the bills a custodian spent an advance on, one line each.
   Kept as JSON on the request (expense_lines); the request's amount is their total, and what
   is still owed to the employee is that total less the advance received. */

export const EXPENSE_CATEGORIES=["Travel","Food","Stationery","Fuel","Courier & Postage",
  "Repairs & Maintenance","Staff Welfare","Site Consumables","Miscellaneous"];

export type ExpenseLine={sn:number;date:string;category:string;description:string;amount:number;
  /* the bill's file name as uploaded with the request */
  bill:string};

const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0};
const round2=(n:number)=>Math.round(n*100)/100;

export const expenseTotal=(lines:{amount:number|string}[])=>round2(lines.reduce((t,l)=>t+num(l.amount),0));
export const payableToEmployee=(advance:number|string,lines:{amount:number|string}[])=>
  round2(expenseTotal(lines)-num(advance));

/* The stored lines, or none for any other request (or a value that is not a list). */
export function readExpenseLines(raw:unknown):ExpenseLine[]{
  let v:unknown=raw;
  if(typeof raw==="string"){if(!raw.trim())return [];try{v=JSON.parse(raw)}catch{return []}}
  if(!Array.isArray(v))return [];
  return v.map((l,i)=>({sn:i+1,date:String(l?.date??""),category:String(l?.category??""),
    description:String(l?.description??""),amount:num(l?.amount),bill:String(l?.bill??"")}));
}

/* What the server accepts: at least one line, each dated, categorised, described and above zero. */
export function checkExpenseLines(raw:unknown):{lines:ExpenseLine[];error?:string}{
  const lines=readExpenseLines(raw).map(l=>({...l,date:l.date.trim(),category:l.category.trim().slice(0,60),
    description:l.description.trim().slice(0,300),bill:l.bill.trim().slice(0,200),amount:round2(l.amount)}));
  if(!lines.length)return {lines,error:"Add at least one expense to the breakup."};
  if(lines.length>200)return {lines,error:"An expense breakup holds at most 200 lines."};
  for(const l of lines){
    const at=`Expense ${l.sn}`;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(l.date))return {lines,error:`${at}: enter the expense date.`};
    if(!l.category)return {lines,error:`${at}: choose the expense category.`};
    if(!l.description)return {lines,error:`${at}: describe the expense.`};
    if(!(l.amount>0))return {lines,error:`${at}: enter an amount above zero.`};
  }
  return {lines};
}
