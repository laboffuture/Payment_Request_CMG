/* The job register: JB code, project and location.

   The three are stored as one row per job rather than as three lists, because they are
   not independent - a code names one project at one location. Three separate lists would
   let somebody book TRG-J02-001 against the wrong site simply by choosing the wrong entry
   in the second dropdown.

   Held as settings rows so a new job is added without a release, and split here so the
   format lives in one place rather than in each screen that reads it. */

export type Job={code:string;project:string;location:string};

/** Splits "CODE | PROJECT | LOCATION". A row that is not in that shape is skipped rather
    than half-read, so a mistyped entry cannot quietly become a job with no location. */
export function parseJobs(rows:string[]):Job[]{
  const out:Job[]=[];
  for(const row of rows){
    const parts=String(row||"").split("|").map(p=>p.trim());
    if(parts.length<3)continue;
    const[code,project,location]=parts;
    if(!code||!project)continue;
    out.push({code,project,location});
  }
  return out}

/** The job a code belongs to, or nothing. Compared without case or spacing so a code
    typed by hand still matches the register. */
export const jobFor=(jobs:Job[],code:string)=>{
  const want=String(code||"").trim().toLowerCase();
  return want?jobs.find(j=>j.code.toLowerCase()===want):undefined};

/** The distinct values for a column, in the order the register lists them. Projects
    repeat across codes - JUNIOR KUPPANNA runs at three sites - so the list is deduped. */
export const distinct=(jobs:Job[],field:keyof Job)=>
  [...new Set(jobs.map(j=>j[field]).filter(Boolean))];
