/* Job budgets: what each job (JB code) may spend, and what its payment requests come to.
   Shared by the API and the screens so both use the same rules. */
import{PAID_STAGES}from"./payment-stages";

/** 2 Cr - the budget of every job until an administrator sets another. */
export const DEFAULT_JOB_BUDGET=20_000_000;
/** Budgets are in rupees; only INR requests count against them. */
export const BUDGET_CURRENCY="INR";
/** From this share of the budget a job is shown as near its budget. */
export const NEAR_SHARE=0.9;

/* A rejected request is closed and pays nothing, so it does not count as spent. Every
   other request booked to the job does - released, or still on its way. */
const NOT_SPENT=["Rejected","Audit Rejected"];
export const countsAsSpent=(status:string)=>!NOT_SPENT.includes(status);
export const isReleased=(status:string)=>PAID_STAGES.includes(status);

export const jobKey=(code:unknown)=>String(code??"").trim().toUpperCase();

export type JobBudget={code:string;project:string;location:string;budget:number;custom:boolean;
  spent:number;released:number;inProcess:number;requests:number;balance:number;
  state:"ok"|"near"|"over"};

export const stateOf=(budget:number,spent:number):JobBudget["state"]=>
  spent>budget?"over":budget>0&&spent>=budget*NEAR_SHARE?"near":"ok";

/* Rupees the Indian way: 2,00,00,000. */
export const inr=(n:number)=>`₹${Math.round(n).toLocaleString("en-IN")}`;
/* The same in crore or lakh, for a quick read: 2.00 Cr, 45.30 L. */
export const short=(n:number)=>{const a=Math.abs(n);
  return a>=1e7?`${(n/1e7).toFixed(2)} Cr`:a>=1e5?`${(n/1e5).toFixed(2)} L`:inr(n)};
