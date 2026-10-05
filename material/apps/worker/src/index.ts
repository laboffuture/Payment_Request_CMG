import { connectDb, disconnectDb, env, logger } from '@cm/api';
import { emailWorker } from './workers/email.worker.js';
import { importWorker } from './workers/import.worker.js';
import { mastersSyncWorker } from './workers/mastersSync.worker.js';
import { rfqDueWorker } from './workers/rfqDue.worker.js';
import { closeRenderer } from './pdf/render.js';
import { startBullBoard } from './bullBoard.js';

/**
 * The BullMQ worker process.
 *
 * Runs the email queue (with PDF attachments rendered by Puppeteer), the
 * one-time inventory import, the Payment-app masters sync and the delayed
 * RFQ due-time notifications.
 */
async function main(): Promise<void> {
  await connectDb();

  const workers = [
    emailWorker(),
    importWorker(),
    mastersSyncWorker(),
    rfqDueWorker(),
  ];

  for (const worker of workers) {
    worker.on('failed', (job, err) =>
      logger.error({ err, queue: worker.name, jobId: job?.id }, 'job failed'),
    );
    worker.on('completed', (job) =>
      logger.info({ queue: worker.name, jobId: job.id }, 'job done'),
    );
  }

  const board = env.BULL_BOARD_ENABLED ? startBullBoard() : null;

  logger.info(
    { queues: workers.map((w) => w.name), bullBoard: !!board },
    'worker ready',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker shutting down');
    await Promise.all(workers.map((w) => w.close()));
    await closeRenderer();
    board?.close();
    await disconnectDb().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
