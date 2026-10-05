import express from 'express';
import type { Server } from 'node:http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { QUEUE, env, logger, queueConnection } from '@cm/api';

/**
 * Bull Board — the queue dashboard.
 *
 * §13: it is never exposed publicly. It listens on 4100 inside the Docker
 * network only; Nginx does not proxy it, so reaching it means an SSH tunnel
 * (`ssh -L 4100:localhost:4100 …`). That is deliberate — the dashboard can
 * retry and delete jobs, so a password on a public port is not enough.
 */
export function startBullBoard(): Server {
  const connection = queueConnection();
  const queues = [
    QUEUE.email,
    QUEUE.pdf,
    QUEUE.import,
    QUEUE.rfqDue,
    QUEUE.reports,
    QUEUE.masters,
  ].map((name) => new BullMQAdapter(new Queue(name, { connection })));

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/');
  createBullBoard({ queues, serverAdapter });

  const app = express();
  app.use('/', serverAdapter.getRouter());

  const port = 4100;
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(
      { port, env: env.NODE_ENV },
      'bull board listening on the internal network only',
    );
  });

  return server;
}
