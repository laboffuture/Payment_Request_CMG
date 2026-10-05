import { Router } from 'express';
import { z } from 'zod';
import {
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
  issuableMrs,
  listGrns,
  listIssues,
  openPos,
  postGrn,
} from '../services/store.service.js';
import { report, reportCsvRows } from '../services/reports.service.js';

export const storeRouter: Router = Router();


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
  idempotency,
  validateBody(postGrnInput),
  wrap(async (req, res) => {
    res.status(201).json(await postGrn(actorOf(req), req.body));
  }),
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
  idempotency,
  validateBody(acceptIssueInput),
  wrap(async (req, res) => {
    await acceptIssue(actorOf(req), req.params.id!, req.body);
    res.json({ ok: true });
  }),
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
