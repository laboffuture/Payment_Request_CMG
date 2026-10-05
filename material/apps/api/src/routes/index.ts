import { Router } from 'express';
import { z } from 'zod';
import { wrap, sendCsv } from '../lib/http.js';
import { forbidden } from '../lib/errors.js';
import { readLocalFile } from '../lib/files.js';
import { verifyLocal } from '../lib/localFiles.js';
import { actorOf, authorize, requireAuth } from '../middleware/auth.js';
import { authRouter } from './auth.routes.js';
import { adminRouter } from './admin.routes.js';
import { mrRouter } from './mr.routes.js';
import { procurementRouter } from './procurement.routes.js';
import { storeRouter } from './store.routes.js';
import { readSyncStamp } from '../lib/sync.js';
import { inventory, itemLedger } from '../services/inventory.service.js';
import { listItems } from '../services/item.service.js';
import {
  listCategories,
  listCompanies,
  listProjects,
  listVendors,
} from '../services/masters.service.js';
import {
  listFor,
  markAllRead,
  markRead,
} from '../services/notification.service.js';
import { mailHealth } from '../services/mail.service.js';
import { buildCsv, csvFilename } from '../lib/csv.js';

export const apiRouter: Router = Router();

apiRouter.use(authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use(mrRouter);
apiRouter.use(procurementRouter);
apiRouter.use(storeRouter);

// ---------------------------------------------------------------------------
// Live refresh (§9)
// ---------------------------------------------------------------------------

apiRouter.get(
  '/sync/stamp',
  requireAuth,
  wrap(async (_req, res) => {
    res.json({ upd: await readSyncStamp() });
  }),
);

// ---------------------------------------------------------------------------
// Reference data every signed-in page needs (projects, vendors, categories…)
// ---------------------------------------------------------------------------

apiRouter.get(
  '/reference',
  requireAuth,
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const [projects, categories, companies] = await Promise.all([
      listProjects(),
      listCategories(),
      listCompanies(),
    ]);

    // A site user only ever picks from the projects they are allowed to raise
    // material requests for (§3).
    const scoped =
      actor.role === 'SITE' && actor.projectIds.length
        ? projects.filter((p) => actor.projectIds.includes(p.id))
        : projects;

    res.json({
      projects: scoped,
      categories,
      // Vendor lists are internal; a vendor portal user never receives one.
      vendors: actor.role === 'VENDOR' ? [] : await listVendors(),
      companies: actor.role === 'VENDOR' ? [] : companies,
    });
  }),
);

// ---------------------------------------------------------------------------
// Item master lookups (the MR item picker)
// ---------------------------------------------------------------------------

apiRouter.get(
  '/items',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    const query = z
      .object({
        category: z.string().optional(),
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    res.json(await listItems({ ...query, activeOnly: true }));
  }),
);

// ---------------------------------------------------------------------------
// Inventory (§4: QS, STORE, MGMT, ADMIN)
// ---------------------------------------------------------------------------

apiRouter.get(
  '/inventory',
  requireAuth,
  authorize('PM', 'QS', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    const query = z
      .object({ category: z.string().optional(), q: z.string().optional() })
      .parse(req.query);
    res.json(await inventory(query));
  }),
);

apiRouter.get(
  '/inventory/export.csv',
  requireAuth,
  authorize('PM', 'QS', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    const query = z
      .object({ category: z.string().optional(), q: z.string().optional() })
      .parse(req.query);
    const rows = await inventory(query);
    const columns = [
      'Category',
      'Code',
      'Item',
      'Unit',
      'Opening',
      'In',
      'Out',
      'On hand',
      'Reserved',
      'Available',
    ];
    sendCsv(
      res,
      csvFilename('inventory'),
      buildCsv(
        columns,
        rows.map((r) => ({
          Category: r.category,
          Code: r.code,
          Item: r.name,
          Unit: r.unit,
          Opening: r.opening,
          In: r.in,
          Out: r.out,
          'On hand': r.onHand,
          Reserved: r.reserved,
          Available: r.available,
        })),
      ),
    );
  }),
);

apiRouter.get(
  '/items/:id/ledger',
  requireAuth,
  authorize('PM', 'QS', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await itemLedger(req.params.id!));
  }),
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

apiRouter.get(
  '/notifications',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await listFor(actorOf(req)));
  }),
);

apiRouter.post(
  '/notifications/:id/read',
  requireAuth,
  wrap(async (req, res) => {
    await markRead(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

apiRouter.post(
  '/notifications/read-all',
  requireAuth,
  wrap(async (req, res) => {
    res.json({ marked: await markAllRead(actorOf(req)) });
  }),
);

// ---------------------------------------------------------------------------
// Locally stored files (development fallback — see lib/localFiles.ts)
// ---------------------------------------------------------------------------

/**
 * Serves a file that was kept on disk because Cloudinary is not configured.
 * The token in the query is what makes the link expire, exactly as a
 * Cloudinary signed URL does; the caller must still be signed in.
 */
apiRouter.get(
  '/files/:publicId(*)',
  requireAuth,
  wrap(async (req, res) => {
    const publicId = String(req.params.publicId ?? '');
    const token = String(req.query.t ?? '');
    if (!verifyLocal(publicId, token)) throw forbidden();

    const buffer = await readLocalFile(publicId);
    res.type(publicId.split('.').pop() ?? 'bin');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }),
);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

apiRouter.get(
  '/health/mail',
  requireAuth,
  authorize('ADMIN'),
  wrap(async (_req, res) => {
    res.json(await mailHealth());
  }),
);
