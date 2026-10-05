import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env, redisEnabled } from '../env.js';
import { logger } from '../logger.js';

/**
 * BullMQ producers. The workers live in `apps/worker`; the API only ever
 * enqueues, so a slow SMTP server or a big import can never hold a request
 * open (§1).
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connections, which is why
 * these do not reuse the shared client in redis.ts.
 *
 * Both the connection and the queues are created on first use. An API process
 * that never enqueues anything — a read replica, or a test run — therefore
 * never opens a queue connection at all.
 */
export const queueConnection = () =>
  new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE = {
  email: 'email',
  notify: 'notify',
  pdf: 'pdf',
  import: 'import',
  rfqDue: 'rfq-due',
  reports: 'reports',
  masters: 'masters-sync',
} as const;

const defaults = {
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

let connection: Redis | null = null;
const queues = new Map<string, Queue>();

/**
 * BullMQ needs a real Redis. With none configured (local development only —
 * see redis.ts) there is nothing to enqueue onto, and callers check
 * `queuesAvailable` rather than being handed a queue that cannot work.
 */
export const queuesAvailable = (): boolean => redisEnabled;

function queue(name: string, jobOptions: Record<string, unknown> = {}): Queue {
  if (!redisEnabled) {
    throw new Error('Background jobs need REDIS_URL — none is configured');
  }

  const existing = queues.get(name);
  if (existing) return existing;

  connection ??= queueConnection();
  const created = new Queue(name, {
    connection,
    defaultJobOptions: { ...defaults, ...jobOptions },
  });
  queues.set(name, created);
  return created;
}

export const emailQueue = (): Queue =>
  // §9: five attempts with exponential backoff.
  queue(QUEUE.email, { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } });

export const pdfQueue = (): Queue =>
  queue(QUEUE.pdf, { attempts: 3, backoff: { type: 'exponential', delay: 2_000 } });

export const importQueue = (): Queue => queue(QUEUE.import, { attempts: 1 });

export const rfqDueQueue = (): Queue => queue(QUEUE.rfqDue, { attempts: 3 });

export const reportsQueue = (): Queue => queue(QUEUE.reports, { attempts: 2 });

export const mastersQueue = (): Queue => queue(QUEUE.masters, { attempts: 2 });

/** Hand queued outbox rows to the email worker after the transaction commits. */
export async function enqueueEmails(outboxIds: string[]): Promise<void> {
  if (!outboxIds.length) return;
  if (!queuesAvailable()) {
    // The rows stay QUEUED in the outbox and show as such on the Email
    // settings page — nothing is lost, they just are not sent yet.
    logger.warn({ count: outboxIds.length }, 'no queue — emails left in the outbox');
    return;
  }
  await emailQueue().addBulk(
    outboxIds.map((id) => ({
      name: 'send',
      data: { outboxId: id },
      opts: { jobId: `email:${id}` },
    })),
  );
}

/** §6: a delayed job at the RFQ's due time tells procurement quotes are closed. */
export async function scheduleRfqDue(rfqId: string, dueAt: Date): Promise<string> {
  const delay = Math.max(0, dueAt.getTime() - Date.now());
  const jobId = `rfq-due:${rfqId}:${dueAt.getTime()}`;
  await rfqDueQueue().add('due', { rfqId }, { delay, jobId });
  return jobId;
}

export async function cancelRfqDue(jobId: string): Promise<void> {
  if (!jobId) return;
  const job = await rfqDueQueue().getJob(jobId);
  await job?.remove();
}

/** §10: pull vendors and projects from the Payment app every 15 minutes. */
export async function scheduleMastersSync(): Promise<void> {
  if (!queuesAvailable()) return;
  await mastersQueue().add(
    'sync',
    {},
    { repeat: { every: 15 * 60 * 1000 }, jobId: 'masters-sync' },
  );
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  await connection?.quit();
  connection = null;
}
