import{count}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfDepartments,wfEmployees,wfLogs,wfQueries,wfRoles,wfTasks,wfTokens,wfUsers}from"../../../../db/schema";
import{actorOf,oops,str}from"../../../../lib/workforce-api";
import{newPasswordFields,randomHex}from"../../../../lib/auth";
import{requireAuth}from"../../../../lib/auth";

/* D1 allows 100 bound parameters per statement, so multi-row inserts are chunked by
   column count rather than sent as one large VALUES list. */
const chunk=<T,>(rows:T[],columns:number)=>{
  const size=Math.max(Math.floor(100/Math.max(columns,1)),1);
  const out:T[][]=[];
  for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));
  return out};

const iso=(d:Date)=>d.toISOString().slice(0,10);
const shift=(n:number)=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
const week=(date:string)=>{const d=new Date(date+"T00:00:00");const t=new Date(d);
  t.setDate(d.getDate()+4-(d.getDay()||7));const y0=new Date(t.getFullYear(),0,1);
  return `${t.getFullYear()}-W${String(Math.ceil(((t.getTime()-y0.getTime())/86400000+1)/7)).padStart(2,"0")}`};
const period=(f:string,d:string)=>f==="Daily"?d:f==="Weekly"?week(d):f==="Monthly"?d.slice(0,7):d;

const departments=[
  {id:"d-group",name:"Group Accounts",code:"ACC",color:"#0b725d",position:0},
  {id:"d-audit",name:"Audit",code:"AUD",color:"#3f70c7",position:1}];

const roles=[
  // Group Accounts — the approved organisation chart
  {id:"r-group",deptId:"d-group",name:"Group Accounts Manager",type:"Group",parentId:null,color:"#0b725d",
   jd:"Owns the consolidated accounts of the group. Approves vertical and functional plans, reviews monthly closing, and signs off consolidated MIS."},
  {id:"r-int",deptId:"d-group",name:"Interiors Head",type:"Vertical",parentId:"r-group",color:"#3f70c7",
   jd:"Accountable for Interiors vertical accounting: project WIP, margin review, client billing and vertical MIS."},
  {id:"r-edu",deptId:"d-group",name:"Education Head",type:"Vertical",parentId:"r-group",color:"#7855b8",
   jd:"Accountable for Education vertical accounting: fee collection, term-wise revenue recognition and vertical MIS."},
  {id:"r-res",deptId:"d-group",name:"Restaurants Head",type:"Vertical",parentId:"r-group",color:"#c0703a",
   jd:"Accountable for Restaurants vertical accounting: daily outlet sales reconciliation, food cost and vertical MIS."},
  {id:"r-gen",deptId:"d-group",name:"General Head",type:"Vertical",parentId:"r-group",color:"#2f8f83",
   jd:"Accountable for group-level general accounting: insurance, statutory schedules and shared overheads."},
  {id:"r-ar",deptId:"d-group",name:"AR Head",type:"Function",parentId:"r-group",color:"#1d6fa5",
   jd:"Owns receivables across all verticals: invoicing accuracy, collection follow-up, ageing review and customer reconciliation."},
  {id:"r-ap",deptId:"d-group",name:"AP Head",type:"Function",parentId:"r-group",color:"#b4553c",
   jd:"Owns payables across all verticals: vendor invoice booking, three-way match, payment scheduling and vendor reconciliation."},
  {id:"r-gl",deptId:"d-group",name:"GL Reconciliation",type:"Function",parentId:"r-group",color:"#6a7fb8",
   jd:"Owns ledger integrity: bank and intercompany reconciliation, journal review and schedule preparation for closing."},
  {id:"r-pc",deptId:"d-group",name:"Petty Cash & Finalization",type:"Function",parentId:"r-group",color:"#8a6d1f",
   jd:"Owns petty cash control and month-end finalisation: cash counts, imprest verification and closing checklist."},
  {id:"r-are",deptId:"d-group",name:"AR Executive",type:"Support",parentId:"r-ar",color:"#4f9bc9",
   jd:"Posts customer receipts, issues invoices, chases overdue balances and prepares the ageing working."},
  {id:"r-fa",deptId:"d-group",name:"Functional Assistants",type:"Support",parentId:"r-group",color:"#71817d",
   jd:"Shared services pool supporting all functional heads with volume data work."},
  {id:"r-de",deptId:"d-group",name:"Data Entry Staff",type:"Support",parentId:"r-fa",color:"#8a9a95",
   jd:"Keys invoices and vouchers against issued tokens, verifies references and reports exceptions to the functional head."},
  {id:"r-rs",deptId:"d-group",name:"Reporting Support",type:"Support",parentId:"r-fa",color:"#9aa8a3",
   jd:"Prepares reconciliation workings and recurring report packs for the functional heads."},
  // Audit — its own chart, mirroring the queues already in the application
  {id:"a-head",deptId:"d-audit",name:"Audit Head",type:"Group",parentId:null,color:"#3f70c7",
   jd:"Owns the annual audit plan, allocates audit resources, signs off observations and reports to management."},
  {id:"a-pre",deptId:"d-audit",name:"Pre-Audit Lead",type:"Function",parentId:"a-head",color:"#1d6fa5",
   jd:"Leads pre-payment verification: checks invoice, PO and budget evidence before release."},
  {id:"a-post",deptId:"d-audit",name:"Post-Audit Lead",type:"Function",parentId:"a-head",color:"#7855b8",
   jd:"Leads scheduled post-audit reviews against the annual programme and tracks corrective actions."},
  {id:"a-spec",deptId:"d-audit",name:"Special Audit Lead",type:"Function",parentId:"a-head",color:"#c64a49",
   jd:"Handles management-requested and exception-driven investigations outside the annual plan."},
  {id:"a-snr",deptId:"d-audit",name:"Senior Auditor",type:"Support",parentId:"a-pre",color:"#4f9bc9",
   jd:"Executes assigned audits, drafts observations, and reviews assistant working papers."},
  {id:"a-aud",deptId:"d-audit",name:"Auditor",type:"Support",parentId:"a-post",color:"#8aa8c9",
   jd:"Performs test work, gathers evidence and records findings against the audit programme."},
  {id:"a-asst",deptId:"d-audit",name:"Audit Assistant",type:"Support",parentId:"a-snr",color:"#9aa8b8",
   jd:"Collects supporting documents, prepares samples and maintains the evidence file."}];

const employees=[
  ["E-001","EMP-001","Kavi Chandru","Group Accounts Manager","r-group","d-group","Group",null,"2019-04-01"],
  ["E-002","EMP-002","Rahul Menon","Interiors Head","r-int","d-group","Interiors","E-001","2021-02-15"],
  ["E-003","EMP-003","Divya Raman","Education Head","r-edu","d-group","Education","E-001","2020-08-03"],
  ["E-004","EMP-004","Sanjay Pillai","Restaurants Head","r-res","d-group","Restaurants","E-001","2022-01-10"],
  ["E-005","EMP-005","Nithya Krishnan","General Head","r-gen","d-group","General","E-001","2021-11-22"],
  ["E-006","EMP-006","Ahmed Faisal","AR Head","r-ar","d-group","Accounts Receivable","E-001","2020-03-09"],
  ["E-007","EMP-007","Sara Thomas","AR Executive","r-are","d-group","Accounts Receivable","E-006","2023-06-01"],
  ["E-008","EMP-008","John Mathew","AP Head","r-ap","d-group","Accounts Payable","E-001","2020-05-18"],
  ["E-009","EMP-009","Priya Sundaram","GL Reconciliation Head","r-gl","d-group","General Ledger","E-001","2021-07-12"],
  ["E-010","EMP-010","Vikram Nair","Petty Cash & Finalization","r-pc","d-group","Petty Cash","E-001","2022-09-05"],
  ["E-011","EMP-011","Anand Kumar","Data Entry Staff","r-de","d-group","Shared Services","E-006","2023-02-20"],
  ["E-012","EMP-012","Meena Rajan","Data Entry Staff","r-de","d-group","Shared Services","E-008","2023-03-14"],
  ["E-013","EMP-013","Suresh Babu","Reporting Support","r-rs","d-group","Shared Services","E-009","2024-01-08"],
  ["A-001","AUD-001","Fatima Noor","Audit Head","a-head","d-audit","Audit",null,"2019-09-01"],
  ["A-002","AUD-002","Meera Sivan","Pre-Audit Lead","a-pre","d-audit","Audit","A-001","2020-11-16"],
  ["A-003","AUD-003","K. Praveen","Post-Audit Lead","a-post","d-audit","Audit","A-001","2021-05-04"],
  ["A-004","AUD-004","Arun Varma","Special Audit Lead","a-spec","d-audit","Audit","A-001","2021-08-23"],
  ["A-005","AUD-005","Lakshmi Iyer","Senior Auditor","a-snr","d-audit","Audit","A-002","2022-04-11"],
  ["A-006","AUD-006","Ravi Shankar","Auditor","a-aud","d-audit","Audit","A-003","2023-01-30"],
  ["A-007","AUD-007","Nisha Paul","Audit Assistant","a-asst","d-audit","Audit","A-005","2024-02-19"]
].map(([id,code,name,designation,roleId,deptId,department,reportsTo,joined])=>({
  id:id as string,code:code as string,name:name as string,designation:designation as string,
  roleId:roleId as string,deptId:deptId as string,department:department as string,
  reportsTo:reportsTo as string|null,email:`${(name as string).split(" ")[0].toLowerCase()}@cmg.group`,
  phone:"",jd:"",photoAt:"",active:1,joined:joined as string}));

const taskSpec:[string,string,string,string,number,string,number,number,number][]=[
  // series, name, employee, frequency, dueOffset, status, progress, qty, done
  ["S-ar-daily","Customer receipt posting","E-007","Daily",0,"In Progress",50,0,0],
  ["S-ar-daily","Customer receipt posting","E-007","Daily",-1,"Completed",100,0,0],
  ["S-ar-daily","Customer receipt posting","E-007","Daily",-2,"Completed",100,0,0],
  ["S-de-invoice","Invoice entry batch","E-011","Daily",0,"In Progress",75,100,75],
  ["S-de-invoice","Invoice entry batch","E-011","Daily",-1,"Completed",100,100,100],
  ["S-ap-vendor","Vendor invoice entry","E-012","Daily",-1,"In Progress",40,120,48],
  ["S-ap-vendor","Vendor invoice entry","E-012","Daily",-3,"Completed",100,120,120],
  ["S-gl-recon","Bank reconciliation preparation","E-013","Weekly",2,"Not Started",0,0,0],
  ["S-gl-recon","Bank reconciliation preparation","E-013","Weekly",-5,"Completed",100,0,0],
  ["S-ar-ageing","AR ageing review","E-006","Weekly",3,"In Progress",25,0,0],
  ["S-pc-close","Petty cash count & finalisation","E-010","Monthly",6,"Not Started",0,0,0],
  ["S-edu-mis","Education vertical MIS pack","E-003","Monthly",9,"In Progress",25,0,0],
  ["S-int-wip","Interiors WIP and margin review","E-002","Monthly",-3,"In Progress",50,0,0],
  ["S-res-daily","Daily outlet sales reconciliation","E-004","Daily",0,"Completed",100,0,0],
  ["S-gen-adhoc","Group insurance renewal schedule","E-005","One Time",14,"Not Started",0,0,0],
  ["S-pre-verify","Pre-audit payment verification","A-002","Daily",0,"In Progress",50,25,12],
  ["S-pre-verify","Pre-audit payment verification","A-002","Daily",-1,"Completed",100,25,25],
  ["S-post-prog","Post-audit programme execution","A-003","Weekly",4,"In Progress",25,0,0],
  ["S-snr-review","Working paper review","A-005","Weekly",1,"Not Started",0,0,0],
  ["S-aud-test","Control test work","A-006","Daily",-2,"Completed",100,0,0],
  ["S-asst-evid","Evidence file preparation","A-007","Daily",0,"In Progress",25,0,0],
  ["S-spec-inv","Vendor fraud investigation","A-004","One Time",5,"In Progress",50,0,0],
  ["S-head-plan","Monthly audit plan review","A-001","Monthly",8,"Not Started",0,0,0]];

const buildTasks=()=>taskSpec.map(([seriesId,name,employeeId,frequency,offset,status,progress,qty,done],i)=>{
  const due=shift(offset);
  const emp=employees.find(e=>e.id===employeeId);
  // completed work is stamped on or before the due date except one deliberately late
  const completedAt=status==="Completed"?(i%6===1?shift(offset+2):due):"";
  return{id:`T-seed-${i}`,seriesId,name,description:"",frequency,period:period(frequency,due),
    start:due,due,priority:i%5===0?"Critical":i%3===0?"High":"Medium",employeeId,
    deptId:emp?.deptId||"d-group",assignedBy:emp?.reportsTo||"E-001",expectedOutput:"",
    remarks:status==="Completed"?"Verified and closed":"",status,progress,qty,done,
    blocker:i===5?"Awaiting missing PO references":"",nextAction:i===5?"Chase procurement":"",
    completedAt,updatedAt:new Date().toISOString()}});

const queries=[
  ["Q-1","QRY-0001","Missing PO reference on 12 invoices","E-011","E-006","Followed Up",2,-6,"High",""],
  ["Q-2","QRY-0002","Customer receipt allocated to wrong account","E-007","E-006","Resolved",1,-11,"Medium","Reallocated and confirmed with customer"],
  ["Q-3","QRY-0003","Bank reconciliation variance not explained","E-013","E-009","Open",0,-2,"High",""],
  ["Q-4","QRY-0004","Vendor invoice booked twice","E-012","E-008","Resolved",3,-16,"Critical","Duplicate reversed, control added at entry"],
  ["Q-5","QRY-0005","Petty cash count short by AED 340","E-010","E-001","Followed Up",1,-4,"High",""],
  ["Q-6","QRY-0006","Evidence file incomplete for sample 14","A-007","A-005","Open",0,-1,"Medium",""],
  ["Q-7","QRY-0007","Pre-audit sign-off missing on release","A-002","A-001","Resolved",2,-21,"High","Sign-off obtained, checklist updated"],
  ["Q-8","QRY-0008","Control test evidence not retained","A-006","A-003","Followed Up",4,-9,"Medium",""]
].map(([id,ref,title,employeeId,raisedBy,status,followUps,offset,priority,resolution])=>{
  const emp=employees.find(e=>e.id===employeeId);
  const raisedAt=`${shift(offset as number)}T09:00:00.000Z`;
  return{id:id as string,ref:ref as string,title:title as string,detail:"",
    raisedBy:raisedBy as string,employeeId:employeeId as string,taskId:"",
    deptId:emp?.deptId||"d-group",priority:priority as string,status:status as string,raisedAt,
    dueAt:shift((offset as number)+7),followUps:followUps as number,
    lastFollowUpAt:(followUps as number)?`${shift((offset as number)+2)}T09:00:00.000Z`:"",
    resolvedAt:status==="Resolved"?`${shift((offset as number)+5)}T09:00:00.000Z`:"",
    resolution:resolution as string}});

const tokens=[
  {id:"TKN-1",number:"TK-000121",taskType:"Invoice Entry",created:shift(0),createdBy:"E-006",
   employeeId:"E-011",functionRoleId:"r-ar",deptId:"d-group",priority:"High",reference:"BATCH/AR/0821",
   qty:100,done:75,status:"In Progress",remarks:"25 pending on missing PO reference"},
  {id:"TKN-2",number:"TK-000122",taskType:"Vendor Invoice Entry",created:shift(-1),createdBy:"E-008",
   employeeId:"E-012",functionRoleId:"r-ap",deptId:"d-group",priority:"Medium",reference:"BATCH/AP/0820",
   qty:120,done:48,status:"In Progress",remarks:""},
  {id:"TKN-3",number:"TK-000123",taskType:"Reconciliation Data Preparation",created:shift(-2),createdBy:"E-009",
   employeeId:"E-013",functionRoleId:"r-gl",deptId:"d-group",priority:"High",reference:"GL/RECON/AUG",
   qty:40,done:40,status:"Completed",remarks:"Handed to GL head"},
  {id:"TKN-4",number:"TK-000124",taskType:"Audit Sample Extraction",created:shift(-1),createdBy:"A-005",
   employeeId:"A-007",functionRoleId:"a-pre",deptId:"d-audit",priority:"Medium",reference:"AUD/SAMP/09",
   qty:60,done:22,status:"In Progress",remarks:""}];

/* POST seeds both charts. It refuses to run over existing data unless ?force=1, so a
   stray call cannot wipe a live register. */
export async function POST(req:Request){
  try{
    const db0=await getDb();
    const [{n:accounts}]=await db0.select({n:count()}).from(wfUsers);
    // the first run has no accounts yet, so bootstrapping is allowed exactly once;
    // after that seeding is an administrator action like any other
    if(accounts>0){
      const{response}=await requireAuth(req,"admin");
      if(response)return response;
    }
    const force=new URL(req.url).searchParams.get("force")==="1";
    const db=await getDb();
    const [existing]=await db.select({n:count()}).from(wfDepartments);
    if((existing?.n??0)>0&&!force)
      return Response.json({error:"Already seeded. Call with ?force=1 to replace everything."},{status:409});
    if(force){
      await db.delete(wfTasks);await db.delete(wfTokens);await db.delete(wfQueries);
      await db.delete(wfEmployees);await db.delete(wfRoles);await db.delete(wfDepartments);
    }
    const tasks=buildTasks();
    for(const c of chunk(departments,5))await db.insert(wfDepartments).values(c);
    for(const c of chunk(roles,7))await db.insert(wfRoles).values(c);
    for(const c of chunk(employees,14))await db.insert(wfEmployees).values(c);
    for(const c of chunk(tasks,22))await db.insert(wfTasks).values(c);
    for(const c of chunk(queries,16))await db.insert(wfQueries).values(c);
    for(const c of chunk(tokens,14))await db.insert(wfTokens).values(c);
    // first administrator, with a password that is printed once and must be changed
    let bootstrap:{email:string;password:string}|null=null;
    const [{n:userCount}]=await db.select({n:count()}).from(wfUsers);
    if(userCount===0){
      const email=str(new URL(req.url).searchParams.get("adminEmail"))||"admin@chandramari.local";
      const password=`Setup-${randomHex(3)}-${Math.floor(1000+Math.random()*9000)}`;
      const fields=await newPasswordFields(password);
      const now=new Date().toISOString();
      await db.insert(wfUsers).values({id:"u-bootstrap",email:email.toLowerCase(),
        name:"Administrator",employeeId:"E-001",roles:JSON.stringify(["Administrator"]),
        ...fields,mustChange:1,active:1,createdAt:now,passwordSetAt:now,lastLoginAt:""});
      bootstrap={email:email.toLowerCase(),password};
    }
    await db.insert(wfLogs).values({id:`L-seed-${Date.now()}`,at:new Date().toISOString(),
      actor:actorOf(req),entity:"system",entityId:"seed",action:"Starter structure loaded",
      detail:`${departments.length} departments, ${roles.length} roles, ${employees.length} employees`});
    return Response.json({seeded:true,departments:departments.length,roles:roles.length,
      employees:employees.length,tasks:tasks.length,queries:queries.length,tokens:tokens.length,
      administrator:bootstrap},{status:201});
  }catch(e){return oops(e)}}
