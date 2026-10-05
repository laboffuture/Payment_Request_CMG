import { connectDb, disconnectDb } from '../db.js';
import { isProd, seedAllowed } from '../env.js';
import { logger } from '../logger.js';
import { redis } from '../redis.js';
import { clearAll, seed } from './seed.js';

/**
 * `pnpm seed` — loads the prototype's demo data.
 *
 * §9: development and staging only. Two locks, because this deletes every
 * document: NODE_ENV must not be production, and SEED_ALLOWED must be true.
 */
async function main(): Promise<void> {
  if (isProd || !seedAllowed) {
    logger.error(
      'Refusing to seed: set NODE_ENV to development or staging and SEED_ALLOWED=true',
    );
    process.exit(1);
  }

  await connectDb();
  logger.warn('clearing every collection before seeding');
  await clearAll();
  await seed();
  await disconnectDb();
  await redis.quit();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
