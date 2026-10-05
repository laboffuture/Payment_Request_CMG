import { z } from 'zod';
import { objectId, qty } from './common.js';
import { DELIVER_TO } from '../enums.js';
import { MSG } from '../messages.js';

/**
 * Receiving, issuing and site acceptance.
 * Prototype origin: A.postGRN, A.createIssue, A.acceptIssue.
 */

export const openPosQuery = z.object({
  location: z.enum(DELIVER_TO),
  /** optional PO number to look up directly */
  no: z.string().trim().optional().default(''),
});
export type OpenPosQuery = z.infer<typeof openPosQuery>;

export const postGrnInput = z.object({
  poId: objectId,
  location: z.enum(DELIVER_TO),
  dnNo: z.string().trim().min(1, MSG.grnDnRequired).max(60),
  invNo: z.string().trim().max(60).optional().default(''),
  remark: z.string().trim().max(500).optional().default(''),
  lines: z
    .array(
      z.object({
        poAllocId: objectId,
        qtyReceived: qty,
        qtyRejected: qty.default(0),
      }),
    )
    .min(1),
});
export type PostGrnInput = z.infer<typeof postGrnInput>;

export const createIssueInput = z.object({
  mrId: objectId,
  vehicle: z.string().trim().max(120).optional().default(''),
  lines: z
    .array(z.object({ mrLineId: objectId, qtyIssued: qty }))
    .min(1),
});
export type CreateIssueInput = z.infer<typeof createIssueInput>;

export const acceptIssueInput = z.object({
  lines: z
    .array(z.object({ issueLineId: objectId, qtyAccepted: qty }))
    .min(1),
  remark: z.string().trim().max(500).optional().default(''),
  rv: z.number().int().min(0).optional(),
});
export type AcceptIssueInput = z.infer<typeof acceptIssueInput>;
