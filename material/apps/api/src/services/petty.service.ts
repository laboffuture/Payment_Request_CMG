import { Types } from 'mongoose';
import { num } from '@cm/calc';
import type { MrCommentInput, PettyApproveInput, PettyGrnInput } from '@cm/shared';
import { isBuyer } from '@cm/shared';
import { inTransaction } from '../db.js';
import { writeAudit } from '../lib/audit.js';
import { nextGrnNo } from '../lib/counters.js';
import { badRequest, conflict, forbidden, notFound, stale } from '../lib/errors.js';
import { buildLookups } from '../lib/lookups.js';
import { emit } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { enqueueEmails } from '../jobs/queues.js';
import { canSeeProject, type Actor } from '../middleware/auth.js';
import { Mr, MrLine } from '../models/mr.js';
import { storeReceiptFiles } from './store.service.js';

/**
 * Project petty cash.
 *
 * The same request as a material request up to QS - site engineer, Project Manager,
 * QS - but no purchase order is ever raised. After QS, procurement reviews it and
 * approves (or sends it back to QS, or rejects it); the site engineer then buys the
 * items with petty cash and posts the GRN against the request itself.
 *
 * None of these statuses is APPROVED, so a petty cash request never enters the pool,
 * the store issue queue or stock reservations.
 */

const oid = (v: string) => new Types.ObjectId(v);
const BUYERS = [{ role: 'PROC' }, { role: 'PROC_MGR' }] as const;

/** The petty cash request procurement is looking at, still waiting for them. */
async function forReview(actor: Actor, id: string, rv: number | undefined, session: never) {
  if (!isBuyer(actor.role)) throw forbidden();
  const mr = await Mr.findById(id).session(session);
  if (!mr) throw notFound();
  if (mr.status !== 'PROC_REVIEW') {
    throw conflict('This petty cash request is no longer waiting for procurement');
  }
  if (rv !== undefined && rv !== (mr.rv ?? 0)) throw stale();
  return mr;
}

export async function pettyApprove(
  actor: Actor,
  id: string,
  input: PettyApproveInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await forReview(actor, id, input.rv, session as never);
    const lookups = await buildLookups();

    mr.status = 'GRN_PENDING';
    mr.procReviewBy = oid(actor.id) as never;
    mr.procReviewAt = new Date();
    if (input.comment) {
      mr.lastComment = input.comment;
      mr.lastCommentBy = oid(actor.id) as never;
      mr.lastCommentRole = 'Procurement';
    }
    await mr.save({ session });

    await writeAudit(
      session,
      'MR',
      mr._id,
      'Petty cash approved by procurement - site to post the GRN',
      actor.id,
      input.comment,
    );
    const outbox = await emit(session, 'PETTY_CASH_APPROVED', {
      title: `${mr.no} petty cash approved — post the GRN once bought (${lookups.projectCode(mr.projectId)})`,
      body: input.comment,
      link: `mr:${String(mr._id)}`,
      to: [{ userId: mr.createdBy }, { role: 'QS' }],
      actorId: actor.id,
    });
    await bumpSyncStamp(session);
    return outbox;
  });
  await enqueueEmails(outboxIds);
}

/** Back to QS with procurement's comment; QS can approve it again or send it on back. */
export async function pettySendBack(
  actor: Actor,
  id: string,
  input: MrCommentInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await forReview(actor, id, input.rv, session as never);

    mr.status = 'QS_PENDING';
    mr.lastComment = input.comment;
    mr.lastCommentBy = oid(actor.id) as never;
    mr.lastCommentRole = 'Procurement';
    await mr.save({ session });

    await writeAudit(session, 'MR', mr._id, 'Petty cash sent back to QS by procurement', actor.id, input.comment);
    const outbox = await emit(session, 'MR_SENT_BACK', {
      title: `${mr.no} petty cash sent back to QS by procurement`,
      body: input.comment,
      link: `mr:${String(mr._id)}`,
      to: [{ role: 'QS' }, { userId: mr.createdBy }],
      actorId: actor.id,
    });
    await bumpSyncStamp(session);
    return outbox;
  });
  await enqueueEmails(outboxIds);
}

export async function pettyReject(
  actor: Actor,
  id: string,
  input: MrCommentInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await forReview(actor, id, input.rv, session as never);

    mr.status = 'REJECTED';
    mr.lastComment = input.comment;
    mr.lastCommentBy = oid(actor.id) as never;
    mr.lastCommentRole = 'Procurement';
    await mr.save({ session });

    await writeAudit(session, 'MR', mr._id, 'Petty cash rejected by procurement', actor.id, input.comment);
    const outbox = await emit(session, 'MR_REJECTED', {
      title: `${mr.no} petty cash rejected by procurement`,
      body: input.comment,
      link: `mr:${String(mr._id)}`,
      to: [{ userId: mr.createdBy }, mr.pmBy ? { userId: mr.pmBy } : null, { role: 'QS' }],
      actorId: actor.id,
    });
    await bumpSyncStamp(session);
    return outbox;
  });
  await enqueueEmails(outboxIds);
}

/**
 * Who may post the GRN, once procurement has approved: a site engineer on the project, or
 * the Project Manager who raised the request himself.
 */
export const canPostPettyGrn = (actor: Actor, mr: Record<string, any>): boolean =>
  mr.status === 'GRN_PENDING' &&
  ((actor.role === 'SITE' && canSeeProject(actor, String(mr.projectId))) ||
    (actor.role === 'PM' && String(mr.createdBy) === actor.id));

/**
 * The site engineer's GRN for what was bought with petty cash. The bill or a photo is
 * required, as for any receipt at site. Posting it completes the request.
 */
export async function postPettyGrn(
  actor: Actor,
  id: string,
  input: PettyGrnInput,
  files: Express.Multer.File[] = [],
): Promise<{ no: string }> {
  const existing = await Mr.findById(id).lean();
  if (!existing) throw notFound();
  if (!canPostPettyGrn(actor, existing)) {
    if (existing.status !== 'GRN_PENDING') {
      throw conflict('This petty cash request is not waiting for a GRN');
    }
    throw forbidden();
  }
  if (!files.length) throw badRequest('Attach the bill or a photo of what was bought');

  const papers = await storeReceiptFiles(files, 'grn');
  try {
    const result = await inTransaction(async (session) => {
      const mr = await Mr.findById(id).session(session);
      if (!mr || mr.status !== 'GRN_PENDING') {
        throw conflict('This petty cash request is not waiting for a GRN');
      }
      if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

      const lines = await MrLine.find({ mrId: mr._id, lineStatus: { $ne: 'REJECTED' } }).session(session);
      const byId = new Map(lines.map((l) => [String(l._id), l]));
      let any = 0;
      for (const row of input.lines) {
        const line = byId.get(row.id);
        if (!line) continue;
        const approved = num(line.poQty ?? line.qty);
        const got = num(row.qty);
        if (got > approved) {
          throw badRequest(`Received more than approved (${approved}) on line ${line.sn}`);
        }
        line.grnQty = got;
        if (got > 0) any += 1;
        await line.save({ session });
      }
      if (!any) throw badRequest('Enter the quantity received for at least one item');

      const no = await nextGrnNo(session);
      mr.pettyGrn = {
        no,
        billNo: input.billNo,
        remark: input.remark,
        by: oid(actor.id),
        at: new Date(),
        files: papers.stored,
      } as never;
      mr.status = 'GRN_POSTED';
      mr.closedAt = new Date();
      await mr.save({ session });

      await writeAudit(
        session,
        'MR',
        mr._id,
        `${no} posted for petty cash (bill ${input.billNo})`,
        actor.id,
        input.remark,
      );
      const outbox = await emit(session, 'GRN_POSTED', {
        title: `${no} posted at site for petty cash ${mr.no}`,
        body: `Bill / receipt: ${input.billNo}` + (input.remark ? `\n${input.remark}` : ''),
        link: `mr:${String(mr._id)}`,
        to: [{ role: 'QS' }, ...BUYERS, mr.pmBy ? { userId: mr.pmBy } : null],
        actorId: actor.id,
      });
      await bumpSyncStamp(session);
      return { no, outbox };
    });
    await enqueueEmails(result.outbox);
    return { no: result.no };
  } catch (err) {
    await papers.undo();
    throw err;
  }
}
