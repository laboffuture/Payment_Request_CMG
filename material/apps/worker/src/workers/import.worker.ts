import { Worker } from 'bullmq';
import {
  QUEUE,
  dropPreview,
  logger,
  queueConnection,
  readPreviewRows,
  runImport,
} from '@cm/api';

/**
 * The one-time inventory import.
 * Prototype origin: A.impRun — "Imported: N new item(s), opening stock for N".
 *
 * The rows were validated and parked in Redis by /import/preview; this job only
 * writes them, reporting progress so the admin page can show a bar.
 */
export const importWorker = () =>
  new Worker<{ token: string; userId: string }>(
    QUEUE.import,
    async (job) => {
      const rows = await readPreviewRows(job.data.token);
      const outcome = await runImport(rows, job.data.userId, (percent) => {
        void job.updateProgress(percent);
      });

      await dropPreview(job.data.token);
      logger.info({ ...outcome }, 'inventory import complete');
      return outcome;
    },
    { connection: queueConnection(), concurrency: 1 },
  );
