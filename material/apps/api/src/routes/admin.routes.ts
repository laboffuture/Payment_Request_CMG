import { Router } from 'express';
import { syncExternalMasters } from '../integrations/paymentApp.js';
import multer from 'multer';
import { z } from 'zod';
import {
  MAX_LOGO_BYTES,
  MAX_VENDOR_DOC_BYTES,
  ROLES,
  createCategoryInput,
  createItemInput,
  createProjectInput,
  importPaymentUsersInput,
  importRunInput,
  testEmailInput,
  updateNotifyRuleInput,
  upsertCompanyInput,
  upsertUserInput,
  upsertVendorInput,
} from '@cm/shared';
import { sendCsv, wrap } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { authorize, requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { idempotency } from '../middleware/idempotency.js';
import {
  createUser,
  importPaymentUsers,
  listImportablePaymentUsers,
  listUsers,
  updateUser,
} from '../services/user.service.js';
import {
  createCategory,
  createProject,
  createVendor,
  listCategories,
  listCompanies,
  listProjects,
  listVendors,
  removeCompanyLogo,
  setCompanyLogo,
  toggleCategory,
  updateVendor,
  upsertCompany,
} from '../services/masters.service.js';
import { createItem, listItems, pendingNewItemCount } from '../services/item.service.js';
import { runImport } from '../services/importRun.service.js';
import {
  dropPreview,
  preview as previewImport,
  readPreviewRows,
  templateCsv,
} from '../services/import.service.js';
import {
  listOutbox,
  listRules,
  mailHealth,
  queueTestEmail,
  retryFailed,
  sendQueuedNow,
  updateRule,
} from '../services/mail.service.js';
import { importQueue, queuesAvailable } from '../jobs/queues.js';
import { badRequest, notFound } from '../lib/errors.js';
import { actorOf } from '../middleware/auth.js';

/** Marks an import that ran in the request because no queue was available. */
const INLINE_JOB_ID = 'inline';

export const adminRouter: Router = Router();

// §13: memory storage — nothing untrusted ever reaches the disk.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(MAX_LOGO_BYTES, MAX_VENDOR_DOC_BYTES) },
});
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

adminRouter.use(requireAuth, authorize('ADMIN'));

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

adminRouter.get(
  '/users',
  wrap(async (req, res) => {
    const role = z.enum(ROLES).optional().parse(req.query.role || undefined);
    res.json(await listUsers(role));
  }),
);

adminRouter.post(
  '/users',
  idempotency,
  validateBody(upsertUserInput),
  wrap(async (req, res) => {
    res.status(201).json(await createUser(req.body));
  }),
);

adminRouter.put(
  '/users/:id',
  validateBody(upsertUserInput),
  wrap(async (req, res) => {
    res.json(await updateUser(req.params.id!, req.body));
  }),
);

/** Prototype: A.importUsers — the pick list, then the import. */
adminRouter.get(
  '/users/payment-app',
  wrap(async (_req, res) => {
    res.json(await listImportablePaymentUsers());
  }),
);

adminRouter.post(
  '/users/import-payment',
  idempotency,
  validateBody(importPaymentUsersInput),
  wrap(async (req, res) => {
    res.json(await importPaymentUsers(req.body));
  }),
);

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

adminRouter.get('/vendors', wrap(async (_req, res) => res.json(await listVendors())));

adminRouter.post(
  '/vendors',
  idempotency,
  validateBody(upsertVendorInput),
  wrap(async (req, res) => {
    res.status(201).json(await createVendor(req.body));
  }),
);

adminRouter.put(
  '/vendors/:id',
  validateBody(upsertVendorInput),
  wrap(async (req, res) => {
    res.json(await updateVendor(req.params.id!, req.body));
  }),
);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

adminRouter.get(
  '/projects',
  wrap(async (_req, res) => res.json(await listProjects(true))),
);

/** Pull the Payment app's job register now, instead of waiting for the timer. */
adminRouter.post(
  '/projects/sync',
  wrap(async (_req, res) => {
    res.json(await syncExternalMasters());
  }),
);

adminRouter.post(
  '/projects',
  idempotency,
  validateBody(createProjectInput),
  wrap(async (req, res) => {
    res.status(201).json(await createProject(req.body));
  }),
);

// ---------------------------------------------------------------------------
// Companies — one profile per billing entity
// ---------------------------------------------------------------------------

adminRouter.get(
  '/companies',
  wrap(async (_req, res) => res.json(await listCompanies())),
);

adminRouter.post(
  '/companies',
  idempotency,
  validateBody(upsertCompanyInput),
  wrap(async (req, res) => {
    res.status(201).json(await upsertCompany(null, req.body));
  }),
);

adminRouter.put(
  '/companies/:id',
  validateBody(upsertCompanyInput),
  wrap(async (req, res) => {
    res.json(await upsertCompany(req.params.id!, req.body));
  }),
);

adminRouter.post(
  '/companies/:id/logo',
  uploadLimiter,
  memoryUpload.single('logo'),
  wrap(async (req, res) => {
    if (!req.file) throw badRequest('Choose a logo file');
    res.json(await setCompanyLogo(req.params.id!, req.file));
  }),
);

adminRouter.delete(
  '/companies/:id/logo',
  wrap(async (req, res) => {
    res.json(await removeCompanyLogo(req.params.id!));
  }),
);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

adminRouter.get(
  '/categories',
  wrap(async (_req, res) => res.json(await listCategories())),
);

adminRouter.post(
  '/categories',
  validateBody(createCategoryInput),
  wrap(async (req, res) => {
    res.status(201).json(await createCategory(req.body));
  }),
);

adminRouter.post(
  '/categories/:id/toggle',
  wrap(async (req, res) => {
    res.json(await toggleCategory(req.params.id!));
  }),
);

// ---------------------------------------------------------------------------
// Item master
// ---------------------------------------------------------------------------

adminRouter.get(
  '/items',
  wrap(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    res.json({
      items: await listItems({ category: category || undefined }),
      pendingNewItems: await pendingNewItemCount(),
    });
  }),
);

adminRouter.post(
  '/items',
  idempotency,
  validateBody(createItemInput),
  wrap(async (req, res) => {
    res.status(201).json(await createItem(req.body, actorOf(req).id));
  }),
);

// ---------------------------------------------------------------------------
// Import inventory (one time)
// ---------------------------------------------------------------------------

adminRouter.get(
  '/import/template.csv',
  wrap(async (_req, res) => {
    sendCsv(res, 'inventory-import-template.csv', await templateCsv());
  }),
);

adminRouter.post(
  '/import/preview',
  csvUpload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) throw badRequest('Choose the filled CSV file');
    res.json(await previewImport(req.file.buffer.toString('utf8')));
  }),
);

/** The write itself is a job — a long file must not hold the request open. */
adminRouter.post(
  '/import/run',
  idempotency,
  validateBody(importRunInput),
  wrap(async (req, res) => {
    const rows = await readPreviewRows(req.body.token);
    if (!rows.length) throw badRequest('Nothing to import');

    // Without a queue (local development, see redis.ts) run it here instead.
    // An import is a one-off of a few thousand rows, so the wait is bearable —
    // and a developer can still try the feature end to end.
    if (!queuesAvailable()) {
      const outcome = await runImport(rows, actorOf(req).id);
      await dropPreview(req.body.token);
      res.status(200).json({ jobId: INLINE_JOB_ID, rows: rows.length, ...outcome });
      return;
    }

    const job = await importQueue().add('run', {
      token: req.body.token,
      userId: actorOf(req).id,
    });
    res.status(202).json({ jobId: String(job.id), rows: rows.length });
  }),
);

adminRouter.delete(
  '/import/:token',
  wrap(async (req, res) => {
    await dropPreview(req.params.token!);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/import/:jobId/status',
  wrap(async (req, res) => {
    // An inline run already finished before the response was sent.
    if (req.params.jobId === INLINE_JOB_ID || !queuesAvailable()) {
      res.json({ jobId: INLINE_JOB_ID, state: 'completed', progress: 100 });
      return;
    }

    const job = await importQueue().getJob(req.params.jobId!);
    if (!job) throw notFound('That import is no longer in the queue');
    const state = await job.getState();
    res.json({
      jobId: String(job.id),
      state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      ...(job.returnvalue ?? {}),
      ...(job.failedReason ? { error: job.failedReason } : {}),
    });
  }),
);

// ---------------------------------------------------------------------------
// Notification settings
// ---------------------------------------------------------------------------

adminRouter.get('/notify-rules', wrap(async (_req, res) => res.json(await listRules())));

adminRouter.patch(
  '/notify-rules/:event',
  validateBody(updateNotifyRuleInput),
  wrap(async (req, res) => {
    res.json(await updateRule(req.params.event!, req.body));
  }),
);

// ---------------------------------------------------------------------------
// Email settings and outbox
// ---------------------------------------------------------------------------

adminRouter.get('/mail/health', wrap(async (_req, res) => res.json(await mailHealth())));

adminRouter.get(
  '/mail/outbox',
  wrap(async (_req, res) => res.json(await listOutbox())),
);

adminRouter.post(
  '/mail/test',
  validateBody(testEmailInput),
  wrap(async (req, res) => {
    res.json(await queueTestEmail(req.body.to));
  }),
);

adminRouter.post(
  '/mail/send-now',
  wrap(async (_req, res) => res.json(await sendQueuedNow())),
);

adminRouter.post(
  '/mail/retry-failed',
  wrap(async (_req, res) => res.json(await retryFailed())),
);
