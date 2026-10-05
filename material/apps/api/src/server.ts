import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { closeQueues, queuesAvailable, scheduleMastersSync } from './jobs/queues.js';
import { syncExternalMasters } from './integrations/paymentApp.js';
import { ensureSystemDefaults } from './seed/defaults.js';
import { redis } from './redis.js';

async function main(): Promise<void> {
  await connectDb();
  await ensureSystemDefaults();
  await scheduleMastersSync();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
  });

  // Projects from the Payment app's job register: once now, so the dropdowns are
  // filled from the first request, and every 15 minutes in-process wherever the
  // BullMQ repeatable job (which needs Redis) is not running.
  const syncMasters = () =>
    syncExternalMasters().catch((err) => logger.warn({ err }, 'masters sync failed'));
  void syncMasters();
  if (!queuesAvailable()) setInterval(() => void syncMasters(), 15 * 60 * 1000).unref();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await closeQueues().catch(() => undefined);
    await disconnectDb().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'api failed to start');
  process.exit(1);
});
