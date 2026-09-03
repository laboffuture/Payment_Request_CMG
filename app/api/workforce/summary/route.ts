import{eq,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfStats}from"../../../../db/schema";
import{oops}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

type Row=Record<string,unknown>;
const n=(v:unknown)=>Number(v)||0;

/* Dashboard figures.
   Everything here is either an indexed count or a GROUP BY on an indexed column.
   The earlier version joined wf_tasks to wf_employees to wf_departments and took
   1.5 s against 200k tasks; on a single-threaded D1 that is under one query per
   second for the whole database. Tasks carry dept_id directly, so the department
   rollup needs no join at all, and the watchlist is built from the overdue subset
   rather than by grouping every task ever created.
   The role rollup is heavier and is served separately via ?detail=roles. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const url=new URL(req.url);
    const detail=url.searchParams.get("detail");
    const db=await getDb();
    const today=new Date().toISOString().slice(0,10);
    const WINDOW_MS=60_000;

    if(detail==="roles"){
      const roles=await db.all<Row>(sql`SELECT r.id, r.name, r.type, r.color,
          COUNT(DISTINCT e.id) AS employees,
          COUNT(t.id) AS tasks,
          SUM(CASE WHEN t.status='Completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN t.status NOT IN ('Completed','Cancelled') AND t.due_date<${today} THEN 1 ELSE 0 END) AS overdue
        FROM wf_roles r
        LEFT JOIN wf_employees e ON e.role_id=r.id
        LEFT JOIN wf_tasks t ON t.employee_id=e.id
        GROUP BY r.id HAVING employees > 0 ORDER BY r.type, r.name`);
      return Response.json({roles},{headers:{"cache-control":"public, max-age=60, stale-while-revalidate=300"}});
    }

    /* Serve the stored row when it is fresh. When it is stale the first request
       claims the refresh by bumping the timestamp before doing the work, so a burst
       of concurrent dashboard loads produces one recompute rather than a stampede;
       the rest get the previous payload, which is at most a minute old. */
    const cacheKey="summary";
    const [cached]=await db.select().from(wfStats).where(eq(wfStats.id,cacheKey)).limit(1);
    const age=cached?Date.now()-Date.parse(cached.computedAt||""):Infinity;
    const force=url.searchParams.get("refresh")==="1";
    if(cached&&!force&&age<WINDOW_MS)
      return new Response(cached.payload,{headers:{"content-type":"application/json",
        "cache-control":"public, max-age=30, stale-while-revalidate=120","x-wf-cache":"hit"}});
    if(cached&&!force){
      await db.update(wfStats).set({computedAt:new Date().toISOString()}).where(eq(wfStats.id,cacheKey));
    }

    const [totals,deptTasks,deptStaff,depts,queries,tokens,watchIds]=await Promise.all([
      db.all<Row>(sql`SELECT
          (SELECT COUNT(*) FROM wf_employees) AS employees,
          (SELECT COUNT(*) FROM wf_employees WHERE active=1) AS activeEmployees,
          (SELECT COUNT(*) FROM wf_tasks) AS tasks,
          (SELECT COUNT(*) FROM wf_tasks WHERE status='Completed') AS completed,
          (SELECT COUNT(*) FROM wf_tasks WHERE due_date=${today}) AS dueToday,
          (SELECT COUNT(*) FROM wf_tasks WHERE due_date<${today}
             AND status NOT IN ('Completed','Cancelled')) AS overdue,
          (SELECT COUNT(*) FROM wf_tasks WHERE status='Completed'
             AND completed_at<>'' AND completed_at<=due_date) AS onTime,
          (SELECT COUNT(*) FROM wf_tasks WHERE status='Completed'
             AND completed_at<>'' AND completed_at>due_date) AS late`),
      db.all<Row>(sql`SELECT dept_id AS id, COUNT(*) AS tasks,
          SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed
        FROM wf_tasks GROUP BY dept_id`),
      db.all<Row>(sql`SELECT dept_id AS id, COUNT(*) AS employees
        FROM wf_employees WHERE active=1 GROUP BY dept_id`),
      db.all<Row>(sql`SELECT id, name, color, position FROM wf_departments ORDER BY position`),
      db.all<Row>(sql`SELECT COUNT(*) AS raised,
          SUM(CASE WHEN status='Open' THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN status='Followed Up' THEN 1 ELSE 0 END) AS followed,
          SUM(CASE WHEN status IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS resolved
        FROM wf_queries`),
      db.all<Row>(sql`SELECT COUNT(*) AS tokens, COALESCE(SUM(qty),0) AS qty,
          COALESCE(SUM(done),0) AS done FROM wf_tokens`),
      // overdue rows only: a small indexed slice rather than every task in history
      db.all<Row>(sql`SELECT employee_id AS id, COUNT(*) AS overdue
        FROM wf_tasks WHERE due_date<${today} AND status NOT IN ('Completed','Cancelled')
        GROUP BY employee_id ORDER BY overdue DESC LIMIT 10`)]);

    const staff=new Map(deptStaff.map(r=>[String(r.id),n(r.employees)]));
    const work=new Map(deptTasks.map(r=>[String(r.id),r]));
    const departments=depts.map(d=>{
      const t=work.get(String(d.id))||{};
      return{id:d.id,name:d.name,color:d.color,employees:staff.get(String(d.id))||0,
        tasks:n(t.tasks),completed:n(t.completed),overdue:0}});

    // resolve only the ten names on the watchlist
    let watchlist:Row[]=[];
    if(watchIds.length){
      const ids=watchIds.map(r=>String(r.id));
      const placeholders=sql.join(ids.map(i=>sql`${i}`),sql`, `);
      const people=await db.all<Row>(sql`SELECT id, name, code, photo_at AS photoAt
        FROM wf_employees WHERE id IN (${placeholders})`);
      const byId=new Map(people.map(p=>[String(p.id),p]));
      watchlist=watchIds.map(r=>({...(byId.get(String(r.id))||{id:r.id,name:String(r.id),code:""}),
        overdue:n(r.overdue)}));
    }

    const tt=totals[0]||{};
    const finished=n(tt.onTime)+n(tt.late);
    const payload={
      totals:{employees:n(tt.employees),activeEmployees:n(tt.activeEmployees),tasks:n(tt.tasks),
        completed:n(tt.completed),pending:n(tt.tasks)-n(tt.completed),overdue:n(tt.overdue),
        dueToday:n(tt.dueToday),onTime:n(tt.onTime),late:n(tt.late),
        onTimeRate:finished?Math.round(n(tt.onTime)/finished*100):0},
      departments,roles:[],queries:queries[0]||{},tokens:tokens[0]||{},watchlist};
    const body=JSON.stringify(payload);
    const computedAt=new Date().toISOString();
    await db.insert(wfStats).values({id:cacheKey,payload:body,computedAt})
      .onConflictDoUpdate({target:wfStats.id,set:{payload:body,computedAt}});
    return new Response(body,{headers:{"content-type":"application/json",
      "cache-control":"public, max-age=30, stale-while-revalidate=120","x-wf-cache":"miss"}});
  }catch(e){return oops(e)}}
