/* Finding a payment request by what somebody typed.

   Two screens search the same requests and had drifted: the workbench matched the request
   number, vendor and status (though its box promised "company"), the requestor's list a
   different set, and neither could find a request by its amount. One matcher for both.

   The amount is matched on its digits, so it does not matter how it is typed: "483918",
   "4,83,918" and "483,918" all find INR 4,83,918, and the first few digits are enough. */

type Searchable={requestNo?:string;vendor?:string;company?:string;department?:string;status?:string;
  nature?:string;project?:string;poNumber?:string;invoiceNumber?:string;currency?:string;amount?:number|string};

export function matchesPayment(p:Searchable,typed:string):boolean{
  const q=typed.trim().toLowerCase();
  if(!q)return true;
  const text=[p.requestNo,p.vendor,p.company,p.department,p.status,p.nature,p.project,p.poNumber,p.invoiceNumber]
    .map(v=>String(v||"").toLowerCase()).join(" \u0001 ");
  if(text.includes(q))return true;
  /* An amount: digits with optional commas, spaces, a decimal point and a currency code in front. */
  const digits=q.replace(/^[a-z]{3}\s*/,"").replace(/[,\s]/g,"");
  if(!/^\d+(\.\d*)?$/.test(digits))return false;
  const amount=Number(p.amount);
  if(!Number.isFinite(amount))return false;
  /* Compared as written out in full, so "33984" finds 33984 and 33984.5, and "33984.5" only the second. */
  return amount.toFixed(2).startsWith(digits)||String(amount).includes(digits)}
