/**
 * Test environment. Set before anything imports `env.ts`, which validates the
 * configuration at module load and exits the process if it is wrong.
 *
 * `mongodb-memory-server` is started as a single-node replica set so the
 * transactions the services rely on actually work (§1).
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-that-is-long-enough-000';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-that-is-long-enough-0';
process.env.MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/test';
// Empty on purpose: the API then uses its in-process stand-in for the cache
// and idempotency keys, and BullMQ is off — so a test never needs a broker.
// The email rows still land in the outbox, which is what the tests assert on.
process.env.REDIS_URL = '';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.SEED_ALLOWED = 'true';
