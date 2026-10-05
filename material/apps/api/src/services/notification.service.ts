import { Types } from 'mongoose';
import type { NotificationDto } from '@cm/shared';
import type { Actor } from '../middleware/auth.js';
import { Notification } from '../models/system.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { notFound } from '../lib/errors.js';

/**
 * Prototype: myNotifs(), isRead(), A.openNotif, A.readAll.
 *
 * A notification reaches me when it is addressed to me personally, or to my
 * role (PROC also reaches PROC_MGR), and — for a vendor row — to my vendor.
 * It never reaches the person who caused it (plan decision (d)(9)).
 */
function audienceFilter(actor: Actor): Record<string, unknown> {
  const roles: string[] = [actor.role];
  if (actor.role === 'PROC_MGR') roles.push('PROC');

  const roleClause: Record<string, unknown> = {
    role: { $in: roles },
    userId: null,
    exceptUserId: { $ne: new Types.ObjectId(actor.id) },
  };

  // A vendor only ever sees rows for its own vendor.
  if (actor.role === 'VENDOR') {
    roleClause.vendorId = actor.vendorId
      ? new Types.ObjectId(actor.vendorId)
      : null;
  }

  return { $or: [{ userId: new Types.ObjectId(actor.id) }, roleClause] };
}

export async function unreadCount(actor: Actor): Promise<number> {
  return Notification.countDocuments({
    ...audienceFilter(actor),
    readBy: { $ne: new Types.ObjectId(actor.id) },
  });
}

/** Prototype: newest 100, unread highlighted. */
export async function listFor(
  actor: Actor,
  limit = 100,
): Promise<NotificationDto[]> {
  const rows = await Notification.find(audienceFilter(actor))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const meId = String(actor.id);
  return rows.map((n) => ({
    id: String(n._id),
    event: n.event,
    title: n.title,
    body: n.body ?? '',
    link: n.link ?? '',
    createdAt: n.createdAt.toISOString(),
    read: (n.readBy ?? []).some((u) => String(u) === meId),
  }));
}

/** Prototype: A.openNotif — mark read, then follow the link. */
export async function markRead(actor: Actor, id: string): Promise<void> {
  const result = await Notification.updateOne(
    { _id: id, ...audienceFilter(actor) },
    { $addToSet: { readBy: new Types.ObjectId(actor.id) } },
  );
  if (!result.matchedCount) throw notFound();
  await bumpSyncStamp();
}

/** Prototype: A.readAll */
export async function markAllRead(actor: Actor): Promise<number> {
  const result = await Notification.updateMany(
    { ...audienceFilter(actor), readBy: { $ne: new Types.ObjectId(actor.id) } },
    { $addToSet: { readBy: new Types.ObjectId(actor.id) } },
  );
  await bumpSyncStamp();
  return result.modifiedCount;
}
