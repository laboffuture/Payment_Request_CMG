import { Types } from 'mongoose';
import { clampMin0, lineCalc, lineUnit, num, poolRows, r2 } from '@cm/calc';
import type {
  MaterialStatusRowDto,
  PoolAnalysisDto,
  PoolAnalysisInput,
  PoolHoldInput,
  PoolPick,
  PoolQuery,
  PoolRowDto,
  ProcHoldAnswerInput,
  ProcHoldDto,
} from '@cm/shared';
import { MSG, materialStatusOf } from '@cm/shared';
import { inTransaction } from '../db.js';
import { AUDIT, writeAudit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { deleteFile, signedUrlFor, uploadBoq } from '../lib/files.js';
import { emit } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { enqueueEmails } from '../jobs/queues.js';
import type { Actor } from '../middleware/auth.js';
import { buildLookups, today } from '../lib/lookups.js';
import { loadWorld } from '../lib/world.js';
import { Mr, MrLine } from '../models/mr.js';
import { Po, PoLine } from '../models/po.js';
import { closeMrIfComplete } from './mr.service.js';

/**
 * Consolidation.
 * Prototype origin: poolRows(), VIEWS.pool, analysisHtml(), poolSel().
 *
 * "The pool" is every QS-approved PO quantity that is not already on a live PO
 * or an open enquiry — `poolOpen` in packages/calc.
 */

/** Files sent with a query or an answer, with short-lived links. */
const linksOf = (files: { publicId: string; name?: string; size?: number }[] | undefined) =>
  (files ?? []).map((f) => ({
    id: f.publicId,
    name: f.name ?? '',
    size: num(f.size),
    url: signedUrlFor(f.publicId),
  }));

/**
 * Stores the files that go with a query or an answer. Done before the change, so a file
 * that is refused stops it rather than sending it without; `undo` removes them again if
 * the change then fails.
 */
async function storeQueryFiles(files: Express.Multer.File[]) {
  const stored: Awaited<ReturnType<typeof uploadBoq>>[] = [];
  const undo = async () => {
    for (const file of stored) await deleteFile(file.publicId).catch(() => undefined);
  };
  try {
    for (const file of files) {
      try {
        stored.push(await uploadBoq(file, 'query'));
      } catch (err) {
        const said = err instanceof Error ? err.message : '';
        if (said === MSG.boqWrongType) {
          throw badRequest(
            `${file.originalname} cannot be attached — use a PDF, an image or a spreadsheet (CSV, XLS, XLSX)`,
          );
        }
        if (said === MSG.boqTooLarge) {
          throw badRequest(`${file.originalname} is larger than 5 MB — compress it and try again`);
        }
        throw err;
      }
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return { stored, undo };
}

export async function listPool(query: PoolQuery): Promise<PoolRowDto[]> {
  const [world, lookups] = await Promise.all([loadWorld(), buildLookups()]);
  const now = today();
  const rows = poolRows(world);
  const described = await MrLine.find({ _id: { $in: rows.map((r) => r.line.id) } })
    .select('description measurement procRemark qsReply qsReplyFiles qsReplyBy')
    .lean();
  const answered = new Map(described.map((l) => [String(l._id), l]));
  // Drawings and BOQ sheets on the MR, so the buyer can open them from the pool.
  const withFiles = await Mr.find({ _id: { $in: [...new Set(rows.map((r) => r.mr.id))] } })
    .select('boqFiles boq')
    .lean();
  const attachments = new Map(
    withFiles.map((m) => [String(m._id), (m.boqFiles ?? []).length || (m.boq ? 1 : 0)]),
  );
  // Description and measurement together: the same item can be on an MR twice,
  // and the measurement is what tells the two lines apart.
  const mrDescription = new Map(
    described.map((l) => [
      String(l._id),
      [l.description, l.measurement].map((v) => (v ?? '').trim()).filter(Boolean).join(' — '),
    ]),
  );

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
        measurement: (answered.get(row.line.id)?.measurement ?? '').trim(),
        unit: lineUnit(row.line, item),
        category: item.category,
        openQty: row.calc.poolOpen,
        lastRate: item.lastRate,
        lastVendorId: item.lastVendorId,
        lastVendorName: item.lastVendorId ? lookups.vendorName(item.lastVendorId) : null,
        gstRate: item.gstRate,
        procRemark: answered.get(row.line.id)?.procRemark ?? '',
        qsReply: answered.get(row.line.id)?.qsReply ?? '',
        qsReplyFiles: linksOf(answered.get(row.line.id)?.qsReplyFiles),
        qsReplyBy: answered.get(row.line.id)?.qsReplyBy
          ? lookups.userName(answered.get(row.line.id)!.qsReplyBy)
          : '',
        attachments: attachments.get(row.mr.id) ?? 0,
        // A pool line is never held, so this is Pending, On enquiry or Part ordered.
        status: materialStatusOf({
          hold: null,
          toBuy: row.calc.po,
          onPo: row.calc.poAlloc,
          received: row.calc.received,
          onEnquiry: row.calc.rfqOpen,
        }),
      };
    })
    // Group by item, then by MR — the order the prototype's table shows.
    .sort(
      (a, b) =>
        a.itemName.localeCompare(b.itemName) || a.mrNo.localeCompare(b.mrNo),
    );
}

/**
 * Every material QS approved for purchase, with where it has got to: pending, on a PO,
 * delivered, or back with QS on a query. The pool above drops a line once nothing is left
 * to order; this keeps it, so procurement can answer "what happened to that MR line?".
 *
 * Closed MRs are included - a fully delivered material usually belongs to one.
 */
export async function listMaterialStatus(query: PoolQuery): Promise<MaterialStatusRowDto[]> {
  const [world, lookups] = await Promise.all([loadWorld({ includeClosed: true }), buildLookups()]);
  const mrById = new Map(world.mrs.map((m) => [String(m.id), m]));
  const poById = new Map(world.pos.map((p) => [String(p.id), p]));

  const picked = world.mrLines.filter((line) => {
    const mr = mrById.get(String(line.mrId));
    if (!mr || (mr.status !== 'APPROVED' && mr.status !== 'CLOSED')) return false;
    if (line.lineStatus === 'REJECTED' || !line.itemId) return false;
    // Only what was approved to be bought; store-only lines are not procurement's.
    if (!(num(line.poQty) > 0) && (!line.procHold || line.procHold === 'NONE')) return false;
    if (query.projectId && String(mr.projectId) !== query.projectId) return false;
    if (query.category && lookups.item(line.itemId)?.category !== query.category) return false;
    return true;
  });

  const described = await MrLine.find({ _id: { $in: picked.map((l) => l.id) } })
    .select('description measurement procRemark')
    .lean();
  const extra = new Map(described.map((l) => [String(l._id), l]));

  return picked
    .map((line) => {
      const mr = mrById.get(String(line.mrId))!;
      const item = lookups.item(line.itemId)!;
      const calc = lineCalc(world, line);
      const more = extra.get(String(line.id));
      const poIds = [
        ...new Set(
          world.poAllocs
            .filter((a) => String(a.mrLineId) === String(line.id))
            .map((a) => String(a.poId)),
        ),
      ];
      const pos = poIds
        .map((id) => poById.get(id))
        .filter((po): po is NonNullable<typeof po> => !!po && po.status !== 'REJECTED' && po.status !== 'CANCELLED')
        .map((po) => ({
          id: String(po.id),
          no: po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : ''),
          status: po.status,
        }));
      return {
        mrLineId: String(line.id),
        mrId: String(mr.id),
        mrNo: mr.no,
        projectId: String(mr.projectId),
        projectCode: lookups.projectCode(mr.projectId),
        requiredDate: mr.requiredDate,
        itemCode: item.code,
        itemName: item.name,
        mrDescription: [more?.description, more?.measurement]
          .map((v) => (v ?? '').trim())
          .filter(Boolean)
          .join(' — '),
        unit: lineUnit(line, item),
        category: item.category,
        status: materialStatusOf({
          hold: line.procHold,
          toBuy: calc.po,
          onPo: calc.poAlloc,
          received: calc.received,
          onEnquiry: calc.rfqOpen,
        }),
        toBuy: calc.po,
        onPo: calc.poAlloc,
        received: calc.received,
        openQty: calc.poolOpen,
        pos,
        procRemark: more?.procRemark ?? '',
      };
    })
    .sort((a, b) => a.mrNo.localeCompare(b.mrNo) || a.itemName.localeCompare(b.itemName));
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
  // One row per item and unit: 30 Nos and 30 Cft of the same item are not one quantity.
  const keyOf = (r: { itemId: string; unit: string }) => `${r.itemId}|${r.unit.toLowerCase()}`;
  const keys = [...new Set(rows.map(keyOf))];

  const valueByProject: Record<string, number> = {};
  for (const id of projectIds) valueByProject[id] = 0;

  // How often each item has been bought: the approved POs (approved, part- or fully received) carrying it.
  const itemIds = [...new Set(rows.map((r) => String(r.itemId)))];
  const bought = await Po.find({ status: { $in: ['APPROVED', 'PARTIAL', 'RECEIVED'] } })
    .select('_id createdAt')
    .lean();
  const boughtOn = new Map(bought.map((po) => [String(po._id), po.createdAt.toISOString()]));
  const purchases = new Map<string, { pos: Set<string>; last: string }>();
  for (const line of await PoLine.find({ poId: { $in: bought.map((po) => po._id) }, itemId: { $in: itemIds } })
    .select('poId itemId')
    .lean()) {
    const id = String(line.itemId);
    const on = boughtOn.get(String(line.poId)) ?? '';
    const seen = purchases.get(id) ?? { pos: new Set<string>(), last: '' };
    seen.pos.add(String(line.poId));
    if (on > seen.last) seen.last = on;
    purchases.set(id, seen);
  }

  let grandTotal = 0;
  const analysed = keys.map((key) => {
    const forItem = rows.filter((r) => keyOf(r) === key);
    const first = forItem[0]!;
    const itemId = first.itemId;

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
      timesPurchased: purchases.get(String(itemId))?.pos.size ?? 0,
      lastPurchased: purchases.get(String(itemId))?.last ?? '',
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

// ---------------------------------------------------------------------------
// Procurement sends a line back to QS - a query, or a rejection
// ---------------------------------------------------------------------------

const mrDescriptionOf = (l: { description?: string; measurement?: string }): string =>
  [l.description, l.measurement].map((v) => (v ?? '').trim()).filter(Boolean).join(' — ');

/**
 * Procurement ticks lines in Consolidate MRs and sends them back to QS with remarks.
 * The lines leave the pool - nothing is bought against them - until QS answers.
 */
export async function holdPoolLines(
  actor: Actor,
  input: PoolHoldInput,
  files: Express.Multer.File[] = [],
): Promise<{ lines: number }> {
  const open = new Map(
    (await listPool({ projectId: '', category: '' })).map((r) => [r.mrLineId, r]),
  );
  const ids = [...new Set(input.mrLineIds)];
  const rows = ids.map((id) => {
    const row = open.get(id);
    if (!row) throw badRequest('One of those lines is no longer open — refresh and try again');
    return row;
  });

  const isQuery = input.action === 'QUERY';
  // Stored first, so a file that is refused stops the query rather than sending it.
  const { stored, undo } = await storeQueryFiles(files);

  const outboxIds = await inTransaction(async (session) => {
    const changed = await MrLine.updateMany(
      { _id: { $in: ids }, procHold: { $in: ['NONE', null] } },
      {
        $set: {
          procHold: input.action,
          procRemark: input.remark,
          procBy: new Types.ObjectId(actor.id),
          procAt: new Date(),
          procFiles: stored,
          qsReply: '',
          qsReplyFiles: [],
          qsReplyBy: null,
          qsReplyAt: null,
        },
      },
      { session },
    );
    if (changed.modifiedCount !== ids.length) {
      throw conflict('One of those lines was already sent to QS — refresh and try again');
    }

    for (const row of rows) {
      await writeAudit(
        session,
        'MR',
        row.mrId,
        isQuery ? AUDIT.MR_PROC_QUERY : AUDIT.MR_PROC_REJECT,
        actor.id,
        `${row.itemCode} ${row.itemName}: ${input.remark}`,
      );
    }

    const mrNos = [...new Set(rows.map((r) => r.mrNo))];
    const outbox = await emit(session, 'PROC_LINE_SENT_BACK', {
      title: isQuery
        ? `Procurement has a query on ${rows.length} material(s) — ${mrNos.join(', ')}`
        : `Procurement rejected ${rows.length} material(s) — ${mrNos.join(', ')}`,
      body: `${rows.map((r) => r.itemName).join(', ')} — ${input.remark}`.slice(0, 500),
      link: 'qs:procurement',
      to: [{ role: 'QS' }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  }).catch(async (err) => {
    await undo();
    throw err;
  });

  await enqueueEmails(outboxIds);
  return { lines: ids.length };
}

/** The lines waiting for QS's answer - QS acts on them, procurement watches them. */
export async function listProcHolds(): Promise<ProcHoldDto[]> {
  const lines = await MrLine.find({ procHold: { $in: ['QUERY', 'REJECT'] } })
    .sort({ procAt: 1 })
    .lean();
  if (!lines.length) return [];

  const [world, lookups, mrs] = await Promise.all([
    loadWorld(),
    buildLookups(),
    Mr.find({ _id: { $in: lines.map((l) => l.mrId) } })
      .select('no projectId requiredDate')
      .lean(),
  ]);
  const mrOf = new Map(mrs.map((m) => [String(m._id), m]));

  return lines.flatMap((l) => {
    const mr = mrOf.get(String(l.mrId));
    const item = l.itemId ? lookups.item(l.itemId) : null;
    const lineIn = world.mrLines.find((x) => x.id === String(l._id));
    if (!mr || !item || !lineIn) return [];
    return [
      {
        mrLineId: String(l._id),
        mrId: String(mr._id),
        mrNo: mr.no,
        projectCode: lookups.projectCode(mr.projectId),
        requiredDate: mr.requiredDate,
        itemCode: item.code,
        itemName: item.name,
        mrDescription: mrDescriptionOf(l),
        unit: lineUnit(lineIn, item),
        openQty: lineCalc(world, lineIn).poolOpen,
        itemId: String(item.id),
        description: l.description ?? '',
        measurement: l.measurement ?? '',
        ordered: lineCalc(world, lineIn).poAlloc + lineCalc(world, lineIn).rfqOpen > 0,
        action: l.procHold as 'QUERY' | 'REJECT',
        remark: l.procRemark ?? '',
        files: linksOf(l.procFiles),
        byName: l.procBy ? lookups.userName(l.procBy) : '',
        at: (l.procAt ?? l.updatedAt).toISOString(),
      },
    ];
  });
}

/**
 * QS answers a line procurement sent back.
 *   RETURN - the line goes back to procurement to buy, with QS's remarks beside it.
 *   CANCEL - the quantity still to be bought comes off the MR line; what is already on
 *            a PO or an enquiry is not touched.
 */
export async function answerProcHold(
  actor: Actor,
  lineId: string,
  input: ProcHoldAnswerInput,
  files: Express.Multer.File[] = [],
): Promise<void> {
  const { stored, undo } = await storeQueryFiles(files);
  const world = await loadWorld();
  const lookups = await buildLookups();
  let mrId = '';

  const outboxIds = await inTransaction(async (session) => {
    const line = await MrLine.findById(lineId).session(session);
    if (!line) throw notFound();
    if (line.procHold !== 'QUERY' && line.procHold !== 'REJECT') {
      throw conflict('This line has already been answered — refresh the page');
    }
    const mr = await Mr.findById(line.mrId).session(session);
    if (!mr) throw notFound();
    mrId = String(mr._id);

    const item = line.itemId ? lookups.item(line.itemId) : null;
    const label = item ? `${item.code} ${item.name}` : 'Material';
    const cancel = input.decision === 'CANCEL';
    let cancelled = 0;

    if (cancel) {
      const lineIn = world.mrLines.find((x) => x.id === lineId);
      cancelled = lineIn ? lineCalc(world, lineIn).poolOpen : 0;
      line.poQty = clampMin0(num((line.poQty ?? 0) - cancelled));
    }

    // QS's corrections to the material, sent back with the answer.
    const changes: string[] = [];
    if (!cancel && input.edit) {
      const lineIn = world.mrLines.find((x) => x.id === lineId);
      const calc = lineIn ? lineCalc(world, lineIn) : null;
      if (!calc) throw notFound();
      const ordered = calc.poAlloc + calc.rfqOpen > 0;
      const unitNow = lineUnit(line, item);
      const swapped = input.edit.itemId !== String(line.itemId);
      if (ordered && (swapped || input.edit.unit !== unitNow || input.edit.measurement !== (line.measurement ?? ''))) {
        throw conflict(
          'Part of this material is already on a PO or an enquiry - only the quantity still to buy can be changed',
        );
      }
      const nextItem = swapped ? lookups.item(input.edit.itemId) : item;
      if (!nextItem) throw badRequest('Choose an item from the item master');
      if (input.edit.qty !== calc.poolOpen) {
        line.poQty = num((line.poQty ?? 0) - calc.poolOpen + input.edit.qty);
        // Asking for more than the engineer did raises the request to match.
        line.qty = Math.max(num(line.qty), num((line.storeQty ?? 0) + line.poQty));
        changes.push(`to buy ${calc.poolOpen} → ${input.edit.qty} ${input.edit.unit}`);
      }
      if (swapped) {
        changes.push(`item ${item ? `${item.code} ${item.name}` : '—'} → ${nextItem.code} ${nextItem.name}`);
        line.itemId = new Types.ObjectId(input.edit.itemId) as never;
      }
      if (input.edit.unit !== unitNow) {
        changes.push(`unit ${unitNow} → ${input.edit.unit}`);
        line.unit = input.edit.unit;
      }
      if (input.edit.measurement !== (line.measurement ?? '')) {
        changes.push(`measurement "${line.measurement ?? ''}" → "${input.edit.measurement}"`);
        line.measurement = input.edit.measurement;
      }
      if (input.edit.description !== (line.description ?? '')) {
        changes.push(`description "${line.description ?? ''}" → "${input.edit.description}"`);
        line.description = input.edit.description;
      }
    }

    line.procHold = 'NONE';
    line.qsReply = input.remark;
    line.qsReplyFiles = stored as never;
    line.qsReplyBy = new Types.ObjectId(actor.id) as never;
    line.qsReplyAt = new Date();
    await line.save({ session });

    await writeAudit(
      session,
      'MR',
      mr._id,
      cancel ? AUDIT.MR_PROC_CANCELLED : AUDIT.MR_PROC_RETURNED,
      actor.id,
      cancel
        ? `${label}: ${cancelled} ${lineUnit(line, item)} cancelled — ${input.remark}`
        : `${label}: ${input.remark}${changes.length ? ` (changed: ${changes.join('; ')})` : ''}`,
    );

    const outbox = await emit(session, 'PROC_LINE_ANSWERED', {
      title: cancel
        ? `${mr.no}: QS cancelled the purchase of ${item?.name ?? 'a material'}`
        : `${mr.no}: QS answered on ${item?.name ?? 'a material'} — back in Consolidate MRs`,
      body: changes.length ? `${input.remark} (changed: ${changes.join('; ')})` : input.remark,
      link: cancel ? `mr:${String(mr._id)}` : 'pool:answered',
      to: [
        { role: 'PROC' },
        // The requester is told only when their material will not be bought.
        cancel ? { userId: mr.createdBy } : null,
      ],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  }).catch(async (err) => {
    await undo();
    throw err;
  });

  await enqueueEmails(outboxIds);
  if (input.decision === 'CANCEL' && mrId) await closeMrIfComplete(mrId, actor.id);
}
