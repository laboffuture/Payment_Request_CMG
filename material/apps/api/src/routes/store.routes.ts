import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  MAX_BOQ_BYTES,
  MAX_BOQ_FILES,
  REPORT_TAB_VALUES,
  acceptIssueInput,
  createIssueInput,
  isReportTab,
  openPosQuery,
  postGrnInput,
} from '@cm/shared';
import { sendCsv, wrap } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { actorOf, authorize, requireAuth } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { buildCsv, csvFilename } from '../lib/csv.js';
import { badRequest } from '../lib/errors.js';
import {
  acceptIssue,
  createIssue,
  getIssue,
  grnFileLinks,
  issuableMrs,
  issueFileLinks,
  listGrns,
  listIssues,
  openPos,
  postGrn,
} from '../services/store.service.js';
import { report, reportCsvRows } from '../services/reports.service.js';

export const storeRouter: Router = Router();

/**
 * A receipt can arrive with its papers: the form sends the usual JSON in a `payload`
 * field beside the files. A plain JSON request passes through both of these untouched.
 */
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BOQ_BYTES },
}).array('files', MAX_BOQ_FILES);

function unwrapPayload(req: Request, _res: Response, next: NextFunction): void {
  const payload = (req.body as { payload?: unknown } | undefined)?.payload;
  if (typeof payload === 'string') {
    try {
      req.body = JSON.parse(payload);
    } catch {
      return next(badRequest('The form could not be read — reload the page and try again'));
    }
  }
  next();
}
const filesOf = (req: Request): Express.Multer.File[] => (req.files ?? []) as Express.Multer.File[];


// ---------------------------------------------------------------------------
// GRN — prototype VIEWS.grn / grnSection()
// ---------------------------------------------------------------------------

storeRouter.get(
  '/grn/open-pos',
  requireAuth,
  authorize('STORE', 'SITE', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await openPos(actorOf(req), openPosQuery.parse(req.query)));
  }),
);

storeRouter.get(
  '/grns',
  requireAuth,
  authorize('STORE', 'SITE', 'PROC', 'MGMT', 'ADMIN'),
  wrap(async (_req, res) => res.json(await listGrns())),
);

storeRouter.post(
  '/grns',
  requireAuth,
  authorize('STORE', 'SITE', 'ADMIN'),
  receiptUpload,
  unwrapPayload,
  idempotency,
  validateBody(postGrnInput),
  wrap(async (req, res) => {
    res.status(201).json(await postGrn(actorOf(req), req.body, filesOf(req)));
  }),
);

/** What was attached to a receipt — the delivery note, photos. */
storeRouter.get(
  '/grns/:id/files',
  requireAuth,
  authorize('STORE', 'SITE', 'PROC', 'PROC_MGR', 'QS', 'PM', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => res.json(await grnFileLinks(req.params.id!))),
);

// ---------------------------------------------------------------------------
// Issue to site — prototype VIEWS.issue / issues / receive
// ---------------------------------------------------------------------------

storeRouter.get(
  '/issues/pending',
  requireAuth,
  authorize('STORE', 'ADMIN'),
  wrap(async (_req, res) => res.json(await issuableMrs())),
);

storeRouter.get(
  '/issues',
  requireAuth,
  authorize('STORE', 'SITE', 'PROC', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => res.json(await listIssues(actorOf(req)))),
);

storeRouter.get(
  '/issues/:id',
  requireAuth,
  authorize('STORE', 'SITE', 'PROC', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    res.json(await getIssue(actorOf(req), req.params.id!));
  }),
);

storeRouter.post(
  '/issues',
  requireAuth,
  authorize('STORE', 'ADMIN'),
  idempotency,
  validateBody(createIssueInput),
  wrap(async (req, res) => {
    res.status(201).json(await createIssue(actorOf(req), req.body));
  }),
);

storeRouter.post(
  '/issues/:id/accept',
  requireAuth,
  authorize('SITE', 'ADMIN'),
  receiptUpload,
  unwrapPayload,
  idempotency,
  validateBody(acceptIssueInput),
  wrap(async (req, res) => {
    await acceptIssue(actorOf(req), req.params.id!, req.body, filesOf(req));
    res.json({ ok: true });
  }),
);

/** What the site attached when accepting an issue. */
storeRouter.get(
  '/issues/:id/files',
  requireAuth,
  authorize('STORE', 'SITE', 'PROC', 'PROC_MGR', 'QS', 'PM', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => res.json(await issueFileLinks(actorOf(req), req.params.id!))),
);

// ---------------------------------------------------------------------------
// Reports — prototype VIEWS.reports
// ---------------------------------------------------------------------------

const reportParams = z.object({ tab: z.enum(REPORT_TAB_VALUES as [string, ...string[]]) });

storeRouter.get(
  '/reports/tabs',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (_req, res) => {
    const { REPORT_TABS } = await import('@cm/shared');
    res.json(REPORT_TABS);
  }),
);

storeRouter.get(
  '/reports/:tab',
  requireAuth,
  authorize('SITE', 'PM', 'QS', 'PROC', 'STORE', 'MGMT', 'ADMIN'),
  wrap(async (req, res) => {
    const raw = String(req.params.tab ?? '').replace(/\.csv$/, '');
    if (!isReportTab(raw)) throw badRequest('Unknown report');
    reportParams.parse({ tab: raw });

    const projectId = typeof req.query.project === 'string' ? req.query.project : '';
    const result = await report(actorOf(req), raw, projectId);

    // `/reports/pos.csv` downloads the same rows.
    if (String(req.params.tab).endsWith('.csv')) {
      sendCsv(
        res,
        csvFilename(`material-${raw}`),
        buildCsv(result.columns, reportCsvRows(result)),
      );
      return;
    }

    res.json(result);
  }),
);
