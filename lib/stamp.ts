/* A stored timestamp as the reader's local date and time - "24 Sep 2026, 15:13".

   SQLite's CURRENT_TIMESTAMP is UTC written without a zone ("2026-09-24 09:43:13"), which
   a browser would read as local time and show hours out. Anything without a zone is taken
   as UTC; anything with one is taken as written. */
export const stamp=(v?:string|null)=>{
  if(!v)return"";
  const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v)?v:v.replace(" ","T")+"Z");
  return isNaN(+d)?v:d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})};
