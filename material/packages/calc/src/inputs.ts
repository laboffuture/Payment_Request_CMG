/**
 * Plain input shapes for the pure calculations.
 *
 * Deliberately *not* Mongoose documents: the API maps query results into these,
 * and the unit tests build them by hand. Ids are plain strings and compared
 * with `same()` so an ObjectId stringified anywhere still matches.
 */

import type {
  IssueStatus,
  MrLineStatus,
  MrStatus,
  PoStatus,
  RfqStatus,
} from '@cm/shared';
import type { LedgerDocType, TaxMode } from '@cm/shared';

export const same = (a: unknown, b: unknown): boolean =>
  String(a ?? '') === String(b ?? '');

export interface MrIn {
  id: string;
  no: string;
  projectId: string;
  requiredDate: string;
  status: MrStatus;
  createdBy: string;
  submittedAt?: string | null;
  closedAt?: string | null;
  createdAt?: string;
}

export interface MrLineIn {
  id: string;
  mrId: string;
  sn: number;
  itemId: string | null;
  newItemName?: string;
  newUnit?: string;
  newCategory?: string;
  newStatus?: string;
  qty: number;
  storeQty?: number | null;
  poQty?: number | null;
  lineStatus: MrLineStatus;
  /** 'QUERY' or 'REJECT' while procurement has sent the line back to QS */
  procHold?: string;
}

export interface PoIn {
  id: string;
  no: string;
  rev: number;
  status: PoStatus;
  vendorId: string;
  companyId?: string;
  rfqId?: string | null;
  deliverTo?: string;
  subtotal?: number;
  taxTotal?: number;
  total?: number;
  taxMode?: TaxMode;
  createdAt?: string;
}

export interface PoLineIn {
  id: string;
  poId: string;
  itemId: string;
  qty: number;
  rate: number;
  gstPct: number;
}

export interface PoAllocIn {
  id: string;
  poId: string;
  poLineId: string;
  mrLineId: string;
  projectId: string;
  qty: number;
}

export interface GrnIn {
  id: string;
  no: string;
  poId: string;
  location: 'STORE' | 'SITE';
  createdAt?: string;
}

export interface GrnLineIn {
  id: string;
  grnId: string;
  poAllocId: string;
  qtyReceived: number;
  qtyRejected: number;
}

export interface IssueIn {
  id: string;
  no: string;
  mrId: string;
  projectId: string;
  status: IssueStatus;
  createdAt?: string;
}

export interface IssueLineIn {
  id: string;
  issueId: string;
  mrLineId: string;
  itemId: string;
  qtyIssued: number;
  qtyAccepted: number;
}

export interface RfqIn {
  id: string;
  no: string;
  status: RfqStatus;
  dueAt: string;
}

export interface RfqAllocIn {
  mrLineId: string;
  projectId: string;
  qty: number;
}

export interface RfqLineIn {
  id: string;
  rfqId: string;
  itemId: string;
  qty: number;
  allocs: RfqAllocIn[];
}

export interface LedgerIn {
  id: string;
  at: string;
  itemId: string;
  docType: LedgerDocType;
  qtyIn: number;
  qtyOut: number;
}

export interface ItemIn {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  subCategory?: string;
  lastRate?: number | null;
  lastVendorId?: string | null;
}

export interface ProjectIn {
  id: string;
  code: string;
  name: string;
}

/**
 * Everything the calculations may read. The API builds one of these per
 * request from a small number of queries; tests build one literal.
 */
export interface World {
  mrs: MrIn[];
  mrLines: MrLineIn[];
  pos: PoIn[];
  poLines: PoLineIn[];
  poAllocs: PoAllocIn[];
  grns: GrnIn[];
  grnLines: GrnLineIn[];
  issues: IssueIn[];
  issueLines: IssueLineIn[];
  rfqs: RfqIn[];
  rfqLines: RfqLineIn[];
  ledger: LedgerIn[];
  items: ItemIn[];
  projects: ProjectIn[];
}

export const emptyWorld = (): World => ({
  mrs: [],
  mrLines: [],
  pos: [],
  poLines: [],
  poAllocs: [],
  grns: [],
  grnLines: [],
  issues: [],
  issueLines: [],
  rfqs: [],
  rfqLines: [],
  ledger: [],
  items: [],
  projects: [],
});

export const byId = <T extends { id: string }>(
  rows: readonly T[],
  id: unknown,
): T | undefined => rows.find((r) => same(r.id, id));
