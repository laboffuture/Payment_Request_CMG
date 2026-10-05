import { Worker } from 'bullmq';
import { EmailOutbox, QUEUE, addressesFor, logger, queueConnection } from '@cm/api';
import { getMailer, type Mail } from '../mailer.js';
import { renderPoHtml } from '../pdf/poDocument.js';
import { htmlToPdf } from '../pdf/render.js';

/**
 * Sends one outbox row.
 * Prototype origin: the outbox table and its status chips.
 *
 * §9: five attempts with exponential backoff, and the row's status follows the
 * attempt — SENDING → SENT / FAILED / SKIPPED, with the error kept so the admin
 * page can show what went wrong.
 */
export const emailWorker = () =>
  new Worker<{ outboxId: string }>(
    QUEUE.email,
    async (job) => {
      const row = await EmailOutbox.findById(job.data.outboxId);
      if (!row) return { skipped: 'no such outbox row' };
      if (row.status === 'SENT') return { skipped: 'already sent' };

      // A test email carries its recipient on the row; everything else is
      // resolved from the role/user/vendor it was addressed to.
      const to = row.sentTo?.length ? row.sentTo : await addressesFor(row);

      if (!to.length) {
        row.status = 'SKIPPED';
        row.error = 'No email address on file';
        await row.save();
        return { skipped: 'no recipients' };
      }

      row.status = 'SENDING';
      row.tries = (row.tries ?? 0) + 1;
      await row.save();

      // §9: the PO_APPROVED email to the vendor carries the PO as a PDF.
      const attachments: Mail['attachments'] = [];
      if (row.attachPoId) {
        try {
          const { html, no } = await renderPoHtml(String(row.attachPoId));
          attachments.push({
            filename: `${no.replace(/\s+/g, '-')}.pdf`,
            content: await htmlToPdf(html),
            contentType: 'application/pdf',
          });
        } catch (err) {
          // A missing attachment must not stop the notification going out.
          logger.warn({ err, outboxId: row.id }, 'could not attach the PO pdf');
        }
      }

      try {
        await getMailer().send({
          to,
          subject: row.subject,
          text: row.body ?? '',
          ...(attachments.length ? { attachments } : {}),
        });
        row.status = 'SENT';
        row.sentAt = new Date();
        row.sentTo = to;
        row.error = '';
        await row.save();
        return { sent: to.length };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Only give up for good once BullMQ has used its last attempt.
        const finalAttempt = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
        row.status = finalAttempt ? 'FAILED' : 'QUEUED';
        row.error = message;
        await row.save();
        logger.warn({ err, outboxId: row.id }, 'email send failed');
        throw err;
      }
    },
    { connection: queueConnection(), concurrency: 4 },
  );
