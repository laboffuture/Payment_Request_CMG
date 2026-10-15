import { Types } from 'mongoose';
import type { Actor } from '../middleware/auth.js';
import { Mr, MrLine } from '../models/mr.js';
import { PoAlloc } from '../models/po.js';

/**
 * A site engineer sees only the POs raised against MRs they raised themselves;
 * every other PO is for the people who buy, check and receive it. Null for
 * any other role — no such limit.
 */
export async function sitePoIdsOf(actor: Actor): Promise<Set<string> | null> {
  if (actor.role !== 'SITE') return null;
  if (!Types.ObjectId.isValid(actor.id)) return new Set();
  const mrIds = await Mr.find({ createdBy: new Types.ObjectId(actor.id) }).distinct('_id');
  const lineIds = await MrLine.find({ mrId: { $in: mrIds } }).distinct('_id');
  const poIds = await PoAlloc.find({ mrLineId: { $in: lineIds } }).distinct('poId');
  return new Set(poIds.map(String));
}
