import{sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{requireAuth}from"../../../../lib/auth";
import{oops}from"../../../../lib/workforce-api";

type Row=Record<string,unknown>;
const n=(v:unknown)=>Number(v)||0;

/* The scorecard used to be four hard-coded names. It is now computed from what people
   have actually done: audit tasks completed, observations raised and answered, and
   workforce tasks closed on time. Aggregated in SQL so it stays cheap as history grows. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const db=await getDb();
    const today=new Date().toISOString().slice(0,10);

    const [auditWork,taskWork,obsWork]=await Promise.all([
      db.all<Row>(sql`SELECT assigned_to AS person,
          COUNT(*) AS assigned,
          SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status<>'Completed' AND due_date<>'' AND due_date<${today}
            THEN 1 ELSE 0 END) AS overdue
        FROM wf_audit_tasks WHERE assigned_to<>'' GROUP BY assigned_to`),
      db.all<Row>(sql`SELECT e.name AS person,
          COUNT(t.id) AS tasks,
          SUM(CASE WHEN t.status='Completed' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN t.status='Completed' AND t.completed_at<>''
            AND t.completed_at<=t.due_date THEN 1 ELSE 0 END) AS onTime
        FROM wf_employees e JOIN wf_tasks t ON t.employee_id=e.id
        GROUP BY e.id`),
      db.all<Row>(sql`SELECT raised_by AS person, COUNT(*) AS raised,
          SUM(CASE WHEN status IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS closed
        FROM wf_observations WHERE raised_by<>'' GROUP BY raised_by`)]);

    const board=new Map<string,Record<string,number>>();
    const seat=(name:string)=>{
      if(!board.has(name))board.set(name,{auditAssigned:0,auditCompleted:0,auditOverdue:0,
        tasks:0,tasksDone:0,tasksOnTime:0,obsRaised:0,obsClosed:0,points:0});
      return board.get(name)!};

    auditWork.forEach(r=>{const s=seat(String(r.person));
      s.auditAssigned=n(r.assigned);s.auditCompleted=n(r.completed);s.auditOverdue=n(r.overdue)});
    taskWork.forEach(r=>{const s=seat(String(r.person));
      s.tasks=n(r.tasks);s.tasksDone=n(r.done);s.tasksOnTime=n(r.onTime)});
    obsWork.forEach(r=>{const s=seat(String(r.person));
      s.obsRaised=n(r.raised);s.obsClosed=n(r.closed)});

    // 10 an audit task, 10 a workforce task, 5 an observation raised, 5 one closed out
    type Line={person:string;points:number;auditAssigned:number;auditCompleted:number;
      auditOverdue:number;tasks:number;tasksDone:number;tasksOnTime:number;obsRaised:number;
      obsClosed:number;quality:number;onTimeRate:number;overdueRate:number};
    const rows:Line[]=Array.from(board.entries()).map(([person,s])=>{
      s.points=s.auditCompleted*10+s.tasksDone*10+s.obsRaised*5+s.obsClosed*5;
      const finished=s.tasksDone;
      return{person,...s,
        quality:s.auditAssigned?Math.round(s.auditCompleted/s.auditAssigned*100):0,
        onTimeRate:finished?Math.round(s.tasksOnTime/finished*100):0,
        overdueRate:s.auditAssigned?Math.round(s.auditOverdue/s.auditAssigned*100):0} as Line})
      .filter(r=>r.points>0||r.auditAssigned>0||r.tasks>0)
      .sort((a,b)=>b.points-a.points);

    return Response.json({scorecard:rows,
      scoring:[["Audit task completed",10],["Workforce task completed",10],
        ["Observation raised",5],["Observation closed out",5]]},
      {headers:{"cache-control":"public, max-age=30, stale-while-revalidate=120"}});
  }catch(e){return oops(e)}}
