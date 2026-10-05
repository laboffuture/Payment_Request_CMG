import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

/**
 * Note on query injection (§13): request bodies, queries and params are
 * stripped of `$`-prefixed keys by `express-mongo-sanitize` before a
 * controller sees them, and every filter is then built in code from
 * Zod-validated values.
 *
 * Mongoose's global `sanitizeFilter` is deliberately NOT set: it escapes
 * operators in *every* filter, including the ones we write ourselves — it
 * turns `{ n: { $lt: 955 } }` into a literal comparison against an object —
 * so it would silently break legitimate queries while adding nothing on top
 * of the sanitising already done at the edge.
 */

let connected = false;

export async function connectDb(uri = env.MONGO_URI): Promise<void> {
  if (connected) return;
  await mongoose.connect(uri, {
    autoIndex: env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 20,
  });
  connected = true;
  logger.info({ db: mongoose.connection.name }, 'mongo connected');
}

export async function disconnectDb(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

/**
 * Every multi-document write goes through here (§9).
 *
 * `withTransaction` retries on TransientTransactionError and
 * UnknownTransactionCommitResult for us, so callers must make the body
 * idempotent — no side effects outside the session.
 */
export async function inTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export { mongoose };
