import{desc,eq,sql}from"drizzle-orm";
import{getDb}from"../../../../db";
import{wfDepartments,wfEmployees,wfObsReplies,wfObsTags,wfObservations,wfQueries,wfRoles,wfTasks,wfTokens}from"../../../../db/schema";
import{bad,oops}from"../../../../lib/workforce-api";
import{requireAuth}from"../../../../lib/auth";

type Agg=Record<string,number>;

/* The one-click employee view. Counts are aggregated in SQL rather than by pulling
   rows into the Worker, so the cost of this endpoint is flat regardless of how many
   years of task history the employee has. */
export async function GET(req:Request){
  try{
    const{response}=await requireAuth(req,"read");
    if(response)return response;
    const id=new URL(req.url).searchParams.get("employeeId")||"";
    if(!id)return bad("employeeId is required");
    const db=await getDb();
    const today=new Date().toISOString().slice(0,10);

    const [employee]=await db.select().from(wfEmployees).where(eq(wfEmployees.id,id)).limit(1);
    if(!employee)return bad("Employee not found",404);

    const [taskAgg,queryAgg,tokenAgg,recentTasks,recentQueries,tokens,role,dept,manager,reports,obsAgg,taggedObs]=await Promise.all([
      db.all<Agg>(sql`SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status='Completed' AND completed_at<>'' AND completed_at<=due_date THEN 1 ELSE 0 END) AS onTime,
          SUM(CASE WHEN status='Completed' AND completed_at<>'' AND completed_at>due_date THEN 1 ELSE 0 END) AS late,
          SUM(CASE WHEN status NOT IN ('Completed','Cancelled') AND due_date<${today} THEN 1 ELSE 0 END) AS delayed,
          SUM(CASE WHEN status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN frequency='Daily' THEN 1 ELSE 0 END) AS daily,
          SUM(CASE WHEN frequency='Weekly' THEN 1 ELSE 0 END) AS weekly,
          SUM(CASE WHEN frequency='Monthly' THEN 1 ELSE 0 END) AS monthly,
          SUM(CASE WHEN frequency='One Time' THEN 1 ELSE 0 END) AS oneTime
        FROM wf_tasks WHERE employee_id=${id}`),
      db.all<Agg>(sql`SELECT
          COUNT(*) AS raised,
          SUM(CASE WHEN status='Open' THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN status='Followed Up' THEN 1 ELSE 0 END) AS followed,
          SUM(CASE WHEN status IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS resolved,
          SUM(follow_ups) AS followUpCount
        FROM wf_queries WHERE employee_id=${id}`),
      db.all<Agg>(sql`SELECT COUNT(*) AS tokens, COALESCE(SUM(qty),0) AS qty,
          COALESCE(SUM(done),0) AS done FROM wf_tokens WHERE employee_id=${id}`),
      db.select().from(wfTasks).where(eq(wfTasks.employeeId,id)).orderBy(desc(wfTasks.due)).limit(60),
      db.select().from(wfQueries).where(eq(wfQueries.employeeId,id)).orderBy(desc(wfQueries.raisedAt)).limit(25),
      db.select().from(wfTokens).where(eq(wfTokens.employeeId,id)).orderBy(desc(wfTokens.created)).limit(25),
      db.select().from(wfRoles).where(eq(wfRoles.id,employee.roleId)).limit(1),
      db.select().from(wfDepartments).where(eq(wfDepartments.id,employee.deptId)).limit(1),
      employee.reportsTo
        ?db.select({id:wfEmployees.id,name:wfEmployees.name}).from(wfEmployees).where(eq(wfEmployees.id,employee.reportsTo)).limit(1)
        :Promise.resolve([]),
      db.select({id:wfEmployees.id,name:wfEmployees.name,code:wfEmployees.code,photoAt:wfEmployees.photoAt})
        .from(wfEmployees).where(eq(wfEmployees.reportsTo,id)).limit(50),
      // observations this person is tagged on, resolved through the indexed join table
      db.all<Agg>(sql`SELECT
          COUNT(*) AS tagged,
          SUM(CASE WHEN o.status IN ('Open','Acknowledged') THEN 1 ELSE 0 END) AS openTagged,
          SUM(CASE WHEN o.status IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS closedTagged,
          SUM(CASE WHEN o.status IN ('Open','Acknowledged') AND o.target<>'' AND o.target<${today}
            THEN 1 ELSE 0 END) AS overdueTagged,
          (SELECT COUNT(*) FROM wf_obs_replies WHERE employee_id=${id}) AS replies
        FROM wf_obs_tags t JOIN wf_observations o ON o.id=t.observation_id
        WHERE t.employee_id=${id}`),
      db.all<Record<string,unknown>>(sql`SELECT o.id, o.ref, o.title, o.risk, o.status, o.target,
          o.reply_count AS replyCount, o.raised_by AS raisedBy, o.raised_at AS raisedAt
        FROM wf_obs_tags t JOIN wf_observations o ON o.id=t.observation_id
        WHERE t.employee_id=${id} ORDER BY o.raised_at DESC LIMIT 25`)]);

    const t=taskAgg[0]||{};
    const q=queryAgg[0]||{};
    const k=tokenAgg[0]||{};
    const n=(v:unknown)=>Number(v)||0;
    const finished=n(t.onTime)+n(t.late);

    return Response.json({
      employee:{...employee,active:!!employee.active},
      role:role[0]||null,
      department:dept[0]||null,
      manager:manager[0]||null,
      directReports:reports,
      performance:{
        total:n(t.total),completed:n(t.completed),open:n(t.open),
        onTime:n(t.onTime),late:n(t.late),delayed:n(t.delayed),
        onTimeRate:finished?Math.round(n(t.onTime)/finished*100):0,
        completionRate:n(t.total)?Math.round(n(t.completed)/n(t.total)*100):0,
        byFrequency:{Daily:n(t.daily),Weekly:n(t.weekly),Monthly:n(t.monthly),"One Time":n(t.oneTime)}},
      queryStats:{
        raised:n(q.raised),open:n(q.open),followed:n(q.followed),resolved:n(q.resolved),
        followUpCount:n(q.followUpCount),
        resolutionRate:n(q.raised)?Math.round(n(q.resolved)/n(q.raised)*100):0},
      tokenStats:{tokens:n(k.tokens),qty:n(k.qty),done:n(k.done),pending:Math.max(n(k.qty)-n(k.done),0)},
      observationStats:{tagged:n((obsAgg[0]||{}).tagged),open:n((obsAgg[0]||{}).openTagged),
        closed:n((obsAgg[0]||{}).closedTagged),overdue:n((obsAgg[0]||{}).overdueTagged),
        replies:n((obsAgg[0]||{}).replies),
        responseRate:n((obsAgg[0]||{}).tagged)
          ?Math.round(n((obsAgg[0]||{}).closedTagged)/n((obsAgg[0]||{}).tagged)*100):0},
      observations:taggedObs,
      tasks:recentTasks,queries:recentQueries,tokens});
  }catch(e){return oops(e)}}
