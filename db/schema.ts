import{sql}from"drizzle-orm";import{index,integer,real,sqliteTable,text}from"drizzle-orm/sqlite-core";
export const paymentRequests=sqliteTable("payment_requests",{id:integer("id").primaryKey({autoIncrement:true}),requestNo:text("request_no").notNull().unique(),company:text("company").notNull(),department:text("department").notNull(),vendor:text("vendor").notNull(),amount:real("amount").notNull(),currency:text("currency").notNull(),due:text("due_date").notNull(),urgency:text("urgency").notNull().default("Normal"),status:text("status").notNull().default("Submitted"),owner:text("owner").notNull().default("Accountant queue"),description:text("description").notNull().default(""),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  raisedBy:text("raised_by").notNull().default(""),
  poNumber:text("po_number").notNull().default(""),
  rejectionNote:text("rejection_note").notNull().default(""),
  rejectedBy:text("rejected_by").notNull().default(""),
  rejectedAt:text("rejected_at").notNull().default(""),
  resubmitNote:text("resubmit_note").notNull().default(""),
  resubmittedAt:text("resubmitted_at").notNull().default("")});
export const auditLogs=sqliteTable("audit_logs",{id:integer("id").primaryKey({autoIncrement:true}),recordId:integer("record_id").notNull(),action:text("action").notNull(),previousValue:text("previous_value").notNull().default(""),newValue:text("new_value").notNull().default(""),actor:text("actor").notNull().default("Demo user"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const adminCredentials=sqliteTable("admin_credentials",{id:integer("id").primaryKey({autoIncrement:true}),email:text("email").notNull().unique(),passwordHash:text("password_hash").notNull(),salt:text("salt").notNull(),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});

/* ---------------- workforce ----------------
   Every column used in a WHERE or ORDER BY is indexed. D1 is single-threaded, so a
   missing index is a throughput problem for the whole database, not just one query. */

export const wfDepartments=sqliteTable("wf_departments",{
  id:text("id").primaryKey(),
  name:text("name").notNull(),
  code:text("code").notNull().default(""),
  color:text("color").notNull().default("#0b725d"),
  position:integer("position").notNull().default(0)});

export const wfRoles=sqliteTable("wf_roles",{
  id:text("id").primaryKey(),
  deptId:text("dept_id").notNull().default("d-group"),
  name:text("name").notNull(),
  type:text("type").notNull().default("Support"),
  parentId:text("parent_id"),
  color:text("color").notNull().default("#0b725d"),
  jd:text("jd").notNull().default("")},
  t=>[index("wf_roles_dept_idx").on(t.deptId),index("wf_roles_parent_idx").on(t.parentId)]);

export const wfEmployees=sqliteTable("wf_employees",{
  id:text("id").primaryKey(),
  code:text("code").notNull(),
  name:text("name").notNull(),
  designation:text("designation").notNull().default(""),
  roleId:text("role_id").notNull(),
  deptId:text("dept_id").notNull().default("d-group"),
  department:text("department").notNull().default(""),
  reportsTo:text("reports_to"),
  email:text("email").notNull().default(""),
  phone:text("phone").notNull().default(""),
  jd:text("jd").notNull().default(""),
  photoAt:text("photo_at").notNull().default(""),
  active:integer("active").notNull().default(1),
  joined:text("joined").notNull().default(""),
  companyId:text("company_id").notNull().default("c-trg")},
  t=>[index("wf_emp_role_idx").on(t.roleId),index("wf_emp_dept_idx").on(t.deptId),
      index("wf_emp_reports_idx").on(t.reportsTo),index("wf_emp_name_idx").on(t.name),
      index("wf_emp_active_idx").on(t.active),
      index("wf_emp_company_idx").on(t.companyId),
      index("wf_emp_company_active_idx").on(t.companyId,t.active)]);

/* Photos are held apart from the employee row so employee lists never drag image
   bytes across the wire. Served with a long cache and revalidated by photoAt. */
export const wfPhotos=sqliteTable("wf_photos",{
  employeeId:text("employee_id").primaryKey(),
  mime:text("mime").notNull().default("image/jpeg"),
  data:text("data").notNull(),
  bytes:integer("bytes").notNull().default(0),
  updatedAt:text("updated_at").notNull().default("")});

export const wfTasks=sqliteTable("wf_tasks",{
  id:text("id").primaryKey(),
  seriesId:text("series_id").notNull(),
  name:text("name").notNull(),
  description:text("description").notNull().default(""),
  frequency:text("frequency").notNull().default("Daily"),
  period:text("period").notNull().default(""),
  start:text("start_date").notNull().default(""),
  due:text("due_date").notNull().default(""),
  priority:text("priority").notNull().default("Medium"),
  employeeId:text("employee_id").notNull(),
  deptId:text("dept_id").notNull().default("d-group"),
  assignedBy:text("assigned_by").notNull().default(""),
  expectedOutput:text("expected_output").notNull().default(""),
  remarks:text("remarks").notNull().default(""),
  status:text("status").notNull().default("Not Started"),
  progress:integer("progress").notNull().default(0),
  qty:integer("qty").notNull().default(0),
  done:integer("done").notNull().default(0),
  blocker:text("blocker").notNull().default(""),
  nextAction:text("next_action").notNull().default(""),
  completedAt:text("completed_at").notNull().default(""),
  endsAt:text("ends_at").notNull().default(""),
  updatedAt:text("updated_at").notNull().default("")},
  t=>[index("wf_task_emp_idx").on(t.employeeId),index("wf_task_dept_idx").on(t.deptId),
      index("wf_task_due_idx").on(t.due),index("wf_task_status_idx").on(t.status),
      index("wf_task_series_idx").on(t.seriesId),index("wf_task_emp_freq_idx").on(t.employeeId,t.frequency),
      index("wf_task_due_status_idx").on(t.due,t.status),
      index("wf_task_dept_status_idx").on(t.deptId,t.status)]);

export const wfTokens=sqliteTable("wf_tokens",{
  id:text("id").primaryKey(),
  number:text("number").notNull(),
  taskType:text("task_type").notNull().default(""),
  created:text("created_date").notNull().default(""),
  createdBy:text("created_by").notNull().default(""),
  employeeId:text("employee_id").notNull(),
  functionRoleId:text("function_role_id").notNull().default(""),
  deptId:text("dept_id").notNull().default("d-group"),
  priority:text("priority").notNull().default("Medium"),
  reference:text("reference").notNull().default(""),
  qty:integer("qty").notNull().default(0),
  done:integer("done").notNull().default(0),
  status:text("status").notNull().default("Not Started"),
  remarks:text("remarks").notNull().default("")},
  t=>[index("wf_token_emp_idx").on(t.employeeId),index("wf_token_dept_idx").on(t.deptId),
      index("wf_token_status_idx").on(t.status)]);

/* Queries: raised against an employee, followed up n times, then resolved or closed. */
export const wfQueries=sqliteTable("wf_queries",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  title:text("title").notNull(),
  detail:text("detail").notNull().default(""),
  raisedBy:text("raised_by").notNull().default(""),
  employeeId:text("employee_id").notNull(),
  taskId:text("task_id").notNull().default(""),
  deptId:text("dept_id").notNull().default("d-group"),
  priority:text("priority").notNull().default("Medium"),
  status:text("status").notNull().default("Open"),
  raisedAt:text("raised_at").notNull().default(""),
  dueAt:text("due_at").notNull().default(""),
  followUps:integer("follow_ups").notNull().default(0),
  lastFollowUpAt:text("last_follow_up_at").notNull().default(""),
  resolvedAt:text("resolved_at").notNull().default(""),
  resolution:text("resolution").notNull().default("")},
  t=>[index("wf_query_emp_idx").on(t.employeeId),index("wf_query_dept_idx").on(t.deptId),
      index("wf_query_status_idx").on(t.status),index("wf_query_raised_idx").on(t.raisedAt)]);

export const wfLogs=sqliteTable("wf_logs",{
  id:text("id").primaryKey(),
  at:text("at").notNull(),
  actor:text("actor").notNull().default(""),
  entity:text("entity").notNull().default(""),
  entityId:text("entity_id").notNull().default(""),
  action:text("action").notNull().default(""),
  detail:text("detail").notNull().default("")},
  t=>[index("wf_log_at_idx").on(t.at),index("wf_log_entity_idx").on(t.entity,t.entityId)]);

/* Materialised dashboard figures. Recomputing them live costs a full scan of
   wf_tasks, which on a single-threaded D1 is throughput the whole application
   needs. One request per refresh window pays that cost and stores the result;
   every other request reads a single row. */
export const wfStats=sqliteTable("wf_stats",{
  id:text("id").primaryKey(),
  payload:text("payload").notNull().default("{}"),
  computedAt:text("computed_at").notNull().default("")});

/* Observations raised against work, tagged to one or more employees so the people
   who need to answer can find them, with a reply thread everyone tagged can see. */
export const wfObservations=sqliteTable("wf_observations",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  title:text("title").notNull(),
  detail:text("detail").notNull().default(""),
  deptId:text("dept_id").notNull().default("d-group"),
  taskId:text("task_id").notNull().default(""),
  risk:text("risk").notNull().default("Medium"),
  status:text("status").notNull().default("Open"),
  raisedBy:text("raised_by").notNull().default(""),
  raisedAt:text("raised_at").notNull().default(""),
  target:text("target").notNull().default(""),
  resolvedAt:text("resolved_at").notNull().default(""),
  resolution:text("resolution").notNull().default(""),
  replyCount:integer("reply_count").notNull().default(0),
  lastReplyAt:text("last_reply_at").notNull().default("")},
  t=>[index("wf_obs_dept_idx").on(t.deptId),index("wf_obs_status_idx").on(t.status),
      index("wf_obs_raised_idx").on(t.raisedAt),index("wf_obs_task_idx").on(t.taskId)]);

/* One row per tagged employee. A join table rather than a JSON column so
   "observations tagged to me" stays an indexed lookup instead of a table scan. */
export const wfObsTags=sqliteTable("wf_obs_tags",{
  id:text("id").primaryKey(),
  observationId:text("observation_id").notNull(),
  employeeId:text("employee_id").notNull()},
  t=>[index("wf_obstag_obs_idx").on(t.observationId),
      index("wf_obstag_emp_idx").on(t.employeeId),
      index("wf_obstag_pair_idx").on(t.employeeId,t.observationId)]);

export const wfObsReplies=sqliteTable("wf_obs_replies",{
  id:text("id").primaryKey(),
  observationId:text("observation_id").notNull(),
  employeeId:text("employee_id").notNull().default(""),
  authorName:text("author_name").notNull().default(""),
  text:text("body").notNull().default(""),
  at:text("at").notNull().default("")},
  t=>[index("wf_obsreply_obs_idx").on(t.observationId),index("wf_obsreply_at_idx").on(t.at)]);

/* Real accounts for the hosted build. Passwords are stored as a PBKDF2 hash with a
   per-user salt — never in clear text — and sessions are server-side rows so a
   sign-out or a deactivation takes effect immediately. */
export const wfUsers=sqliteTable("wf_users",{
  id:text("id").primaryKey(),
  email:text("email").notNull(),
  name:text("name").notNull(),
  employeeId:text("employee_id").notNull().default(""),
  roles:text("roles").notNull().default("[\"Requestor\"]"),
  salt:text("salt").notNull(),
  hash:text("hash").notNull(),
  iterations:integer("iterations").notNull().default(120000),
  mustChange:integer("must_change").notNull().default(0),
  active:integer("active").notNull().default(1),
  createdAt:text("created_at").notNull().default(""),
  passwordSetAt:text("password_set_at").notNull().default(""),
  lastLoginAt:text("last_login_at").notNull().default("")},
  t=>[index("wf_users_email_idx").on(t.email),index("wf_users_emp_idx").on(t.employeeId)]);

export const wfSessions=sqliteTable("wf_sessions",{
  token:text("token").primaryKey(),
  userId:text("user_id").notNull(),
  email:text("email").notNull(),
  roles:text("roles").notNull().default("[]"),
  createdAt:text("created_at").notNull().default(""),
  expiresAt:text("expires_at").notNull().default(""),
  lastSeenAt:text("last_seen_at").notNull().default("")},
  t=>[index("wf_sess_user_idx").on(t.userId),index("wf_sess_exp_idx").on(t.expiresAt)]);

/* ---------------- audit and accounts side ----------------
   These screens previously kept their data in browser memory or localStorage, so
   nothing survived a refresh and no two people saw the same thing. They are now
   ordinary D1 tables like the rest. */

export const wfCompanies=sqliteTable("wf_companies",{
  id:text("id").primaryKey(),
  name:text("name").notNull(),
  code:text("code").notNull().default(""),
  currency:text("currency").notNull().default("AED"),
  /* Reminder and escalation control, previously held only in the browser: how many
     days before a chase is sent, how many before it is escalated, and who the
     escalation goes to. */
  country:text("country").notNull().default(""),
  reminderDays:integer("reminder_days").notNull().default(2),
  escalationDays:integer("escalation_days").notNull().default(5),
  managementEmail:text("management_email").notNull().default(""),
  active:integer("active").notNull().default(1),
  position:integer("position").notNull().default(0)},
  t=>[index("wf_co_active_idx").on(t.active)]);

export const wfAuditTasks=sqliteTable("wf_audit_tasks",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  title:text("title").notNull(),
  kind:text("kind").notNull().default("Pre-Audit"),
  companyId:text("company_id").notNull().default(""),
  department:text("department").notNull().default(""),
  status:text("status").notNull().default("Available"),
  assignedTo:text("assigned_to").notNull().default(""),
  due:text("due_date").notNull().default(""),
  plannedStart:text("planned_start").notNull().default(""),
  plannedEnd:text("planned_end").notNull().default(""),
  notes:text("notes").notNull().default(""),
  dataProvider:text("data_provider").notNull().default(""),
  createdAt:text("created_at").notNull().default(""),
  acceptedAt:text("accepted_at").notNull().default(""),
  completedAt:text("completed_at").notNull().default("")},
  t=>[index("wf_at_kind_idx").on(t.kind),index("wf_at_status_idx").on(t.status),
      index("wf_at_company_idx").on(t.companyId),index("wf_at_assigned_idx").on(t.assignedTo),
      index("wf_at_kind_status_idx").on(t.kind,t.status)]);

export const wfBatches=sqliteTable("wf_batches",{
  id:text("id").primaryKey(),
  vendor:text("vendor").notNull(),
  requested:real("requested").notNull().default(0),
  approved:real("approved"),
  currency:text("currency").notNull().default("AED"),
  companyId:text("company_id").notNull().default(""),
  statement:text("statement").notNull().default(""),
  reconciliation:text("reconciliation").notNull().default(""),
  gl:text("gl").notNull().default(""),
  status:text("status").notNull().default("Audit Queue"),
  reason:text("reason").notNull().default(""),
  proof:text("proof").notNull().default(""),
  raisedBy:text("raised_by").notNull().default(""),
  createdAt:text("created_at").notNull().default(""),
  releasedAt:text("released_at").notNull().default("")},
  t=>[index("wf_batch_status_idx").on(t.status),index("wf_batch_created_idx").on(t.createdAt)]);

/* One thread for everyone, plus direct messages: a row with to_employee set is
   visible only to its author and its recipient. */
export const wfMessages=sqliteTable("wf_messages",{
  id:text("id").primaryKey(),
  authorId:text("author_id").notNull().default(""),
  authorName:text("author_name").notNull().default(""),
  authorEmail:text("author_email").notNull().default(""),
  authorRole:text("author_role").notNull().default(""),
  toEmployee:text("to_employee").notNull().default(""),
  body:text("body").notNull().default(""),
  at:text("at").notNull().default("")},
  t=>[index("wf_msg_at_idx").on(t.at),index("wf_msg_to_idx").on(t.toEmployee),
      index("wf_msg_author_idx").on(t.authorId)]);

/* ---------------- attachments ----------------
   Documents belong to whatever they were attached to — a payment request, a scheduled
   batch, a ticket, a task, an observation or an employee. Any number, all optional.
   The file itself goes to object storage; only the metadata lives here, so listing
   the attachments on a screen never drags the bytes across. */
export const wfAttachments=sqliteTable("wf_attachments",{
  id:text("id").primaryKey(),
  entityType:text("entity_type").notNull(),
  entityId:text("entity_id").notNull(),
  kind:text("kind").notNull().default("Other"),
  fileName:text("file_name").notNull(),
  mime:text("mime").notNull().default("application/octet-stream"),
  bytes:integer("bytes").notNull().default(0),
  storageKey:text("storage_key").notNull().default(""),
  note:text("note").notNull().default(""),
  uploadedBy:text("uploaded_by").notNull().default(""),
  uploadedAt:text("uploaded_at").notNull().default("")},
  t=>[index("wf_att_entity_idx").on(t.entityType,t.entityId),
      index("wf_att_kind_idx").on(t.kind),
      index("wf_att_uploaded_idx").on(t.uploadedAt)]);

/* Fallback store for deployments without an object-storage bucket bound. Kept
   separate so the bytes are only ever read when a file is actually downloaded. */
export const wfAttachmentBlobs=sqliteTable("wf_attachment_blobs",{
  id:text("id").primaryKey(),
  data:text("data").notNull()});

/* Training requests: somebody asks to be taught a topic, a colleague takes it on and
   marks it delivered, and the person who asked rates whether it actually helped.
   requested_by is the signing-in address, so "my requests" works without an employee
   record having to exist for every account. */
export const wfTrainings=sqliteTable("wf_trainings",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  topic:text("topic").notNull(),
  reason:text("reason").notNull().default(""),
  employeeId:text("employee_id").notNull().default(""),
  employeeName:text("employee_name").notNull().default(""),
  requestedBy:text("requested_by").notNull().default(""),
  deptId:text("dept_id").notNull().default(""),
  department:text("department").notNull().default(""),
  status:text("status").notNull().default("Requested"),
  requestedAt:text("requested_at").notNull().default(""),
  acceptedBy:text("accepted_by").notNull().default(""),
  acceptedAt:text("accepted_at").notNull().default(""),
  completedBy:text("completed_by").notNull().default(""),
  completedAt:text("completed_at").notNull().default(""),
  rating:integer("rating").notNull().default(0),
  feedback:text("feedback").notNull().default(""),
  feedbackAt:text("feedback_at").notNull().default("")},
  t=>[index("wf_train_status_idx").on(t.status),index("wf_train_emp_idx").on(t.employeeId),
      index("wf_train_by_idx").on(t.requestedBy),index("wf_train_at_idx").on(t.requestedAt),index("wf_train_dept_idx").on(t.deptId)]);
