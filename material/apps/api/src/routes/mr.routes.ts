import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  MAX_BOQ_BYTES,
  MAX_BOQ_FILES,
  MR_CSV_COLS,
  mapNewItemInput,
  mrCommentInput,
  mrListQuery,
  pmApproveInput,
  qsApproveInput,
  upsertMrInput,
} from '@cm/shared';
import { sendCsv, wrap } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { actorOf, authorize, requireAuth } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { buildCsv, csvFilename } from '../lib/csv.js';
import {
  approveNewItem,
  attachBoq,
  boqLinks,
  createMr,
  deleteMr,
  getMr,
  getMrsForPrint,
  listMrs,
  mapNewItem,
  mrCsvRows,
  pmApprove,
  pmReject,
  pmSendBack,
  qsApprove,
  rejectMr,
  rejectNewItem,
  removeBoqFile,
  sendBackMr,
  updateMr,
} from '../services/mr.service.js';

export const mrRouter: Router = Router();

/** The optional bill of quantities — a PDF, a photo or a spreadsheet. */
const boqUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BOQ_BYTES },
});


/** Prototype: VIEWS.mrs and VIEWS.approvals (the QS queue). */
mrRouter.get(
  '/mrs',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await listMrs(actorOf(req), mrListQuery.parse(req.query)));
  }),
);

/** Prototype: A.mrCsv — must come before /mrs/:id. */
mrRouter.get(
  '/mrs/export.csv',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    const ids = String(req.query.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const rows = await mrCsvRows(actorOf(req), ids);
    sendCsv(res, csvFilename('material-requests'), buildCsv([...MR_CSV_COLS], rows));
  }),
);

/** Prototype: VIEWS.mrprint / mrDoc — one MR per page. */
mrRouter.get(
  '/mrs/print',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    const ids = String(req.query.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    res.json(await getMrsForPrint(actorOf(req), ids));
  }),
);

mrRouter.get(
  '/mrs/:id',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await getMr(actorOf(req), req.params.id!));
  }),
);

mrRouter.post(
  '/mrs',
  requireAuth,
  authorize('SITE'),
  idempotency,
  validateBody(upsertMrInput),
  wrap(async (req, res) => {
    res.status(201).json(await createMr(actorOf(req), req.body));
  }),
);

mrRouter.put(
  '/mrs/:id',
  requireAuth,
  authorize('SITE'),
  validateBody(upsertMrInput),
  wrap(async (req, res) => {
    res.json(await updateMr(actorOf(req), req.params.id!, req.body));
  }),
);

mrRouter.delete(
  '/mrs/:id',
  requireAuth,
  authorize('SITE'),
  wrap(async (req, res) => {
    await deleteMr(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

// --- bill of quantities (optional, raised with the MR) ---------------------

/** Several sheets at once — the files are added to whatever is already there. */
mrRouter.post(
  '/mrs/:id/boq',
  requireAuth,
  authorize('SITE'),
  boqUpload.array('files', MAX_BOQ_FILES),
  wrap(async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    res.json(await attachBoq(actorOf(req), req.params.id!, files));
  }),
);

/** One file at a time, by its storage id. */
mrRouter.delete(
  '/mrs/:id/boq/:fileId(*)',
  requireAuth,
  authorize('SITE'),
  wrap(async (req, res) => {
    res.json(await removeBoqFile(actorOf(req), req.params.id!, req.params.fileId!));
  }),
);

/** Fresh signed links — the requester, the PM and QS may all ask for them. */
mrRouter.get(
  '/mrs/:id/boq',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await boqLinks(actorOf(req), req.params.id!));
  }),
);

// --- Project Manager decisions ---------------------------------------------

mrRouter.post(
  '/mrs/:id/pm-approve',
  requireAuth,
  authorize('PM'),
  idempotency,
  validateBody(pmApproveInput),
  wrap(async (req, res) => {
    await pmApprove(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

mrRouter.post(
  '/mrs/:id/pm-send-back',
  requireAuth,
  authorize('PM'),
  validateBody(mrCommentInput),
  wrap(async (req, res) => {
    await pmSendBack(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

mrRouter.post(
  '/mrs/:id/pm-reject',
  requireAuth,
  authorize('PM'),
  validateBody(mrCommentInput),
  wrap(async (req, res) => {
    await pmReject(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

// --- QS decisions ----------------------------------------------------------

mrRouter.post(
  '/mrs/:id/qs-approve',
  requireAuth,
  authorize('QS'),
  idempotency,
  validateBody(qsApproveInput),
  wrap(async (req, res) => {
    await qsApprove(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

mrRouter.post(
  '/mrs/:id/send-back',
  requireAuth,
  authorize('QS'),
  validateBody(mrCommentInput),
  wrap(async (req, res) => {
    await sendBackMr(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

mrRouter.post(
  '/mrs/:id/reject',
  requireAuth,
  authorize('QS'),
  validateBody(mrCommentInput),
  wrap(async (req, res) => {
    await rejectMr(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

// --- new items -------------------------------------------------------------

mrRouter.post(
  '/mr-lines/:id/approve-new',
  requireAuth,
  authorize('QS'),
  idempotency,
  wrap(async (req, res) => {
    await approveNewItem(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

mrRouter.post(
  '/mr-lines/:id/map',
  requireAuth,
  authorize('QS'),
  validateBody(mapNewItemInput),
  wrap(async (req, res) => {
    await mapNewItem(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
);

mrRouter.post(
  '/mr-lines/:id/reject',
  requireAuth,
  authorize('QS'),
  wrap(async (req, res) => {
    await rejectNewItem(actorOf(req), req.params.id!);
    res.json({ ok: true });
  }),
);

export const mrIdsQuery = z.object({ ids: z.string().optional().default('') });
