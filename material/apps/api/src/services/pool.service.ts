import { num, poolRows, r2 } from '@cm/calc';
import type {
  PoolAnalysisDto,
  PoolAnalysisInput,
  PoolPick,
  PoolQuery,
  PoolRowDto,
} from '@cm/shared';
import { MSG } from '@cm/shared';
import { badRequest } from '../lib/errors.js';
import { buildLookups, today } from '../lib/lookups.js';
import { loadWorld } from '../lib/world.js';
import { MrLine } from '../models/mr.js';

/**
 * Consolidation.
 * Prototype origin: poolRows(), VIEWS.pool, analysisHtml(), poolSel().
 *
 * "The pool" is every QS-approved PO quantity that is not already on a live PO
 * or an open enquiry — `poolOpen` in packages/calc.
 */

export async function listPool(query: PoolQuery): Promise<PoolRowDto[]> {
  const [world, lookups] = await Promise.all([loadWorld(), buildLookups()]);
  const now = today();
  const rows = poolRows(world);
  const described = await MrLine.find({ _id: { $in: rows.map((r) => r.line.id) } })
    .select('description')
    .lean();
  const mrDescription = new Map(described.map((l) => [String(l._id), l.description ?? '']));

  return rows
    .filter((row) => {
      if (query.projectId && String(row.mr.projectId) !== query.projectId) return false;
      if (query.category) {
        const item = row.line.itemId ? lookups.item(row.line.itemId) : null;
        if (item?.category !== query.category) return false;
      }
      return true;
    })
    .map((row) => {
      const item = lookups.item(row.line.itemId)!;
      return {
        mrLineId: row.line.id,
        mrId: row.mr.id,
        mrNo: row.mr.no,
        projectId: row.mr.projectId,
        projectCode: lookups.projectCode(row.mr.projectId),
        requiredDate: row.mr.requiredDate,
        overdue: row.mr.requiredDate < now,
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        mrDescription: mrDescription.get(row.line.id) ?? '',
        unit: item.unit,
        category: item.category,
        openQty: row.calc.poolOpen,
        lastRate: item.lastRate,
        lastVendorId: item.lastVendorId,
        lastVendorName: item.lastVendorId ? lookups.vendorName(item.lastVendorId) : null,
        gstRate: item.gstRate,
      };
    })
    // Group by item, then by MR — the order the prototype's table shows.
    .sort(
      (a, b) =>
        a.itemName.localeCompare(b.itemName) || a.mrNo.localeCompare(b.mrNo),
    );
}

/**
 * Validates the lines the buyer ticked, exactly as the prototype's poolSel()
 * does — every take quantity must be above zero and within what is open.
 */
export async function resolvePicks(
  picks: PoolPick[],
): Promise<{ pick: PoolPick; row: PoolRowDto }[]> {
  if (!picks.length) throw badRequest(MSG.poolSelectLine);

  const rows = await listPool({ projectId: '', category: '' });
  const byLine = new Map(rows.map((r) => [r.mrLineId, r]));

  return picks.map((pick) => {
    const row = byLine.get(pick.mrLineId);
    if (!row) {
      throw badRequest(
        'One of those lines is no longer open — refresh and try again',
      );
    }
    const take = num(pick.qty);
    if (take <= 0 || take > row.openQty) {
      throw badRequest(MSG.poolTakeRange(row.mrNo, String(row.openQty)));
    }
    return { pick: { ...pick, qty: take }, row };
  });
}

/**
 * Prototype: analysisHtml() — item × project quantities, value at the last
 * purchase rate, and the earliest date any project needs it.
 */
export async function poolAnalysis(
  input: PoolAnalysisInput,
): Promise<PoolAnalysisDto> {
  const all = await listPool({ projectId: '', category: '' });

  // With nothing ticked the prototype analyses every open line.
  const rows = input.picks.length
    ? (await resolvePicks(input.picks)).map((r) => ({ ...r.row, take: r.pick.qty }))
    : all.map((r) => ({ ...r, take: r.openQty }));

  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const itemIds = [...new Set(rows.map((r) => r.itemId))];

  const valueByProject: Record<string, number> = {};
  for (const id of projectIds) valueByProject[id] = 0;

  let grandTotal = 0;
  const analysed = itemIds.map((itemId) => {
    const forItem = rows.filter((r) => r.itemId === itemId);
    const first = forItem[0]!;

    const perProject: Record<string, number> = {};
    for (const id of projectIds) {
      const qty = num(
        forItem
          .filter((r) => r.projectId === id)
          .reduce((sum, r) => sum + r.take, 0),
      );
      if (qty) perProject[id] = qty;
      valueByProject[id] = r2(
        (valueByProject[id] ?? 0) + qty * num(first.lastRate ?? 0),
      );
    }

    const totalQty = num(forItem.reduce((sum, r) => sum + r.take, 0));
    const value = r2(totalQty * num(first.lastRate ?? 0));
    grandTotal = r2(grandTotal + value);

    return {
      itemId,
      itemName: first.itemName,
      unit: first.unit,
      perProject,
      totalQty,
      lastRate: first.lastRate,
      value,
      earliestNeed: forItem.map((r) => r.requiredDate).sort()[0] ?? '',
    };
  });

  const lookups = await buildLookups();
  return {
    projects: projectIds.map((id) => ({ id, code: lookups.projectCode(id) })),
    rows: analysed.sort((a, b) => a.itemName.localeCompare(b.itemName)),
    valueByProject,
    grandTotal,
  };
}
