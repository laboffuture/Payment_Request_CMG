import type { ClientSession, Types } from 'mongoose';
import {
  EMAIL_SUBJECT_PREFIX,
  defaultRule,
  type EventCode,
  type Role,
} from '@cm/shared';
import { env } from '../env.js';
import { EmailOutbox, Notification, NotifyRule } from '../models/system.js';

/**
 * Prototype: notify(ev, {title, body, link, to[]}) and rule(ev).
 *
 * Portal rows and outbox rows are written inside the caller's transaction; the
 * actual sending is a BullMQ job so a slow SMTP server can never hold a request
 * open (§1, §9).
 */

export type Recipient =
  | { userId: Types.ObjectId | string }
  | { role: Exclude<Role, 'VENDOR'> }
  | { role: 'VENDOR'; vendorId: Types.ObjectId | string }
  | null
  | undefined
  | false;

export interface EmitInput {
  title: string;
  body?: string;
  /** deep link, e.g. "mr:<id>" */
  link?: string;
  /** a different link for vendors, e.g. "vrfq:<id>" */
  vendorLink?: string;
  to: Recipient[];
  /** the user who caused this — never notified (§9) */
  actorId: Types.ObjectId | string;
  /** attach this PO's PDF to the email (PO_APPROVED → vendor) */
  attachPoId?: Types.ObjectId | string | null;
}

const ruleCache = new Map<string, { portal: boolean; email: boolean; vendorEmail: boolean }>();

export const clearRuleCache = (): void => void ruleCache.clear();

async function ruleFor(event: EventCode) {
  const hit = ruleCache.get(event);
  if (hit) return hit;
  const row = await NotifyRule.findById(event).lean();
  const value = row
    ? { portal: !!row.portal, email: !!row.email, vendorEmail: !!row.vendorEmail }
    : (() => {
        const d = defaultRule(event);
        return { portal: d.portal, email: d.email, vendorEmail: d.vendorEmail };
      })();
  ruleCache.set(event, value);
  return value;
}

/** Prototype: appLink(l) — an absolute URL the email can carry. */
export const appLink = (link: string): string =>
  link ? `${env.APP_URL.replace(/\/$/, '')}/?open=${encodeURIComponent(link)}` : env.APP_URL;

const keyOf = (r: Exclude<Recipient, null | undefined | false>): string =>
  'userId' in r
    ? `u:${String(r.userId)}`
    : r.role === 'VENDOR'
      ? `v:${String((r as { vendorId: unknown }).vendorId)}`
      : `r:${r.role}`;

/**
 * Write the portal notifications and queue the emails for one event.
 * Returns the ids of the outbox rows, so the caller can hand them to the
 * `email` queue after the transaction commits.
 */
export async function emit(
  session: ClientSession,
  event: EventCode,
  input: EmitInput,
): Promise<string[]> {
  const rule = await ruleFor(event);
  const actor = String(input.actorId);
  const seen = new Set<string>();
  const notifications: Record<string, unknown>[] = [];
  const emails: Record<string, unknown>[] = [];

  for (const raw of input.to) {
    if (!raw) continue;
    const r = raw as Exclude<Recipient, null | undefined | false>;

    // Prototype skips the actor for direct recipients; (d)(9) extends that to
    // role fan-out via exceptUserId.
    if ('userId' in r && String(r.userId) === actor) continue;

    const key = keyOf(r);
    if (seen.has(key)) continue;
    seen.add(key);

    const isVendor = !('userId' in r) && r.role === 'VENDOR';
    const link = (isVendor && input.vendorLink) || input.link || '';

    if (rule.portal) {
      notifications.push({
        event,
        title: input.title,
        body: input.body ?? '',
        link,
        userId: 'userId' in r ? r.userId : null,
        role: 'userId' in r ? '' : r.role,
        vendorId: isVendor ? (r as { vendorId: unknown }).vendorId : null,
        exceptUserId: 'userId' in r ? null : input.actorId,
        readBy: [],
        createdAt: new Date(),
      });
    }

    const wantsEmail = isVendor ? rule.vendorEmail : rule.email;
    if (wantsEmail) {
      emails.push({
        event,
        toUserId: 'userId' in r ? r.userId : null,
        toRole: 'userId' in r ? '' : r.role,
        toVendorId: isVendor ? (r as { vendorId: unknown }).vendorId : null,
        exceptUserId: 'userId' in r ? null : input.actorId,
        subject: EMAIL_SUBJECT_PREFIX + input.title,
        body: `${input.body ? `${input.body}\n\n` : ''}Open: ${appLink(link)}`,
        status: 'QUEUED',
        tries: 0,
        sentTo: [],
        attachPoId: input.attachPoId ?? null,
      });
    }
  }

  if (notifications.length) await Notification.create(notifications, { session, ordered: true });

  if (!emails.length) return [];
  const created = await EmailOutbox.create(emails, { session, ordered: true });
  return created.map((row) => String(row._id));
}
