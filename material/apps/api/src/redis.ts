import { Redis } from 'ioredis';
import { env, redisEnabled } from './env.js';
import { logger } from './logger.js';
import { MemoryRedis } from './lib/memoryRedis.js';

/**
 * One connection for ordinary use (rate limits, idempotency keys, report
 * cache). BullMQ needs its own connections with maxRetriesPerRequest: null,
 * created in jobs/queues.ts.
 *
 * With no REDIS_URL — local development on a machine without Docker — this is
 * an in-process stand-in instead. `env.ts` refuses that in production.
 */
type RedisLike = Pick<Redis, 'get' | 'set' | 'del' | 'scanStream' | 'call' | 'quit'>;

function createClient(): RedisLike {
  if (!redisEnabled) {
    logger.warn(
      'REDIS_URL is empty — using the in-process stand-in. Background jobs ' +
        '(email, PDFs, imports) are disabled and nothing is shared between ' +
        'processes. Development only.',
    );
    return new MemoryRedis() as unknown as RedisLike;
  }

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  client.on('error', (err) => logger.error({ err }, 'redis error'));
  client.on('connect', () => logger.info('redis connected'));
  return client;
}

export const redis: RedisLike = createClient();

export const CACHE_PREFIX = 'cm:cache:';
export const IDEMPOTENCY_PREFIX = 'cm:idem:';
export const IMPORT_PREFIX = 'cm:import:';
export const LOGIN_FAIL_PREFIX = 'cm:login:';

/** Read-through cache used by the report endpoints (§9: 60 s). */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const full = CACHE_PREFIX + key;
  try {
    const hit = await redis.get(full);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err, key }, 'cache read failed — computing');
  }
  const value = await produce();
  try {
    await redis.set(full, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, 'cache write failed');
  }
  return value;
}

export async function dropCache(prefix: string): Promise<void> {
  const pattern = `${CACHE_PREFIX}${prefix}*`;
  const stream = redis.scanStream({ match: pattern, count: 200 });
  for await (const keys of stream) {
    const batch = keys as string[];
    if (batch.length) await redis.del(...batch);
  }
}
