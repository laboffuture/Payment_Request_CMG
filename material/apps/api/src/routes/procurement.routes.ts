import { Router } from 'express';
import multer from 'multer';
import {
  MAX_VENDOR_DOC_BYTES,
  QUOTATION_SHEET_COLS,
  awardRfqInput,
  createRfqInput,
  docListQuery,
  extendRfqInput,
  poCommentInput,
  poRecommendQuery,
  poValidateInput,
  poListQuery,
  poolAnalysisInput,
  poolQuery,
  poRejectInput,
  rejectDocInput,
  revisePoInput,
  upsertPoInput,
  vendorDocInput,
  vendorQuoteInput,
} from '@cm/shared';
import { sendCsv, wrap } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { actorOf, authorize, requireAuth } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { buildCsv, csvFilename } from '../lib/csv.js';
import { listPool, poolAnalysis } from '../services/pool.service.js';
import { recommendVendors } from '../services/recommend.service.js';
import {
  acceptRfq,
  cancelRfq,
  createRfq,
  declineRfq,
  extendRfq,
  getRfq,
  getVendorRfq,
  listRfqs,
  listVendorRfqs,
  quotationSheetRows,
  submitQuote,
} from '../services/rfq.service.js';
import {
  acknowledgePo,
  approvePo,
  awardRfq,
  cancelPo,
  createPo,
  getPo,
  listPos,
  poFormRows,
  rejectPo,
  validatePo,
  mgmtApprovePo,
  mgmtRejectPo,
  revisePo,
  submitPo,
  updatePo,
} from '../services/po.service.js';
import {
  fileUrlFor,
  listDocs,
  rejectDoc,
  uploadVendorDoc,
  verifyDoc,
} from '../services/vendorDoc.service.js';

export const procurementRouter: Router = Router();

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VENDOR_DOC_BYTES },
});


// ---------------------------------------------------------------------------
// Consolidation — prototype VIEWS.pool
// ---------------------------------------------------------------------------

procurementRouter.get(
  '/pool',
  requireAuth,
  authorize('PROC'),
  wrap(async (req, res) => {
    res.json(await listPool(poolQuery.parse(req.query)));
  }),
);

procurementRouter.post(
  '/pool/analysis',
  requireAuth,
  authorize('PROC'),
  validateBody(poolAnalysisInput),
  wrap(async (req, res) => {
    res.json(await poolAnalysis(req.body));
  }),
);

// ---------------------------------------------------------------------------
// Enquiries — prototype VIEWS.rfqs / rfqview
// ---------------------------------------------------------------------------

procurementRouter.get(
  '/rfqs',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'QS', 'PM', 'SITE', 'MGMT', 'ADMIN'),
  wrap(async (_req, res) => res.json(await listRfqs())),
);

procurementRouter.get(
  '/rfqs/:id',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'QS', 'PM', 'SITE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await getRfq(actorOf(req), req.params.id!));
  }),
);

procurementRouter.post(
  '/rfqs',
  requireAuth,
  authorize('PROC'),
  idempotency,
  validateBody(createRfqInput),
  wrap(async (req, res) => {
    res.status(201).json(await createRfq(actorOf(req), req.body));
  }),
);

procurementRouter.post(
  '/rfqs/:id/extend',
  requireAuth,
  authorize('PROC'),
  validateBody(extendRfqInput),
  wrap(async (req, res) => {
    await extendRfq(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/rfqs/:id/cancel',
  requireAuth,
  authorize('PROC'),
  wrap(async (req, res) => {
    await cancelRfq(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

/** Prototype: A.awardRFQ — creates one PO per vendor. */
procurementRouter.post(
  '/rfqs/:id/award',
  requireAuth,
  authorize('PROC'),
  idempotency,
  validateBody(awardRfqInput),
  wrap(async (req, res) => {
    res.json(await awardRfq(actorOf(req), req.params.id!, req.body));
  }),
);

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

procurementRouter.get(
  '/pos',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'QS', 'PM', 'MGMT', 'ADMIN', 'STORE', 'SITE', 'VENDOR'),
  wrap(async (req, res) => {
    res.json(await listPos(actorOf(req), poListQuery.parse(req.query)));
  }),
);

procurementRouter.get(
  '/pos/:id',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await getPo(actorOf(req), req.params.id!));
  }),
);

/** The wizard's existing rows, when editing or revising. */
procurementRouter.get(
  '/pos/:id/rows',
  requireAuth,
  authorize('PROC'),
  wrap(async (req, res) => {
    res.json(await poFormRows(req.params.id!));
  }),
);

/**
 * Two suggested vendors — cheapest and quickest — for the items the buyer has
 * picked. A read, but a POST because the rows travel in the body.
 */
procurementRouter.post(
  '/pos/recommendations',
  requireAuth,
  authorize('PROC', 'PROC_MGR'),
  validateBody(poRecommendQuery),
  wrap(async (req, res) => {
    res.json(await recommendVendors(req.body));
  }),
);

procurementRouter.post(
  '/pos',
  requireAuth,
  authorize('PROC'),
  idempotency,
  validateBody(upsertPoInput),
  wrap(async (req, res) => {
    res.status(201).json(await createPo(actorOf(req), req.body));
  }),
);

procurementRouter.put(
  '/pos/:id',
  requireAuth,
  authorize('PROC'),
  validateBody(upsertPoInput),
  wrap(async (req, res) => {
    res.json(await updatePo(actorOf(req), req.params.id!, req.body));
  }),
);

procurementRouter.post(
  '/pos/:id/revise',
  requireAuth,
  authorize('PROC'),
  idempotency,
  validateBody(revisePoInput),
  wrap(async (req, res) => {
    res.json(await revisePo(actorOf(req), req.params.id!, req.body));
  }),
);

procurementRouter.post(
  '/pos/:id/submit',
  requireAuth,
  authorize('PROC'),
  wrap(async (req, res) => {
    await submitPo(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

/** Only a Procurement Manager, and never their own PO (§3). */
procurementRouter.post(
  '/pos/:id/approve',
  requireAuth,
  authorize('PROC_MGR'),
  idempotency,
  validateBody(poCommentInput),
  wrap(async (req, res) => {
    await approvePo(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/pos/:id/reject',
  requireAuth,
  authorize('PROC_MGR'),
  validateBody(poRejectInput),
  wrap(async (req, res) => {
    await rejectPo(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

/** Step 2: QS answers "is everything I asked for on this PO?" */
procurementRouter.post(
  '/pos/:id/validate',
  requireAuth,
  authorize('QS'),
  idempotency,
  validateBody(poValidateInput),
  wrap(async (req, res) => {
    await validatePo(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

/** Step 3: management's final word. An admin watches but never acts. */
procurementRouter.post(
  '/pos/:id/mgmt-approve',
  requireAuth,
  authorize('MGMT'),
  idempotency,
  validateBody(poCommentInput),
  wrap(async (req, res) => {
    await mgmtApprovePo(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/pos/:id/mgmt-reject',
  requireAuth,
  authorize('MGMT'),
  validateBody(poRejectInput),
  wrap(async (req, res) => {
    await mgmtRejectPo(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/pos/:id/cancel',
  requireAuth,
  authorize('PROC'),
  wrap(async (req, res) => {
    await cancelPo(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Vendor portal
// ---------------------------------------------------------------------------

procurementRouter.get(
  '/vendor/rfqs',
  requireAuth,
  authorize('VENDOR'),
  wrap(async (req, res) => res.json(await listVendorRfqs(actorOf(req)))),
);

procurementRouter.get(
  '/vendor/rfqs/:id',
  requireAuth,
  authorize('VENDOR'),
  wrap(async (req, res) => {
    res.json(await getVendorRfq(actorOf(req), req.params.id!));
  }),
);

/** Prototype: A.vSheetCsv — fill the sheet offline, upload it back. */
procurementRouter.get(
  '/vendor/rfqs/:id/sheet.csv',
  requireAuth,
  authorize('VENDOR'),
  wrap(async (req, res) => {
    const { no, rows } = await quotationSheetRows(actorOf(req), req.params.id!);
    sendCsv(res, `${no}-quotation.csv`, buildCsv([...QUOTATION_SHEET_COLS], rows));
  }),
);

procurementRouter.post(
  '/vendor/rfqs/:id/accept',
  requireAuth,
  authorize('VENDOR'),
  wrap(async (req, res) => {
    await acceptRfq(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/vendor/rfqs/:id/decline',
  requireAuth,
  authorize('VENDOR'),
  wrap(async (req, res) => {
    await declineRfq(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/vendor/rfqs/:id/quote',
  requireAuth,
  authorize('VENDOR'),
  validateBody(vendorQuoteInput),
  wrap(async (req, res) => {
    await submitQuote(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/vendor/pos/:id/ack',
  requireAuth,
  authorize('VENDOR'),
  wrap(async (req, res) => {
    await acknowledgePo(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Invoices & delivery orders
// ---------------------------------------------------------------------------

procurementRouter.get(
  '/docs',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await listDocs(actorOf(req), docListQuery.parse(req.query)));
  }),
);

procurementRouter.post(
  '/vendor/docs',
  requireAuth,
  authorize('VENDOR'),
  uploadLimiter,
  docUpload.single('file'),
  wrap(async (req, res) => {
    const input = vendorDocInput.parse(req.body);
    res.status(201).json(await uploadVendorDoc(actorOf(req), input, req.file));
  }),
);

procurementRouter.post(
  '/docs/:id/verify',
  requireAuth,
  authorize('PROC'),
  wrap(async (req, res) => {
    await verifyDoc(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

procurementRouter.post(
  '/docs/:id/reject',
  requireAuth,
  authorize('PROC'),
  validateBody(rejectDocInput),
  wrap(async (req, res) => {
    await rejectDoc(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

/** §13: a signed, expiring URL — and only after the permission check. */
procurementRouter.get(
  '/docs/:id/file',
  requireAuth,
  wrap(async (req, res) => {
    res.redirect(await fileUrlFor(actorOf(req), req.params.id!));
  }),
);
