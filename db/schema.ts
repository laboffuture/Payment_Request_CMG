import{sql}from"drizzle-orm";import{index,integer,real,sqliteTable,text}from"drizzle-orm/sqlite-core";
export const paymentRequests=sqliteTable("payment_requests",{id:integer("id").primaryKey({autoIncrement:true}),requestNo:text("request_no").notNull().unique(),company:text("company").notNull(),department:text("department").notNull(),vendor:text("vendor").notNull(),amount:real("amount").notNull(),currency:text("currency").notNull(),due:text("due_date").notNull(),urgency:text("urgency").notNull().default("Normal"),status:text("status").notNull().default("Submitted"),owner:text("owner").notNull().default("Accountant queue"),description:text("description").notNull().default(""),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  raisedBy:text("raised_by").notNull().default(""),
  poNumber:text("po_number").notNull().default(""),
  nature:text("nature").notNull().default(""),
  tds:text("tds").notNull().default(""),
  /* Recorded by accounts, not by the requestor: the rate applied and the amount held
     back. Both empty unless TDS applies. */
  tdsPercent:text("tds_percent").notNull().default(""),
  tdsValue:text("tds_value").notNull().default(""),
  /* Cash or bank, asked on every nature of payment. Empty on requests raised before it
     existed, which is truthful: nobody was asked. */
  paymentMode:text("payment_mode").notNull().default(""),
  /* The job a payment belongs to. Asked for on the natures tied to project work and
     hidden - and cleared - on the rest. */
  jobNo:text("job_no").notNull().default(""),
  jbCode:text("jb_code").notNull().default(""),
  project:text("project").notNull().default(""),
  jobLocation:text("job_location").notNull().default(""),
  workType:text("work_type").notNull().default(""),
  extra:text("extra").notNull().default(""),
  projectCode:text("project_code").notNull().default(""),
  invoiceNumber:text("invoice_number").notNull().default(""),
  invoiceDate:text("invoice_date").notNull().default(""),
  paymentTerms:text("payment_terms").notNull().default(""),
  period:text("period").notNull().default(""),
  lastActionBy:text("last_action_by").notNull().default(""),
  lastActionNote:text("last_action_note").notNull().default(""),
  lastActionAt:text("last_action_at").notNull().default(""),
  rejectionNote:text("rejection_note").notNull().default(""),
  rejectedBy:text("rejected_by").notNull().default(""),
  rejectedAt:text("rejected_at").notNull().default(""),
  resubmitNote:text("resubmit_note").notNull().default(""),
  resubmittedAt:text("resubmitted_at").notNull().default("")});
/* Master data an administrator maintains from the Settings screen.

   setting_options holds the choices behind a dropdown; which dropdowns exist is a
   registry in the code, because each one is wired to a place in a form. Only lists
   that are pure vocabulary appear there - a workflow status is not one of these,
   since the code branches on its value.

   setting_fields holds extra fields added to a form. Their values ride along with the
   record they were filled in on, so retiring a field never rewrites old records. */
export const settingOptions=sqliteTable("setting_options",{
  id:text("id").primaryKey(),
  listId:text("list_id").notNull(),
  name:text("name").notNull(),
  position:integer("position").notNull().default(0),
  active:integer("active").notNull().default(1)},
  t=>[index("set_opt_list_idx").on(t.listId,t.position)]);

export const settingFields=sqliteTable("setting_fields",{
  id:text("id").primaryKey(),
  form:text("form").notNull(),
  label:text("label").notNull(),
  type:text("type").notNull().default("text"),
  options:text("options").notNull().default(""),
  required:integer("required").notNull().default(0),
  position:integer("position").notNull().default(0),
  active:integer("active").notNull().default(1)},
  t=>[index("set_fld_form_idx").on(t.form,t.position)]);

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
  companyId:text("company_id").notNull().default("c-trg"),
  extra:text("extra").notNull().default("")},
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
  updatedAt:text("updated_at").notNull().default(""),
  extra:text("extra").notNull().default("")},
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
  remarks:text("remarks").notNull().default(""),
  extra:text("extra").notNull().default("")},
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
  resolution:text("resolution").notNull().default(""),
  extra:text("extra").notNull().default(""),
  raiserEmail:text("raiser_email").notNull().default("")},
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
  lastReplyAt:text("last_reply_at").notNull().default(""),
  raisedByEmail:text("raised_by_email").notNull().default(""),
  /* The observation sheet: where it was found, what it could cost, who was spoken to,
     why it happened, what it was worth, who owns the fix and what they promised. */
  area:text("area").notNull().default(""),
  impact:text("impact").notNull().default(""),
  stakeholder:text("stakeholder").notNull().default(""),
  rootCause:text("root_cause").notNull().default(""),
  transactionValue:text("transaction_value").notNull().default(""),
  responsibility:text("responsibility").notNull().default(""),
  actionPlan:text("action_plan").notNull().default("")},
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
  /* Login addresses this account may read requests from, as a JSON array. Only a
     department head uses it; empty means their own requests alone. */
  visibleRaisers:text("visible_raisers").notNull().default("[]"),
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
  position:integer("position").notNull().default(0),
  extra:text("extra").notNull().default("")},
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
  attendees:text("attendees").notNull().default(""),   // employee ids, comma separated
  createdAt:text("created_at").notNull().default(""),
  acceptedAt:text("accepted_at").notNull().default(""),
  completedAt:text("completed_at").notNull().default(""),
  extra:text("extra").notNull().default(""),
  raisedByEmail:text("raised_by_email").notNull().default(""),
  frequency:text("frequency").notNull().default(""),
  /* Recurrence. recurDay is the weekday a weekly series falls on, so "every Monday" can
     be stated at all; recurUntil is the date it stops, empty meaning it keeps going; and
     seriesId is the first occurrence's own id, carried by every later one so a series can
     be followed without a second table to keep in step with this one. */
  recurDay:text("recur_day").notNull().default(""),
  recurUntil:text("recur_until").notNull().default(""),
  seriesId:text("series_id").notNull().default("")},
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
  releasedAt:text("released_at").notNull().default(""),
  extra:text("extra").notNull().default(""),
  raiserEmail:text("raiser_email").notNull().default("")},
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
  feedbackAt:text("feedback_at").notNull().default(""),
  extra:text("extra").notNull().default("")},
  t=>[index("wf_train_status_idx").on(t.status),index("wf_train_emp_idx").on(t.employeeId),
      index("wf_train_by_idx").on(t.requestedBy),index("wf_train_at_idx").on(t.requestedAt),index("wf_train_dept_idx").on(t.deptId)]);

/* One message for one person: a record that now needs them, or has moved on. Addressed
   by login email. Unread while read_at is empty. */
export const wfNotifications=sqliteTable("wf_notifications",{
  id:text("id").primaryKey(),
  recipient:text("recipient").notNull(),
  title:text("title").notNull(),
  body:text("body").notNull().default(""),
  module:text("module").notNull().default(""),
  recordId:text("record_id").notNull().default(""),
  createdAt:text("created_at").notNull(),
  readAt:text("read_at").notNull().default(""),
  /* When this was emailed, empty meaning it was not. Keeps a notification from being
     emailed twice, and keeps the stored backlog out of anybody's inbox. */
  emailedAt:text("emailed_at").notNull().default("")},
  t=>[index("wf_notif_recipient_idx").on(t.recipient,t.readAt,t.createdAt)]);

/* The people we pay. The payment form suggests from here as a requestor types, and a
   name it does not yet hold is added when a request uses it - so the register fills
   itself rather than needing to be maintained by hand. */
export const wfVendors=sqliteTable("wf_vendors",{
  id:text("id").primaryKey(),
  name:text("name").notNull(),
  active:integer("active").notNull().default(1),
  createdAt:text("createdAt").notNull().default(""),
  createdBy:text("createdBy").notNull().default("")},
  t=>[index("wf_vendor_active_idx").on(t.active,t.name)]);

/* Accounts Receivable: one row per job, carried from the notification that a job
   exists through to audit verification. The stage is the row's position in
   lib/receivable-stages.ts - kept as the text of the stage rather than a number so
   a row read straight out of the database still says what it means. */
export const wfReceivables=sqliteTable("wf_receivables",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  stage:text("stage").notNull().default("Job Notification"),
  // stage 1: the notification itself
  customer:text("customer").notNull().default(""),
  companyId:text("company_id").notNull().default(""),
  department:text("department").notNull().default(""),
  description:text("description").notNull().default(""),
  notifiedOn:text("notified_on").notNull().default(""),
  /* The job notification form: what the job is, for whom, under whom, and on what
     terms. The notification number is `ref`; `description` carries the job name for the
     modules downstream that already read it. */
  jobName:text("job_name").notNull().default(""),
  projectName:text("project_name").notNull().default(""),
  jobCode:text("job_code").notNull().default(""),
  jobLocation:text("job_location").notNull().default(""),
  pmName:text("pm_name").notNull().default(""),
  pmEmail:text("pm_email").notNull().default(""),
  startDate:text("start_date").notNull().default(""),
  endDate:text("end_date").notNull().default(""),
  poNumber:text("po_number").notNull().default(""),
  contractValue:real("contract_value").notNull().default(0),
  contractCurrency:text("contract_currency").notNull().default("AED"),
  jobType:text("job_type").notNull().default(""),
  scope:text("scope").notNull().default(""),
  boqAvailable:text("boq_available").notNull().default(""),
  managementApproval:text("management_approval").notNull().default(""),
  priority:text("priority").notNull().default("Normal"),
  remarksNote:text("notification_remarks").notNull().default(""),
  // stage 2: the job as CRM knows it
  crmJobNo:text("crm_job_no").notNull().default(""),
  /* The CRM job creation form: the client's contact, the commercial terms and the people
     on the job. The job code is the CRM key; the fields the notification already held
     are edited in place rather than duplicated. */
  clientContact:text("client_contact").notNull().default(""),
  clientAddress:text("client_address").notNull().default(""),
  projectType:text("project_type").notNull().default(""),
  contractDate:text("contract_date").notNull().default(""),
  salesPersonName:text("sales_person_name").notNull().default(""),
  salesPersonEmail:text("sales_person_email").notNull().default(""),
  estimationPersonName:text("estimation_person_name").notNull().default(""),
  estimationPersonEmail:text("estimation_person_email").notNull().default(""),
  jobStatus:text("job_status").notNull().default(""),
  boqValue:real("boq_value").notNull().default(0),
  estimatedCost:real("estimated_cost").notNull().default(0),
  estimatedMargin:real("estimated_margin").notNull().default(0),
  marginPercent:real("margin_percent").notNull().default(0),
  paymentTerms:text("payment_terms").notNull().default(""),
  retentionPercent:real("retention_percent").notNull().default(0),
  advancePercent:real("advance_percent").notNull().default(0),
  crmOwner:text("crm_owner").notNull().default(""),
  crmAt:text("crm_at").notNull().default(""),
  // stage 3: what was sold against that job
  soNo:text("so_no").notNull().default(""),
  /* The sales order form: its date, tax, the totals worked out from the contract, the BOQ
     reference and who approved it when. */
  soDate:text("so_date").notNull().default(""),
  taxAmount:real("tax_amount").notNull().default(0),
  totalOrderValue:real("total_order_value").notNull().default(0),
  advanceAmount:real("advance_amount").notNull().default(0),
  retentionAmount:real("retention_amount").notNull().default(0),
  boqReference:text("boq_reference").notNull().default(""),
  soApprovedByName:text("so_approved_by_name").notNull().default(""),
  soApprovedByEmail:text("so_approved_by_email").notNull().default(""),
  soApprovalDate:text("so_approval_date").notNull().default(""),
  amount:real("amount").notNull().default(0),
  currency:text("currency").notNull().default("AED"),
  soAt:text("so_at").notNull().default(""),
  // stage 4: audit
  submittedAt:text("submitted_at").notNull().default(""),
  verifiedBy:text("verified_by").notNull().default(""),
  verifiedAt:text("verified_at").notNull().default(""),
  remarks:text("remarks").notNull().default(""),
  /* Why it came back and when. Kept on the row rather than only in the audit log
     because the person correcting it needs to read it on the entry itself. */
  returnNote:text("return_note").notNull().default(""),
  returnedAt:text("returned_at").notNull().default(""),
  raisedByEmail:text("raised_by_email").notNull().default(""),
  createdAt:text("created_at").notNull().default(""),
  updatedAt:text("updated_at").notNull().default("")},
  t=>[index("wf_recv_stage_idx").on(t.stage),index("wf_recv_company_idx").on(t.companyId),
      index("wf_recv_created_idx").on(t.createdAt),index("wf_recv_ref_idx").on(t.ref)]);

/* Accounts Receivable, module 2: Planning & Procurement. One row per job being planned,
   pointing back at the Job Notification entry it came from. The job's customer and
   description are copied in when planning starts, so the plan still reads correctly if
   the notification is later edited. */
export const wfPlanning=sqliteTable("wf_planning",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  stage:text("stage").notNull().default("Assign Project Manager"),
  // the job, from Job Notification
  jobId:text("job_id").notNull().default(""),
  jobRef:text("job_ref").notNull().default(""),
  customer:text("customer").notNull().default(""),
  companyId:text("company_id").notNull().default(""),
  description:text("description").notNull().default(""),
  // assign project manager
  pmName:text("pm_name").notNull().default(""),
  pmEmail:text("pm_email").notNull().default(""),
  pmAt:text("pm_at").notNull().default(""),
  // project schedule and planning
  startDate:text("start_date").notNull().default(""),
  endDate:text("end_date").notNull().default(""),
  planNotes:text("plan_notes").notNull().default(""),
  planAt:text("plan_at").notNull().default(""),
  // detailed BOM and procurement planning
  bomSummary:text("bom_summary").notNull().default(""),
  bomCost:real("bom_cost").notNull().default(0),
  currency:text("currency").notNull().default("AED"),
  procurementNotes:text("procurement_notes").notNull().default(""),
  bomAt:text("bom_at").notNull().default(""),
  // audit
  submittedAt:text("submitted_at").notNull().default(""),
  verifiedBy:text("verified_by").notNull().default(""),
  verifiedAt:text("verified_at").notNull().default(""),
  remarks:text("remarks").notNull().default(""),
  returnNote:text("return_note").notNull().default(""),
  returnedAt:text("returned_at").notNull().default(""),
  raisedByEmail:text("raised_by_email").notNull().default(""),
  createdAt:text("created_at").notNull().default(""),
  updatedAt:text("updated_at").notNull().default("")},
  t=>[index("wf_plan_stage_idx").on(t.stage),index("wf_plan_job_idx").on(t.jobId),
      index("wf_plan_pm_idx").on(t.pmEmail),index("wf_plan_created_idx").on(t.createdAt)]);

/* Accounts Receivable, module 3: Completion and Billing - the jobs register. One row per
   job whose plan is verified in Planning & Procurement, active or not. While active, a
   completion request is issued every `everyDays` days (weekly unless changed); the job,
   its manager and its contract value are copied from the plan and the job notification. */
export const wfBillingJobs=sqliteTable("wf_billing_jobs",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  jobId:text("job_id").notNull().default(""),
  planId:text("plan_id").notNull().default(""),
  jobRef:text("job_ref").notNull().default(""),
  customer:text("customer").notNull().default(""),
  companyId:text("company_id").notNull().default(""),
  description:text("description").notNull().default(""),
  pmName:text("pm_name").notNull().default(""),
  pmEmail:text("pm_email").notNull().default(""),
  contractValue:real("contract_value").notNull().default(0),
  currency:text("currency").notNull().default("AED"),
  active:integer("active").notNull().default(1),
  everyDays:integer("every_days").notNull().default(7),
  lastRequestedAt:text("last_requested_at").notNull().default(""),
  nextRequestAt:text("next_request_at").notNull().default(""),
  createdAt:text("created_at").notNull().default(""),
  updatedAt:text("updated_at").notNull().default("")},
  t=>[index("wf_bjob_job_idx").on(t.jobId),index("wf_bjob_pm_idx").on(t.pmEmail),
      index("wf_bjob_next_idx").on(t.nextRequestAt)]);

/* One completion cycle: a request to the project manager, and what follows from it -
   cost control's certification, management's approval, the invoice and audit. */
export const wfCompletions=sqliteTable("wf_completions",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  stage:text("stage").notNull().default("Project Manager Update"),
  billingJobId:text("billing_job_id").notNull().default(""),
  jobRef:text("job_ref").notNull().default(""),
  customer:text("customer").notNull().default(""),
  pmName:text("pm_name").notNull().default(""),
  pmEmail:text("pm_email").notNull().default(""),
  contractValue:real("contract_value").notNull().default(0),
  currency:text("currency").notNull().default("AED"),
  requestedAt:text("requested_at").notNull().default(""),
  requestedBy:text("requested_by").notNull().default(""),
  percentComplete:real("percent_complete").notNull().default(0),
  completionNotes:text("completion_notes").notNull().default(""),
  updatedBy:text("updated_by").notNull().default(""),
  pmUpdatedAt:text("pm_updated_at").notNull().default(""),
  certifiedPercent:real("certified_percent").notNull().default(0),
  certificationNotes:text("certification_notes").notNull().default(""),
  certifiedBy:text("certified_by").notNull().default(""),
  certifiedAt:text("certified_at").notNull().default(""),
  approvalNotes:text("approval_notes").notNull().default(""),
  approvedBy:text("approved_by").notNull().default(""),
  approvedAt:text("approved_at").notNull().default(""),
  invoiceNo:text("invoice_no").notNull().default(""),
  invoiceDate:text("invoice_date").notNull().default(""),
  invoiceAmount:real("invoice_amount").notNull().default(0),
  invoicedBy:text("invoiced_by").notNull().default(""),
  invoicedAt:text("invoiced_at").notNull().default(""),
  verifiedBy:text("verified_by").notNull().default(""),
  verifiedAt:text("verified_at").notNull().default(""),
  remarks:text("remarks").notNull().default(""),
  returnNote:text("return_note").notNull().default(""),
  returnedAt:text("returned_at").notNull().default(""),
  createdAt:text("created_at").notNull().default(""),
  updatedAt:text("updated_at").notNull().default("")},
  t=>[index("wf_comp_stage_idx").on(t.stage),index("wf_comp_job_idx").on(t.billingJobId),
      index("wf_comp_pm_idx").on(t.pmEmail),index("wf_comp_created_idx").on(t.createdAt)]);

/* Accounts Receivable, module 4: Debt Collection. One case per invoice whose due date has
   passed unpaid - found among the invoices verified in Completion and Billing, or added by
   hand for an invoice raised before the portal. What the customer has paid so far and the
   latest position are kept on the case; everything that led there is in the log below. */
export const wfCollections=sqliteTable("wf_collections",{
  id:text("id").primaryKey(),
  ref:text("ref").notNull(),
  stage:text("stage").notNull().default("Invoice Missed"),
  completionId:text("completion_id").notNull().default(""),
  billingJobId:text("billing_job_id").notNull().default(""),
  jobRef:text("job_ref").notNull().default(""),
  customer:text("customer").notNull().default(""),
  pmName:text("pm_name").notNull().default(""),
  invoiceNo:text("invoice_no").notNull().default(""),
  invoiceDate:text("invoice_date").notNull().default(""),
  invoiceAmount:real("invoice_amount").notNull().default(0),
  currency:text("currency").notNull().default("AED"),
  creditDays:integer("credit_days").notNull().default(30),
  dueDate:text("due_date").notNull().default(""),
  status:text("status").notNull().default("Not contacted"),
  promisedDate:text("promised_date").notNull().default(""),
  amountReceived:real("amount_received").notNull().default(0),
  followUps:integer("follow_ups").notNull().default(0),
  lastFollowUpAt:text("last_follow_up_at").notNull().default(""),
  collectorName:text("collector_name").notNull().default(""),
  collectorEmail:text("collector_email").notNull().default(""),
  submittedAt:text("submitted_at").notNull().default(""),
  verifiedBy:text("verified_by").notNull().default(""),
  verifiedAt:text("verified_at").notNull().default(""),
  remarks:text("remarks").notNull().default(""),
  returnNote:text("return_note").notNull().default(""),
  returnedAt:text("returned_at").notNull().default(""),
  source:text("source").notNull().default("billing"),
  createdAt:text("created_at").notNull().default(""),
  updatedAt:text("updated_at").notNull().default("")},
  t=>[index("wf_coll_stage_idx").on(t.stage),index("wf_coll_completion_idx").on(t.completionId),
      index("wf_coll_due_idx").on(t.dueDate),index("wf_coll_created_idx").on(t.createdAt)]);

/* Every call, email, status update and payment recorded against a case, in order. */
export const wfCollectionEvents=sqliteTable("wf_collection_events",{
  id:text("id").primaryKey(),
  caseId:text("case_id").notNull().default(""),
  kind:text("kind").notNull().default(""),
  at:text("at").notNull().default(""),
  byName:text("by_name").notNull().default(""),
  byEmail:text("by_email").notNull().default(""),
  contact:text("contact").notNull().default(""),
  notes:text("notes").notNull().default(""),
  status:text("status").notNull().default(""),
  amount:real("amount").notNull().default(0),
  promisedDate:text("promised_date").notNull().default("")},
  t=>[index("wf_collev_case_idx").on(t.caseId,t.at)]);
