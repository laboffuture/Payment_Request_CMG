import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  MATERIAL_ST,
  MAX_BOQ_BYTES,
  MAX_BOQ_FILES,
  PO_ST,
  chipFor,
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
  poolHoldInput,
  poolQuery,
  procHoldAnswerInput,
  poRejectInput,
  rejectDocInput,
  revisePoInput,
  upsertPoInput,
  vendorDocInput,
  vendorQuoteInput,
} from '@cm/shared';
import { sendCsv, wrap } from '../lib/http.js';
import { badRequest } from '../lib/errors.js';
import { validateBody } from '../middleware/validate.js';
import { actorOf, authorize, requireAuth } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { buildCsv, csvFilename } from '../lib/csv.js';
import {
  answerProcHold,
  holdPoolLines,
  listMaterialStatus,
  listPool,
  listProcHolds,
  poolAnalysis,
} from '../services/pool.service.js';
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
  attachPoFiles,
  poFileLinks,
  removePoFile,
  cancelPo,
  deletePo,
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

/** What procurement attaches to a PO — the same kinds and sizes as an MR's attachments. */
const poFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BOQ_BYTES },
});

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VENDOR_DOC_BYTES },
});


/** A form that carries files sends its JSON in a `payload` field beside them. */
function unwrapPayload(req: Request, _res: Response, next: NextFunction): void {
  const payload = (req.body as { payload?: unknown } | undefined)?.payload;
  if (typeof payload !== 'string') return next();
  try {
    req.body = JSON.parse(payload);
    next();
  } catch {
    next(badRequest('The form could not be read — reload the page and try again'));
  }
}

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

/**
 * The same list as a spreadsheet - every MR material QS approved for purchase, with its
 * status, quantities and POs. The screen's filters ride along (project, category, required
 * dates, status, search), so it downloads what is on screen; with none set, it is everything.
 */
procurementRouter.get(
  '/pool/status.csv',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'QS', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    const text = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
    const from = text('from');
    const to = text('to');
    const status = text('status');
    const words = text('q').toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (await listMaterialStatus(poolQuery.parse(req.query))).filter((r) => {
      const due = (r.requiredDate || '').slice(0, 10);
      if (from && (!due || due < from)) return false;
      if (to && (!due || due > to)) return false;
      if (status && r.status !== status) return false;
      if (!words.length) return true;
      const hay = [r.mrNo, r.projectCode, r.itemName, r.itemCode, r.category, r.mrDescription,
        MATERIAL_ST[r.status].label, ...r.pos.map((p) => p.no)].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const columns = [
      'MR no.',
      'Project',
      'Required by',
      'Item code',
      'Material',
      'Site engineer asked for',
      'Category',
      'Unit',
      'To buy',
      'On PO',
      'Received',
      'To order',
      'Status',
      'PO',
      'PO status',
      'Procurement remark',
    ] as const;
    const out = rows.map((r) => ({
      'MR no.': r.mrNo,
      Project: r.projectCode,
      'Required by': r.requiredDate,
      'Item code': r.itemCode,
      Material: r.itemName,
      'Site engineer asked for': r.mrDescription,
      Category: r.category,
      Unit: r.unit,
      'To buy': r.toBuy,
      'On PO': r.onPo,
      Received: r.received,
      'To order': r.openQty,
      Status: MATERIAL_ST[r.status].label,
      PO: r.pos.map((p) => p.no).join(', '),
      'PO status': r.pos.map((p) => chipFor(PO_ST, p.status).label).join(', '),
      'Procurement remark': r.procRemark,
    }));
    sendCsv(res, csvFilename('consolidate-mrs'), buildCsv([...columns], out));
  }),
);

/** Every approved material with its status — ordered, delivered, on a query. */
procurementRouter.get(
  '/pool/status',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'QS', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await listMaterialStatus(poolQuery.parse(req.query)));
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

// Procurement sends ticked lines back to QS with remarks: a query, or a rejection.
// Photos, a quotation or a drawing may go with it: the form sends the JSON in a
// `payload` field beside the files.
procurementRouter.post(
  '/pool/hold',
  requireAuth,
  authorize('PROC'),
  poFileUpload.array('files', MAX_BOQ_FILES),
  unwrapPayload,
  validateBody(poolHoldInput),
  wrap(async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    res.json(await holdPoolLines(actorOf(req), req.body, files));
  }),
);

// What is with QS: QS answers these, procurement sees them waiting.
procurementRouter.get(
  '/pool/holds',
  requireAuth,
  authorize('PROC', 'QS', 'ADMIN'),
  wrap(async (_req, res) => res.json(await listProcHolds())),
);

procurementRouter.post(
  '/pool/holds/:lineId/answer',
  requireAuth,
  authorize('QS'),
  poFileUpload.array('files', MAX_BOQ_FILES),
  unwrapPayload,
  validateBody(procHoldAnswerInput),
  wrap(async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    await answerProcHold(actorOf(req), req.params.lineId!, req.body, files);
    res.json({ ok: true });
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

// --- PO attachments (optional, added while raising the PO or later) ----------

/** Several at once — added to whatever is already attached. */
procurementRouter.post(
  '/pos/:id/files',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'ADMIN'),
  uploadLimiter,
  poFileUpload.array('files', MAX_BOQ_FILES),
  wrap(async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    res.json(await attachPoFiles(actorOf(req), req.params.id!, files));
  }),
);

/** One file, by its storage id. */
procurementRouter.delete(
  '/pos/:id/files/:fileId(*)',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await removePoFile(actorOf(req), req.params.id!, req.params.fileId!));
  }),
);

/** Fresh signed links — everybody inside the company who can open the PO. */
procurementRouter.get(
  '/pos/:id/files',
  requireAuth,
  authorize('PROC', 'PROC_MGR', 'QS', 'PM', 'MGMT', 'ADMIN', 'STORE', 'SITE'),
  wrap(async (req, res) => {
    res.json(await poFileLinks(actorOf(req), req.params.id!));
  }),
);

// Removing a PO from the register: an administrator only, and never one with receipts.
procurementRouter.delete(
  '/pos/:id',
  requireAuth,
  authorize('ADMIN'),
  wrap(async (req, res) => {
    res.json(await deletePo(actorOf(req), req.params.id!));
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
