import { emptyWorld } from '../inputs.js';
import type {
  GrnIn,
  GrnLineIn,
  IssueIn,
  IssueLineIn,
  ItemIn,
  LedgerIn,
  MrIn,
  MrLineIn,
  PoAllocIn,
  PoIn,
  PoLineIn,
  ProjectIn,
  RfqIn,
  RfqLineIn,
  World,
} from '../inputs.js';

/** Small builders so a test reads as the scenario it describes. */

export const mr = (p: Partial<MrIn> & Pick<MrIn, 'id'>): MrIn => ({
  no: `MR-0114-26-${p.id}`,
  projectId: 'p1',
  requiredDate: '2026-12-31',
  status: 'APPROVED',
  createdBy: 'u-site',
  ...p,
});

export const mrLine = (
  p: Partial<MrLineIn> & Pick<MrLineIn, 'id' | 'mrId'>,
): MrLineIn => ({
  sn: 1,
  itemId: 'i1',
  qty: 100,
  storeQty: 0,
  poQty: 0,
  lineStatus: 'ACTIVE',
  ...p,
});

export const po = (p: Partial<PoIn> & Pick<PoIn, 'id'>): PoIn => ({
  no: `PO-26-${p.id}`,
  rev: 0,
  status: 'APPROVED',
  vendorId: 'v1',
  ...p,
});

export const poLine = (
  p: Partial<PoLineIn> & Pick<PoLineIn, 'id' | 'poId'>,
): PoLineIn => ({
  itemId: 'i1',
  qty: 0,
  rate: 0,
  gstPct: 5,
  ...p,
});

export const poAlloc = (
  p: Partial<PoAllocIn> & Pick<PoAllocIn, 'id' | 'poId' | 'poLineId' | 'mrLineId'>,
): PoAllocIn => ({
  projectId: 'p1',
  qty: 0,
  ...p,
});

export const grn = (p: Partial<GrnIn> & Pick<GrnIn, 'id' | 'poId'>): GrnIn => ({
  no: `GRN-26-${p.id}`,
  location: 'STORE',
  ...p,
});

export const grnLine = (
  p: Partial<GrnLineIn> & Pick<GrnLineIn, 'id' | 'grnId' | 'poAllocId'>,
): GrnLineIn => ({
  qtyReceived: 0,
  qtyRejected: 0,
  ...p,
});

export const issue = (
  p: Partial<IssueIn> & Pick<IssueIn, 'id' | 'mrId'>,
): IssueIn => ({
  no: `MIN-26-${p.id}`,
  projectId: 'p1',
  status: 'ISSUED',
  ...p,
});

export const issueLine = (
  p: Partial<IssueLineIn> & Pick<IssueLineIn, 'id' | 'issueId' | 'mrLineId'>,
): IssueLineIn => ({
  itemId: 'i1',
  qtyIssued: 0,
  qtyAccepted: 0,
  ...p,
});

export const rfq = (p: Partial<RfqIn> & Pick<RfqIn, 'id'>): RfqIn => ({
  no: `RFQ-26-${p.id}`,
  status: 'OPEN',
  dueAt: '2026-12-01T10:00:00.000Z',
  ...p,
});

export const rfqLine = (
  p: Partial<RfqLineIn> & Pick<RfqLineIn, 'id' | 'rfqId'>,
): RfqLineIn => ({
  itemId: 'i1',
  qty: 0,
  allocs: [],
  ...p,
});

export const ledger = (
  p: Partial<LedgerIn> & Pick<LedgerIn, 'id' | 'docType'>,
): LedgerIn => ({
  at: '2026-01-01T00:00:00.000Z',
  itemId: 'i1',
  qtyIn: 0,
  qtyOut: 0,
  ...p,
});

export const item = (p: Partial<ItemIn> & Pick<ItemIn, 'id'>): ItemIn => ({
  code: 'ITM-00001',
  name: 'Gypsum board 12.5 mm',
  unit: 'Nos',
  category: 'Civil',
  subCategory: 'Drywall',
  lastRate: 21.5,
  ...p,
});

export const project = (
  p: Partial<ProjectIn> & Pick<ProjectIn, 'id'>,
): ProjectIn => ({
  code: 'PRJ-0114',
  name: 'Demo project 0114',
  ...p,
});

export const world = (parts: Partial<World>): World => ({
  ...emptyWorld(),
  items: [item({ id: 'i1' })],
  projects: [project({ id: 'p1' })],
  ...parts,
});
