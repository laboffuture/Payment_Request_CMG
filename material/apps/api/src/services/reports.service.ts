import {
  allocValue,
  displayPoNo,
  lineCalc,
  num,
  poReceivedPct,
  poReceivedValue,
  poolRows,
  r2,
  reportLines,
  stock,
} from '@cm/calc';
import type { World } from '@cm/calc';
import {
  REPORT_TABS,
  type ReportResponse,
  type ReportRow,
  type ReportTab,
} from '@cm/shared';
import { cached } from '../redis.js';
import { buildLookups, today, type Lookups } from '../lib/lookups.js';
import { loadWorld } from '../lib/world.js';
import { Mr } from '../models/mr.js';
import { Po, VendorDoc } from '../models/po.js';
import { Issue } from '../models/stock.js';
import { Quote, Rfq, RfqVendor } from '../models/rfq.js';
import { Vendor } from '../models/masters.js';
import type { Actor } from '../middleware/auth.js';
import { projectScopeOf } from '../middleware/auth.js';

/**
 * Reports & MIS — the thirteen tabs.
 * Prototype origin: REPORTS, reportData(tab, pj), reportLines(), lineStage().
 *
 * §9: cached in Redis for 60 seconds, keyed by tab and project.
 */

const CACHE_SECONDS = 60;

const money = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const MR_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PM_PENDING: 'With PM',
  QS_PENDING: 'With QS',
  SENT_BACK: 'Sent back',
  REJECTED: 'Rejected',
  APPROVED: 'In progress',
  CLOSED: 'Closed',
};

const PO_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'With Procurement Manager',
  QS_VALIDATION: 'With QS for validation',
  MGMT_APPROVAL: 'With management',
  APPROVED: 'Approved',
  PARTIAL: 'Part received',
  RECEIVED: 'Received',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const RV_LABEL: Record<string, string> = {
  INVITED: 'Invited',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  QUOTED: 'Quoted',
};

const DOC_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export async function report(
  actor: Actor,
  tab: ReportTab,
  projectId: string,
): Promise<ReportResponse> {
  // A project-scoped site user gets their own projects only.
  const scope = projectScopeOf(actor);
  const effective = projectId || '';
  if (scope && effective && !scope.includes(effective)) {
    return emptyReport(tab);
  }

  const key = `report:${tab}:${effective}:${scope ? scope.join(',') : 'all'}`;
  return cached(key, CACHE_SECONDS, async () => {
    const [world, lookups] = await Promise.all([
      loadWorld({ includeClosed: true, projectIds: scope }),
      buildLookups(),
    ]);
    return buildReport(tab, effective, world, lookups);
  });
}

const emptyReport = (tab: ReportTab): ReportResponse => ({
  tab,
  label: REPORT_TABS.find((t) => t.value === tab)!.label,
  columns: [],
  rows: [],
});

async function buildReport(
  tab: ReportTab,
  projectId: string,
  world: World,
  lookups: Lookups,
): Promise<ReportResponse> {
  const rows = await rowsFor(tab, projectId, world, lookups);
  const columns = rows.length
    ? Object.keys(rows[0]!).filter((k) => !k.startsWith('_'))
    : [];

  const response: ReportResponse = {
    tab,
    label: REPORT_TABS.find((t) => t.value === tab)!.label,
    columns,
    rows,
  };

  // Prototype: only the MR line tracker carries the KPI tiles.
  if (tab === 'lines') {
    const lines = reportLines(world, projectId || undefined, today());
    const [awaitingQs, poApprovals, awaitingSite, invoices] = await Promise.all([
      Mr.countDocuments({ status: 'QS_PENDING' }),
      Po.countDocuments({
        status: { $in: ['PENDING_APPROVAL', 'QS_VALIDATION', 'MGMT_APPROVAL'] },
      }),
      Issue.countDocuments({ status: 'ISSUED' }),
      VendorDoc.countDocuments({ status: 'SUBMITTED' }),
    ]);

    response.kpis = [
      { label: 'Awaiting QS', value: awaitingQs },
      { label: 'Lines in pool', value: poolRows(world).length },
      { label: 'POs in approval', value: poApprovals },
      { label: 'Issues awaiting site', value: awaitingSite },
      { label: 'Overdue lines', value: lines.filter((l) => l.overdue).length },
      { label: 'Invoices to check', value: invoices },
    ];
  }

  return response;
}

async function rowsFor(
  tab: ReportTab,
  projectId: string,
  world: World,
  lookups: Lookups,
): Promise<ReportRow[]> {
  const lines = () => reportLines(world, projectId || undefined, today());

  switch (tab) {
    // --- 1 & 5: the line tracker, and the overdue subset ------------------
    case 'lines':
    case 'overdue': {
      const rows = tab === 'overdue' ? lines().filter((l) => l.overdue) : lines();
      return rows.map((r) => ({
        'MR no.': r.mr,
        Project: r.project,
        Category: r.cat,
        Item: r.item,
        Unit: r.unit,
        Req: r.req,
        Store: r.store,
        PO: r.po,
        Cut: r.cut,
        'PO no.': r.poNo,
        Received: r.received,
        Issued: r.issued,
        'Site acc.': r.site,
        Balance: r.balance,
        Stage: r.stage + (r.overdue ? ' · OVERDUE' : ''),
        Required: fmtDate(r.required),
        _id: r.mrId,
        _v: 'mrview',
      }));
    }

    // --- 2: site-wise MIS --------------------------------------------------
    case 'site': {
      const all = lines();
      return world.projects
        .filter((p) => !projectId || p.id === projectId)
        .map((project) => {
          const mrs = world.mrs.filter(
            (m) => m.projectId === project.id && m.status !== 'DRAFT',
          );
          const projectLines = all.filter((l) => l.projectId === project.id);
          const allocs = world.poAllocs.filter((a) => {
            const po = world.pos.find((p) => p.id === a.poId);
            return (
              a.projectId === project.id &&
              po &&
              po.status !== 'REJECTED' &&
              po.status !== 'CANCELLED'
            );
          });

          const poValue = r2(
            allocs.reduce((sum, a) => sum + allocValue(world, a.id), 0),
          );
          const receivedValue = r2(
            allocs.reduce((sum, a) => {
              const line = world.poLines.find((l) => l.id === a.poLineId);
              if (!line) return sum;
              const received = Math.min(
                num(a.qty),
                world.grnLines
                  .filter((g) => g.poAllocId === a.id)
                  .reduce((s, g) => s + num(g.qtyReceived), 0),
              );
              return sum + received * num(line.rate) * (1 + num(line.gstPct) / 100);
            }, 0),
          );

          const closed = projectLines.filter((l) => l.stage === 'Closed').length;

          return {
            Project: `${project.code} · ${project.name}`,
            MRs: mrs.length,
            'Open MRs': mrs.filter((m) =>
              ['QS_PENDING', 'APPROVED'].includes(m.status),
            ).length,
            Lines: projectLines.length,
            'Lines closed': closed,
            'Overdue lines': projectLines.filter((l) => l.overdue).length,
            'PO value': money(poValue),
            'Received value': money(receivedValue),
            'Closed %': projectLines.length
              ? `${Math.round((closed / projectLines.length) * 100)}%`
              : '—',
          };
        });
    }

    // --- 3: item × project -------------------------------------------------
    case 'itemproj': {
      const grouped = new Map<string, ReportRow>();
      for (const line of lines()) {
        const key = `${line.item}|${line.project}`;
        const row = grouped.get(key) ?? {
          Item: line.item,
          Unit: line.unit,
          Project: line.project,
          Requested: 0,
          'From store': 0,
          'For PO': 0,
          'On PO': 0,
          Received: 0,
          'Site accepted': 0,
          Balance: 0,
        };
        row.Requested = num((row.Requested as number) + line.req);
        row['From store'] = num((row['From store'] as number) + line.store);
        row['For PO'] = num((row['For PO'] as number) + line.po);
        row['On PO'] = num((row['On PO'] as number) + line.onPo);
        row.Received = num((row.Received as number) + line.received);
        row['Site accepted'] = num((row['Site accepted'] as number) + line.site);
        row.Balance = num((row.Balance as number) + line.balance);
        grouped.set(key, row);
      }
      return [...grouped.values()].sort((a, b) =>
        String(a.Item).localeCompare(String(b.Item)),
      );
    }

    // --- 4: category-wise --------------------------------------------------
    case 'category': {
      const grouped = new Map<string, ReportRow & { _value: number }>();
      for (const line of lines()) {
        const key = `${line.cat}|${line.project}`;
        const row =
          grouped.get(key) ??
          ({
            Category: line.cat || '—',
            Project: line.project,
            Lines: 0,
            Closed: 0,
            Overdue: 0,
            'PO value': '',
            _value: 0,
          } as ReportRow & { _value: number });
        row.Lines = (row.Lines as number) + 1;
        if (line.stage === 'Closed') row.Closed = (row.Closed as number) + 1;
        if (line.overdue) row.Overdue = (row.Overdue as number) + 1;
        grouped.set(key, row);
      }

      for (const alloc of world.poAllocs) {
        const po = world.pos.find((p) => p.id === alloc.poId);
        if (!po || po.status === 'REJECTED' || po.status === 'CANCELLED') continue;
        const line = world.poLines.find((l) => l.id === alloc.poLineId);
        const item = line ? lookups.item(line.itemId) : null;
        const key = `${item?.category ?? '—'}|${lookups.projectCode(alloc.projectId)}`;
        const row = grouped.get(key);
        if (row) row._value = r2(row._value + allocValue(world, alloc.id));
      }

      return [...grouped.values()].map(({ _value, ...row }) => ({
        ...row,
        'PO value': money(_value),
      }));
    }

    // --- 6: MR ageing ------------------------------------------------------
    case 'ageing': {
      const now = Date.now();
      return world.mrs
        .filter((m) => m.status !== 'DRAFT')
        .filter((m) => !projectId || m.projectId === projectId)
        .map((mr) => {
          const from = new Date(mr.submittedAt ?? mr.createdAt ?? Date.now()).getTime();
          const to = mr.closedAt ? new Date(mr.closedAt).getTime() : now;
          const days = Math.floor((to - from) / 864e5);
          const left = Math.floor(
            (new Date(`${mr.requiredDate}T23:59`).getTime() - now) / 864e5,
          );

          return {
            'MR no.': mr.no,
            Project: lookups.projectCode(mr.projectId),
            Status: MR_LABEL[mr.status] ?? mr.status,
            Submitted: fmtDate(mr.submittedAt),
            'Days open': days,
            Bucket:
              days <= 3
                ? '0–3 days'
                : days <= 7
                  ? '4–7 days'
                  : days <= 15
                    ? '8–15 days'
                    : '15+ days',
            Required: fmtDate(mr.requiredDate),
            'Days to required': mr.status === 'CLOSED' ? '—' : left,
            _id: mr.id,
            _v: 'mrview',
          };
        });
    }

    // --- 7: PO register ----------------------------------------------------
    case 'pos': {
      const pos = await Po.find({}).sort({ createdAt: -1 }).lean();
      const out: ReportRow[] = [];

      for (const po of pos) {
        const calcPo = world.pos.find((p) => p.id === String(po._id));
        const projects = world.poAllocs
          .filter((a) => a.poId === String(po._id))
          .map((a) => lookups.projectCode(a.projectId));
        if (projectId && !projects.includes(lookups.projectCode(projectId))) continue;

        out.push({
          'PO no.': po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : ''),
          Date: fmtDate(po.createdAt.toISOString()),
          Vendor: lookups.vendorName(po.vendorId),
          Projects: [...new Set(projects)].join(' '),
          Basis: po.rfqId ? 'Compared' : 'Direct',
          Subtotal: money(num(po.subtotal)),
          Tax: money(num(po.taxTotal)),
          Total: money(num(po.total)),
          Received: calcPo ? `${poReceivedPct(world, calcPo)}%` : '0%',
          Status: PO_LABEL[po.status] ?? po.status,
          _id: String(po._id),
          _v: 'poview',
        });
      }
      return out;
    }

    // --- 8: PO value by project & vendor -----------------------------------
    case 'povalue': {
      const grouped = new Map<string, { Vendor: string; Project: string; pos: Set<string>; value: number }>();

      for (const alloc of world.poAllocs) {
        if (projectId && alloc.projectId !== projectId) continue;
        const po = world.pos.find((p) => p.id === alloc.poId);
        if (!po || po.status === 'REJECTED' || po.status === 'CANCELLED') continue;

        const key = `${po.vendorId}|${alloc.projectId}`;
        const entry =
          grouped.get(key) ??
          {
            Vendor: lookups.vendorName(po.vendorId),
            Project: lookups.projectCode(alloc.projectId),
            pos: new Set<string>(),
            value: 0,
          };
        entry.pos.add(po.id);
        entry.value = r2(entry.value + allocValue(world, alloc.id));
        grouped.set(key, entry);
      }

      return [...grouped.values()].map((e) => ({
        Vendor: e.Vendor,
        Project: e.Project,
        POs: e.pos.size,
        'PO value incl. tax': money(e.value),
      }));
    }

    // --- 9: enquiry response ----------------------------------------------
    case 'rfq': {
      const [invitations, rfqs] = await Promise.all([
        RfqVendor.find({}).lean(),
        Rfq.find({}).lean(),
      ]);

      return invitations.map((inv) => {
        const rfq = rfqs.find((r) => String(r._id) === String(inv.rfqId));
        const due = rfq?.dueAt;
        const submitted = inv.submittedAt;

        return {
          Enquiry: rfq?.no ?? '',
          Vendor: lookups.vendorName(inv.vendorId),
          Due: fmtDateTime(due?.toISOString()),
          Status: RV_LABEL[inv.status] ?? inv.status,
          Submitted: fmtDateTime(submitted?.toISOString()),
          'On time': submitted
            ? due && submitted <= due
              ? 'Yes'
              : 'Late'
            : due && due.getTime() < Date.now()
              ? 'No response'
              : '—',
          _id: rfq ? String(rfq._id) : '',
          _v: 'rfqview',
        };
      });
    }

    // --- 10: invoices & DOs ------------------------------------------------
    case 'docs': {
      const docs = await VendorDoc.find({}).sort({ uploadedAt: -1 }).lean();
      const pos = await Po.find({ _id: { $in: docs.map((d) => d.poId) } }).lean();

      return docs.map((doc) => {
        const po = pos.find((p) => String(p._id) === String(doc.poId));
        const calcPo = po ? world.pos.find((p) => p.id === String(po._id)) : null;

        return {
          Type: doc.docType === 'DO' ? 'Delivery order' : 'Invoice',
          'Doc no.': doc.docNo,
          PO: po ? po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : '') : '',
          Vendor: lookups.vendorName(doc.vendorId),
          Amount: doc.amount ? money(num(doc.amount)) : '—',
          'PO total': money(num(po?.total ?? 0)),
          'Received value': calcPo ? money(poReceivedValue(world, calcPo)) : money(0),
          Status: DOC_LABEL[doc.status] ?? doc.status,
          Uploaded: fmtDateTime(doc.uploadedAt.toISOString()),
          _id: po ? String(po._id) : '',
          _v: 'poview',
        };
      });
    }

    // --- 11: stock summary -------------------------------------------------
    case 'stock':
      return world.items.map((item) => {
        const s = stock(world, item.id);
        return {
          Category: item.category,
          Code: item.code,
          Item: item.name,
          Unit: item.unit,
          Opening: s.opening,
          In: s.in,
          Out: s.out,
          'On hand': s.onHand,
          Reserved: s.reserved,
          Available: s.available,
          'Value at last rate': money(r2(s.onHand * num(item.lastRate ?? 0))),
        };
      });

    // --- 12: pending by stage ----------------------------------------------
    case 'stage': {
      const counts = new Map<string, number>();
      for (const line of lines()) {
        for (const stage of line.stage.split(' · ')) {
          counts.set(stage, (counts.get(stage) ?? 0) + 1);
        }
      }
      return [...counts.entries()].map(([stage, n]) => ({
        Stage: stage,
        'MR lines': n,
      }));
    }

    // --- 13: vendor summary ------------------------------------------------
    case 'vendors': {
      const [vendors, invitations, pos, quotes] = await Promise.all([
        Vendor.find({}).sort({ name: 1 }).lean(),
        RfqVendor.find({}).lean(),
        Po.find({ status: { $nin: ['REJECTED', 'CANCELLED'] } }).lean(),
        Quote.find({}).select('_id').lean(),
      ]);
      void quotes;

      return vendors.map((vendor) => {
        const id = String(vendor._id);
        const mine = invitations.filter((i) => String(i.vendorId) === id);
        const myPos = pos.filter((p) => String(p.vendorId) === id);

        const pcts = myPos.map((p) => {
          const calcPo = world.pos.find((w) => w.id === String(p._id));
          return calcPo ? poReceivedPct(world, calcPo) : 0;
        });

        return {
          Vendor: vendor.name,
          Enquiries: mine.length,
          Quoted: mine.filter((i) => i.status === 'QUOTED').length,
          Declined: mine.filter((i) => i.status === 'DECLINED').length,
          POs: myPos.length,
          'PO value': money(r2(myPos.reduce((s, p) => s + num(p.total), 0))),
          'Received %': pcts.length
            ? `${Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)}%`
            : '—',
        };
      });
    }

    default:
      return [];
  }
}

/** The CSV export strips the `_id` / `_v` metadata columns. */
export const reportCsvRows = (response: ReportResponse): Record<string, unknown>[] =>
  response.rows.map((row) => {
    const copy: Record<string, unknown> = {};
    for (const key of response.columns) copy[key] = row[key];
    return copy;
  });

/** Used by the home dashboard's "Overdue MR lines" tile. */
export async function overdueLineCount(actor: Actor): Promise<number> {
  const scope = projectScopeOf(actor);
  const world = await loadWorld({ includeClosed: true, projectIds: scope });
  return reportLines(world, undefined, today()).filter((l) => l.overdue).length;
}

/** Kept for the equivalence test in §7. */
export const lineCalcFor = lineCalc;
export const displayPoNoFor = displayPoNo;
