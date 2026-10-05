import { Worker } from 'bullmq';
import { QUEUE, queueConnection, syncExternalMasters } from '@cm/api';

/**
 * §10: pull vendors and projects from the Payment app every 15 minutes.
 *
 * Until we are given the Payment app's API details the adapter is a stub that
 * returns empty arrays, so this job runs and does nothing — which is the point:
 * the schedule, the upsert logic and the `source: "PAYMENT_APP"` marking are
 * already in place and tested.
 */
export const mastersSyncWorker = () =>
  new Worker(QUEUE.masters, async () => syncExternalMasters(), {
    connection: queueConnection(),
    concurrency: 1,
  });
