import {
  EVENTS,
  EVENT_CODES,
  defaultRule,
  type EventCode,
  type MailHealthDto,
  type NotifyRuleDto,
  type OutboxRowDto,
  type UpdateNotifyRuleInput,
} from '@cm/shared';
import { env, mailConfigured } from '../env.js';
import { EmailOutbox, NotifyRule } from '../models/system.js';
import { User, Vendor } from '../models/masters.js';
import { clearRuleCache } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { enqueueEmails } from '../jobs/queues.js';
import { notFound } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Notification rules — prototype VIEWS.notifyrules
// ---------------------------------------------------------------------------

export async function listRules(): Promise<NotifyRuleDto[]> {
  const rows = await NotifyRule.find({}).lean();
  const stored = new Map(rows.map((r) => [r._id, r]));

  return EVENT_CODES.map((code) => {
    const spec = EVENTS[code];
    const row = stored.get(code) ?? defaultRule(code);
    return {
      event: code,
      label: spec.label,
      goesTo: spec.goesTo,
      portal: !!row.portal,
      email: !!row.email,
      vendorEmail: !!row.vendorEmail,
      vendorEmailAllowed: spec.vendorEmailAllowed,
    };
  });
}

export async function updateRule(
  event: string,
  input: UpdateNotifyRuleInput,
): Promise<NotifyRuleDto[]> {
  if (!(EVENT_CODES as readonly string[]).includes(event)) throw notFound();
  const code = event as EventCode;

  const current = (await NotifyRule.findById(code).lean()) ?? defaultRule(code);
  const next = {
    portal: input.portal ?? !!current.portal,
    email: input.email ?? !!current.email,
    // The vendor column only exists for the events that allow it.
    vendorEmail: EVENTS[code].vendorEmailAllowed
      ? (input.vendorEmail ?? !!current.vendorEmail)
      : false,
  };

  await NotifyRule.updateOne({ _id: code }, { $set: next }, { upsert: true });
  clearRuleCache();
  await bumpSyncStamp();
  return listRules();
}

// ---------------------------------------------------------------------------
// Outbox — prototype VIEWS.outbox (second definition)
// ---------------------------------------------------------------------------

/**
 * Prototype: emailsFor(o) — resolve an outbox row to actual addresses.
 * Only active users who have an address and have not switched their own alerts
 * off (§9). A vendor row also goes to the vendor record's address.
 */
export async function addressesFor(row: {
  toUserId?: unknown;
  toRole?: string;
  toVendorId?: unknown;
  exceptUserId?: unknown;
}): Promise<string[]> {
  const out: string[] = [];
  const add = (u: { active?: boolean; emailOn?: boolean; email?: string } | null) => {
    if (u?.active && u.emailOn && u.email) out.push(u.email);
  };

  if (row.toUserId) {
    add(await User.findById(row.toUserId).select('active emailOn email').lean());
  } else if (row.toRole === 'VENDOR') {
    const users = await User.find({ role: 'VENDOR', vendorId: row.toVendorId })
      .select('active emailOn email')
      .lean();
    users.forEach(add);
    const vendor = await Vendor.findById(row.toVendorId).select('email').lean();
    if (vendor?.email && !out.includes(vendor.email)) out.push(vendor.email);
  } else if (row.toRole) {
    // A notification for PROC also reaches PROC_MGR.
    const roles = row.toRole === 'PROC' ? ['PROC', 'PROC_MGR'] : [row.toRole];
    const filter: Record<string, unknown> = { role: { $in: roles } };
    if (row.exceptUserId) filter._id = { $ne: row.exceptUserId };
    const users = await User.find(filter).select('active emailOn email').lean();
    users.forEach(add);
  }

  return [...new Set(out)];
}

export async function listOutbox(limit = 300): Promise<OutboxRowDto[]> {
  const rows = await EmailOutbox.find({}).sort({ createdAt: -1 }).limit(limit).lean();

  return Promise.all(
    rows.map(async (r) => ({
      id: String(r._id),
      rv: 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      event: r.event,
      subject: r.subject,
      body: r.body ?? '',
      status: r.status,
      to: r.sentTo?.length ? r.sentTo : await addressesFor(r),
      tries: r.tries ?? 0,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      error: r.error ?? '',
    })),
  );
}

/** Prototype: the status chip at the top of the Email settings page. */
export async function mailHealth(): Promise<MailHealthDto> {
  const [queued, failed] = await Promise.all([
    EmailOutbox.countDocuments({ status: 'QUEUED' }),
    EmailOutbox.countDocuments({ status: 'FAILED' }),
  ]);

  return {
    ready: mailConfigured,
    provider: env.MAIL_PROVIDER,
    from: env.MAIL_FROM,
    queued,
    failed,
    ...(mailConfigured
      ? {}
      : {
          error:
            env.MAIL_PROVIDER === 'smtp'
              ? 'Set SMTP_HOST (and the user/password) to switch email on'
              : 'Set MAIL_API_KEY to switch email on',
        }),
  };
}

/** Prototype: A.mailSendNow — hand every queued row to the worker now. */
export async function sendQueuedNow(): Promise<{ queued: number }> {
  const rows = await EmailOutbox.find({ status: 'QUEUED' }).select('_id').lean();
  await enqueueEmails(rows.map((r) => String(r._id)));
  return { queued: rows.length };
}

/** Prototype: A.mailRetry — put failed rows back in the queue. */
export async function retryFailed(): Promise<{ retried: number }> {
  const rows = await EmailOutbox.find({ status: 'FAILED' }).select('_id').lean();
  if (!rows.length) return { retried: 0 };

  await EmailOutbox.updateMany(
    { status: 'FAILED' },
    { $set: { status: 'QUEUED', tries: 0, error: '' } },
  );
  await enqueueEmails(rows.map((r) => String(r._id)));
  await bumpSyncStamp();
  return { retried: rows.length };
}

/** Prototype: A.mailTest — a one-off email straight through the worker. */
export async function queueTestEmail(to: string): Promise<{ id: string }> {
  const [row] = await EmailOutbox.create([
    {
      event: 'TEST',
      subject: '[Chandramari] Test email',
      body:
        'This is a test from the Chandramari Material Management system.\n\n' +
        'If you can read this, email delivery is working.',
      status: 'QUEUED',
      sentTo: [],
      toRole: '',
    },
  ]);
  // A test goes to exactly one address, regardless of the usual rules.
  await EmailOutbox.updateOne({ _id: row!._id }, { $set: { sentTo: [to] } });
  await enqueueEmails([String(row!._id)]);
  return { id: String(row!._id) };
}
