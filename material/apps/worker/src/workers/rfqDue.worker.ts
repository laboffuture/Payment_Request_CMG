import { Worker } from 'bullmq';
import {
  QUEUE,
  Rfq,
  RfqVendor,
  emitNotification,
  inTransaction,
  logger,
  queueConnection,
  Vendor,
} from '@cm/api';

/**
 * §6: a delayed job fires at the enquiry's due time and tells procurement that
 * quotes are closed, with who replied and who did not.
 *
 * The job is scheduled when the RFQ is created and rescheduled when the due
 * time changes, so a stale firing is possible — it checks the current due time
 * and does nothing if it has moved.
 */
export const rfqDueWorker = () =>
  new Worker<{ rfqId: string }>(
    QUEUE.rfqDue,
    async (job) => {
      const rfq = await Rfq.findById(job.data.rfqId).lean();
      if (!rfq) return { skipped: 'no such enquiry' };
      if (rfq.status !== 'OPEN') return { skipped: `already ${rfq.status}` };
      if (rfq.dueAt.getTime() > Date.now() + 30_000) {
        return { skipped: 'due time was moved' };
      }

      const invitations = await RfqVendor.find({ rfqId: rfq._id }).lean();
      const quoted = invitations.filter((i) => i.status === 'QUOTED');
      const declined = invitations.filter((i) => i.status === 'DECLINED');
      const silent = invitations.filter(
        (i) => i.status === 'INVITED' || i.status === 'ACCEPTED',
      );

      const names = async (rows: typeof invitations) => {
        if (!rows.length) return 'none';
        const vendors = await Vendor.find({ _id: { $in: rows.map((r) => r.vendorId) } })
          .select('name')
          .lean();
        return vendors.map((v) => v.name).join(', ');
      };

      await inTransaction(async (session) => {
        await emitNotification(session, 'QUOTE_SUBMITTED', {
          title: `${rfq.no}: quotes are now closed`,
          body:
            `Quoted: ${await names(quoted)}\n` +
            `Declined: ${await names(declined)}\n` +
            `No response: ${await names(silent)}`,
          link: `rfq:${String(rfq._id)}`,
          to: [{ role: 'PROC' }],
          // Nobody caused this, so nobody is excluded.
          actorId: rfq.createdBy,
        });
      });

      logger.info({ rfq: rfq.no, quoted: quoted.length }, 'enquiry closed');
      return { quoted: quoted.length, declined: declined.length, silent: silent.length };
    },
    { connection: queueConnection(), concurrency: 2 },
  );
