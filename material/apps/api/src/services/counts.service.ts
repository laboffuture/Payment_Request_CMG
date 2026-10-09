import { issueRows, poolRows } from '@cm/calc';
import { isBuyer, type Counts } from '@cm/shared';
import type { Actor } from '../middleware/auth.js';
import { loadWorld } from '../lib/world.js';
import { Issue, Mr, MrLine, Po, RfqVendor, VendorDoc } from '../models/index.js';
import { unreadCount } from './notification.service.js';
import { projectScopeOf } from '../middleware/auth.js';

/**
 * Sidebar badges.
 * Prototype: counts(role).
 *
 * Plan decision (d)(7): the SITE "receive" badge is scoped to the user's own
 * projects — the prototype counted every issue note in the system.
 */
export async function countsFor(actor: Actor): Promise<Counts> {
  const counts: Counts = { notifications: await unreadCount(actor) };
  const role = actor.role;

  if (role === 'PM') {
    counts.pmQueue = await Mr.countDocuments({ status: 'PM_PENDING' });
  }

  if (role === 'QS') {
    // MRs to split, plus the lines procurement sent back with a query or a rejection.
    counts.qsQueue =
      (await Mr.countDocuments({ status: 'QS_PENDING' })) +
      (await MrLine.countDocuments({ procHold: { $in: ['QUERY', 'REJECT'] } }));
    // POs the Procurement Manager has passed on for QS to validate.
    counts.poValidations = await Po.countDocuments({ status: 'QS_VALIDATION' });
  }

  if (role === 'MGMT') {
    counts.poMgmtApprovals = await Po.countDocuments({ status: 'MGMT_APPROVAL' });
  }

  if (isBuyer(role)) {
    const world = await loadWorld();
    counts.pool = poolRows(world).length;
    counts.docs = await VendorDoc.countDocuments({ status: 'SUBMITTED' });
  }

  if (role === 'PROC_MGR') {
    counts.poApprovals = await Po.countDocuments({
      status: 'PENDING_APPROVAL',
      createdBy: { $ne: actor.id },
    });
  }

  if (role === 'STORE') {
    const world = await loadWorld();
    counts.issue = issueRows(world).length;
    counts.grn = await Po.countDocuments({
      status: { $in: ['APPROVED', 'PARTIAL'] },
      deliverTo: 'STORE',
    });
  }

  if (role === 'SITE') {
    const scope = projectScopeOf(actor);
    const issueFilter: Record<string, unknown> = { status: 'ISSUED' };
    if (scope) issueFilter.projectId = { $in: scope };

    const [pendingIssues, sitePos] = await Promise.all([
      Issue.countDocuments(issueFilter),
      countSitePosForActor(actor),
    ]);
    counts.receive = pendingIssues + sitePos;
  }

  if (role === 'VENDOR' && actor.vendorId) {
    counts.vendorRfqs = await RfqVendor.countDocuments({
      vendorId: actor.vendorId,
      status: 'INVITED',
    });
  }

  return counts;
}

/**
 * Direct-to-site POs the actor may receive. A site user restricted to some
 * projects must not see another project's delivery — plan decision (d)(7).
 */
async function countSitePosForActor(actor: Actor): Promise<number> {
  const scope = projectScopeOf(actor);
  if (!scope) {
    return Po.countDocuments({
      status: { $in: ['APPROVED', 'PARTIAL'] },
      deliverTo: 'SITE',
    });
  }

  const rows = await Po.aggregate<{ count: number }>([
    { $match: { status: { $in: ['APPROVED', 'PARTIAL'] }, deliverTo: 'SITE' } },
    {
      $lookup: {
        from: 'poallocs',
        localField: '_id',
        foreignField: 'poId',
        as: 'allocs',
      },
    },
    {
      $match: {
        'allocs.projectId': {
          $in: scope.map((id) => new (Mr.base.Types.ObjectId)(id)),
        },
      },
    },
    { $count: 'count' },
  ]);

  return rows[0]?.count ?? 0;
}
