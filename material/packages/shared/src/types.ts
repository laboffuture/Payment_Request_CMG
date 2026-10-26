/**
 * Serialized shapes the API returns. These are what the web app consumes —
 * never a raw Mongoose document, so vendor-unsafe fields cannot leak by
 * accident (plan decision (d)(10), (d)(20)).
 */

import type {
  Currency,
  RequestType,
  DeliverTo,
  LedgerDocType,
  MasterSource,
  Role,
  TaxMode,
  Unit,
  VendorDocType,
} from './enums.js';
import type {
  IssueStatus,
  MrLineStatus,
  MrStatus,
  NewItemStatus,
  PoStatus,
  RfqStatus,
  RfqVendorStatus,
  VendorDocStatus,
  EmailStatus,
  MaterialStatus,
} from './statuses.js';

export interface Doc {
  id: string;
  rv: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserDto extends Doc {
  name: string;
  login: string;
  email: string;
  phone: string;
  role: Role;
  vendorId: string | null;
  vendorName: string | null;
  projectIds: string[];
  paymentUserId: string;
  active: boolean;
  emailOn: boolean;
}

export interface VendorDto extends Doc {
  /** vendor number printed on the PO, e.g. V-0001 */
  code: string;
  name: string;
  country: string;
  email: string;
  phone: string;
  taxNo: string;
  address: string;
  contactPerson: string;
  /** what the supplier is used for: "Plywood", "Electrical Material"… */
  category: string;
  city: string;
  source: MasterSource;
  /** "Payment app" | "Created here" */
  sourceLabel: string;
  portalLogins: string[];
}

export interface ProjectDto extends Doc {
  code: string;
  name: string;
  source: MasterSource;
  sourceLabel: string;
  active: boolean;
  mrCount?: number;
}

export interface CompanyDto extends Doc {
  name: string;
  legalName: string;
  address: string;
  taxLabel: string;
  taxNo: string;
  phone: string;
  email: string;
  currency: string;
  taxMode: TaxMode;
  defaultTax: number;
  poTerms: string;
  logoUrl: string | null;
  isDefault: boolean;
}

/** A unit of measure as the dropdowns offer it. */
export interface UnitDto {
  name: string;
  label: string;
  builtIn: boolean;
}

export interface CategoryDto extends Doc {
  name: string;
  parentId: string | null;
  active: boolean;
  children?: CategoryDto[];
  itemCount?: number;
}

export interface ItemDto extends Doc {
  code: string;
  name: string;
  unit: Unit;
  category: string;
  subCategory: string;
  spec: string;
  /** From the product lists: maker, pack size, HSN code, GST % (null = not set). */
  brand: string;
  packing: string;
  hsn: string;
  gstRate: number | null;
  active: boolean;
  lastRate: number | null;
  lastVendorId: string | null;
  lastVendorName: string | null;
}

export interface StockDto {
  itemId: string;
  opening: number;
  in: number;
  out: number;
  onHand: number;
  reserved: number;
  available: number;
}

export interface InventoryRowDto extends ItemDto, StockDto {}

export interface LedgerRowDto {
  id: string;
  at: string;
  docType: LedgerDocType;
  docNo: string;
  refNo: string;
  projectId: string | null;
  projectCode: string | null;
  qtyIn: number;
  qtyOut: number;
  note: string;
  /** running balance, computed in order of `at` */
  balance: number;
}

export interface MrLineDto {
  id: string;
  sn: number;
  itemId: string | null;
  itemCode: string | null;
  name: string;
  /** the item master's brand, printed on the MR form; blank for a new item */
  brand: string;
  unit: string;
  category: string;
  newStatus: NewItemStatus;
  newItemName: string;
  newUnit: string;
  newCategory: string;
  newSpec: string;
  qty: number;
  /** what is wanted, in the engineer's words — required on submit */
  description: string;
  /** free text, e.g. "2400 × 1200 × 12.5 mm" */
  measurement: string;
  /** what the site engineer originally asked for, before any approver edit */
  requestedQty: number;
  requestedMeasurement: string;
  requestedUnit: string;
  /** true when an approver changed the quantity, measurement or unit */
  changed: boolean;
  boqRef: string;
  remarks: string;
  storeQty: number | null;
  poQty: number | null;
  qsRemark: string;
  /** QS's open question about this item — the site engineer changes it and resubmits */
  qsQuery: string;
  lineStatus: MrLineStatus;
}

export interface MrDto extends Doc {
  no: string;
  /** material, tools or services */
  requestType: RequestType;
  projectId: string;
  projectCode: string;
  projectName: string;
  requiredDate: string;
  remarks: string;
  status: MrStatus;
  createdBy: string;
  createdByName: string;
  submittedAt: string | null;
  lastComment: string;
  qsBy: string | null;
  qsByName: string | null;
  qsAt: string | null;
  pmBy: string | null;
  pmByName: string | null;
  pmAt: string | null;
  /** who left the last comment, so the UI can say who rejected or changed it */
  lastCommentByName: string;
  lastCommentRole: string;
  /** how many bill-of-quantities files are attached, if any */
  boqFileCount: number;
  closedAt: string | null;
  lineCount: number;
  newItemCount: number;
  overdue: boolean;
  /** item names, codes and descriptions of the lines — only on the list, for searching */
  materialText?: string;
}

export interface TrailRowDto {
  id: string;
  at: string;
  action: string;
  userName: string;
  note: string;
  /** The enquiry / PO an entry belongs to, on QS's start-to-end trail of an MR. */
  doc?: string;
}

export interface NotificationDto {
  id: string;
  event: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
}

export interface OutboxRowDto extends Doc {
  event: string;
  subject: string;
  body: string;
  status: EmailStatus;
  to: string[];
  tries: number;
  sentAt: string | null;
  error: string;
}

export interface NotifyRuleDto {
  event: string;
  label: string;
  goesTo: string;
  portal: boolean;
  email: boolean;
  vendorEmail: boolean;
  vendorEmailAllowed: boolean;
}

export interface MailHealthDto {
  ready: boolean;
  provider: string;
  from: string;
  queued: number;
  failed: number;
  error?: string;
}

export interface SyncStampDto {
  upd: number;
}

// --- shapes used from Phase 3 onwards, declared here so the web client and
// --- the calc package agree from the start.

export interface PoLineDto {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** procurement's description for the vendor; empty = the item name */
  description: string;
  /** the size this line is for; lines of one item differ by it */
  measurement: string;
  unit: string;
  qty: number;
  rate: number;
  gstPct: number;
}

export interface PoAllocDto {
  id: string;
  poLineId: string;
  mrLineId: string;
  mrNo: string;
  /** the item, so QS can validate the PO against what QS approved */
  itemName: string;
  unit: string;
  /** the for-PO quantity QS approved on that MR line */
  qsApprovedQty: number;
  projectId: string;
  projectCode: string;
  qty: number;
  received: number;
  balance: number;
}

/**
 * One suggested vendor for a set of items, with the evidence behind it.
 * The buyer is never obliged to take it — it is a shortcut, not a decision.
 */
export interface VendorSuggestionDto {
  vendorId: string;
  vendorName: string;
  /** how many of the requested items this vendor has a known rate for */
  itemsPriced: number;
  itemsTotal: number;
  /** the order value at those rates, for the items it can price */
  estimatedTotal: number;
  /** promised lead time, averaged over this vendor's quotes */
  leadDays: number | null;
  /** what actually happened: approval to first receipt, averaged over past POs */
  measuredDays: number | null;
  /** one line saying why this vendor came up */
  reason: string;
}

export interface PoRecommendationsDto {
  /** the cheapest vendor for these items */
  byMoney: VendorSuggestionDto | null;
  /** the quickest vendor for these items */
  byTime: VendorSuggestionDto | null;
  /** every vendor considered, best price first */
  considered: VendorSuggestionDto[];
}

export interface PoDto extends Doc {
  no: string;
  displayNo: string;
  rev: number;
  status: PoStatus;
  vendorId: string;
  vendorName: string;
  companyId: string;
  deliverTo: DeliverTo;
  deliveryDate: string;
  deliveryAddress: string;
  billingAddress: string;
  terms: string;
  notes: string;
  /** terms & conditions written for this order; empty = the company's standard ones apply */
  conditions: string;
  taxMode: TaxMode;
  /** the currency this order is placed in */
  currency: Currency;
  reason: string;
  rfqId: string | null;
  rfqNo: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  createdBy: string;
  createdByName: string;
  /** the Procurement Manager who let it through to QS */
  procMgrBy: string | null;
  procMgrByName: string | null;
  procMgrAt: string | null;
  /** QS, who confirmed the PO carries what QS asked for */
  qsBy: string | null;
  qsByName: string | null;
  qsAt: string | null;
  qsRemark: string;
  /** management's final approval — what "Approved by" means on the paper PO */
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  lastComment: string;
  /** who said it and in which role, so every page can attribute the status */
  lastCommentByName: string;
  lastCommentRole: string;
  vendorAckAt: string | null;
  projectCodes: string[];
  /** how many files are attached to the PO */
  fileCount: number;
  /** extra charges procurement added (transport, cutting, round-off…), in the PO's currency */
  charges: { type: string; amount: number }[];
  /** their sum; already inside `total` */
  chargesTotal: number;
  receivedPct: number;
}

export interface RfqDto extends Doc {
  no: string;
  status: RfqStatus;
  dueAt: string;
  note: string;
  createdBy: string;
  createdByName: string;
  lineCount: number;
  projectCodes: string[];
  quotedCount: number;
  vendorCount: number;
}

export interface RfqVendorDto {
  id: string;
  vendorId: string;
  vendorName: string;
  status: RfqVendorStatus;
  leadDays: number | null;
  validity: string | null;
  terms: string;
  vatPct: number | null;
  submittedAt: string | null;
  late: boolean;
}

export interface IssueDto extends Doc {
  no: string;
  mrId: string;
  mrNo: string;
  projectId: string;
  projectCode: string;
  status: IssueStatus;
  vehicle: string;
  createdByName: string;
  acceptedByName: string | null;
  acceptedAt: string | null;
  remark: string;
  lineCount: number;
  /** what the site attached when accepting the issue */
  acceptFileCount: number;
}

export interface VendorDocDto extends Doc {
  poId: string;
  poNo: string;
  vendorId: string;
  vendorName: string;
  docType: VendorDocType;
  docNo: string;
  docDate: string;
  amount: number;
  fileName: string;
  status: VendorDocStatus;
  remark: string;
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// Detail payloads
// ---------------------------------------------------------------------------

/** Per-line figures from `packages/calc`'s lineCalc, as the UI shows them. */
export interface LineCalcDto {
  store: number;
  po: number;
  approved: number;
  cut: number;
  poAlloc: number;
  rfqOpen: number;
  poolOpen: number;
  received: number;
  recStore: number;
  recSite: number;
  issuable: number;
  issuedGross: number;
  issuedNet: number;
  pendingIssue: number;
  accepted: number;
  siteAcc: number;
  balance: number;
  closed: boolean;
}

export interface MrLineDetailDto extends MrLineDto {
  calc: LineCalcDto;
  /**
   * Procurement's query / rejection from Consolidate MRs and QS's answer, with the files
   * sent each way - shown to staff on the MR page (not to site engineers or vendors).
   */
  procHold?: 'NONE' | 'QUERY' | 'REJECT';
  procRemark?: string;
  procByName?: string;
  procFiles?: BoqFileDto[];
  qsReply?: string;
  qsReplyFiles?: BoqFileDto[];
  /** project petty cash: the quantity received on the GRN (null until it is posted) */
  grnQty?: number | null;
  /** store availability, shown on the QS split screen */
  available: number;
  onHand: number;
}

/** One PO still to be received, as listed on the receive screens. */
export interface OpenPoRowDto {
  id: string;
  no: string;
  vendorName: string;
  status: string;
  createdAt: string;
  deliveryDate: string;
  projectCodes: string[];
  /** the MRs on this PO - for a site engineer, only the ones they raised */
  mrNos: string[];
  /** who raised those MRs */
  raisedBy: string[];
  ordered: number;
  received: number;
}

/** The receipt a site engineer posts for a project petty cash request. */
export interface PettyGrnDto {
  no: string;
  billNo: string;
  remark: string;
  byName: string;
  at: string;
  files: BoqFileDto[];
}

/** One purchase order raised against this MR, with its whole approval chain. */
export interface LinkedPoDto {
  id: string;
  no: string;
  status: PoStatus;
  vendorName: string;
  /** the quantity of this MR's lines that this PO covers */
  qty: number;
  total: number;
  raisedByName: string;
  raisedAt: string;
  procMgrByName: string | null;
  procMgrAt: string | null;
  qsByName: string | null;
  qsAt: string | null;
  qsRemark: string;
  approvedByName: string | null;
  approvedAt: string | null;
  lastComment: string;
  lastCommentRole: string;
  lastCommentByName: string;
}

/** One attached bill-of-quantities file. Keyed by its own storage id. */
export interface BoqFileDto {
  id: string;
  name: string;
  size: number;
  url: string;
}

export interface MrDetailDto extends MrDto {
  lines: MrLineDetailDto[];
  trail: TrailRowDto[];
  /**
   * What procurement did with this request, in full: who raised the PO, who
   * approved it at each gate and when, and what was said if it was stopped.
   * The site engineer and the Project Manager see the same thing procurement
   * and management do — nothing about the chain is withheld from them.
   */
  linkedPos: LinkedPoDto[];
  /** enquiries procurement sent out for these lines, before any PO exists */
  linkedRfqs: { id: string; no: string; status: RfqStatus; dueAt: string }[];
  linkedIssues: { id: string; no: string; status: IssueStatus }[];
  canEdit: boolean;
  canPm: boolean;
  canQs: boolean;
  /** project petty cash: procurement may approve / send back / reject it now */
  canProcReview: boolean;
  /** project petty cash: the site engineer may post the GRN now */
  canPostGrn: boolean;
  /** project petty cash: the GRN the site posted (no PO is raised for petty cash) */
  pettyGrn: PettyGrnDto | null;
  /** the BOQ files, with short-lived links, for the requester, the PM and QS */
  boqFiles: BoqFileDto[];
  companyName: string;
  companyLegalName: string;
  companyLogoUrl: string | null;
}

/** One row of the consolidation pool. Prototype: poolRows(). */
export interface PoolRowDto {
  mrLineId: string;
  mrId: string;
  mrNo: string;
  projectId: string;
  projectCode: string;
  requiredDate: string;
  overdue: boolean;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** what the site engineer wrote on the MR line — a reference for procurement */
  mrDescription: string;
  /** the size asked for; the same item in another measurement is a separate product */
  measurement: string;
  unit: string;
  category: string;
  openQty: number;
  lastRate: number | null;
  lastVendorId: string | null;
  lastVendorName: string | null;
  /** the item's GST % from the item master; null when not set */
  gstRate: number | null;
  /** set when the line came back from QS: what procurement had asked, and QS's answer */
  procRemark: string;
  qsReply: string;
  /** what QS attached to that answer */
  qsReplyFiles: BoqFileDto[];
  qsReplyBy: string;
  /** how many drawings / BOQ files the site engineer attached to the MR */
  attachments: number;
  /** where this material has got to: pending, part ordered, on enquiry… */
  status: MaterialStatus;
}

/**
 * One material QS approved for purchase, whatever has happened to it since - the status
 * view of Consolidate MRs. Unlike a pool row it stays listed once it is fully ordered or
 * delivered.
 */
export interface MaterialStatusRowDto {
  mrLineId: string;
  mrId: string;
  mrNo: string;
  projectId: string;
  projectCode: string;
  requiredDate: string;
  itemCode: string;
  itemName: string;
  mrDescription: string;
  unit: string;
  category: string;
  status: MaterialStatus;
  /** what QS approved to buy */
  toBuy: number;
  /** on purchase orders that are still live */
  onPo: number;
  received: number;
  /** still to be ordered */
  openQty: number;
  /** the POs it is on, with each PO's own status */
  pos: { id: string; no: string; status: string }[];
  /** what procurement asked or said when sending it back to QS */
  procRemark: string;
}

/** A pool line procurement sent back to QS, waiting for QS's answer. */
export interface ProcHoldDto {
  mrLineId: string;
  mrId: string;
  mrNo: string;
  projectCode: string;
  requiredDate: string;
  itemCode: string;
  itemName: string;
  mrDescription: string;
  unit: string;
  openQty: number;
  action: 'QUERY' | 'REJECT';
  remark: string;
  /** what procurement attached to the query / rejection */
  files: BoqFileDto[];
  byName: string;
  at: string;
}

export interface PoolAnalysisDto {
  projects: { id: string; code: string }[];
  rows: {
    itemId: string;
    itemName: string;
    unit: string;
    perProject: Record<string, number>;
    totalQty: number;
    lastRate: number | null;
    value: number;
    earliestNeed: string;
    /** approved POs (approved, part- or fully received) that bought this item, and the latest one's date */
    timesPurchased: number;
    lastPurchased: string;
  }[];
  valueByProject: Record<string, number>;
  grandTotal: number;
}

export interface RfqLineDto {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: number;
  lastRate: number | null;
  allocs: {
    mrLineId: string;
    mrId: string;
    mrNo: string;
    projectId: string;
    projectCode: string;
    qty: number;
  }[];
}

export interface QuoteCellDto {
  vendorId: string;
  rate: number;
  remark: string;
  amount: number;
  isL1: boolean;
}

export interface RfqDetailDto extends RfqDto {
  lines: RfqLineDto[];
  vendors: RfqVendorDto[];
  /** rfqLineId -> one cell per quoting vendor */
  quotes: Record<string, QuoteCellDto[]>;
  /** rfqLineId -> the winning vendorId, or null when nobody quoted */
  l1: Record<string, string | null>;
  totalsByVendor: Record<string, number>;
  lastRatesTotal: number;
  trail: TrailRowDto[];
  closed: boolean;
}

/** The vendor's own view of an enquiry — never another vendor's rates. */
export interface VendorRfqDto {
  id: string;
  no: string;
  status: RfqStatus;
  dueAt: string;
  note: string;
  myStatus: RfqVendorStatus;
  canQuote: boolean;
  pastDue: boolean;
  leadDays: number | null;
  vatPct: number | null;
  validity: string;
  terms: string;
  submittedAt: string | null;
  lines: {
    id: string;
    sn: number;
    itemCode: string;
    itemName: string;
    unit: string;
    qty: number;
    rate: number;
    remark: string;
  }[];
  subtotal: number;
}

export interface PoDetailDto extends PoDto {
  lines: PoLineDto[];
  allocs: PoAllocDto[];
  company: CompanyDto | null;
  vendor: VendorDto | null;
  /** hidden from vendors (plan decision (d)(20)) */
  trail: TrailRowDto[];
  grns: GrnDto[];
  docs: VendorDocDto[];
  revisions: {
    rev: number;
    reason: string;
    byName: string;
    at: string;
    totalBefore: number;
  }[];
  valueCheck: { poTotal: number; receivedValue: number; invoiced: number } | null;
  /** what procurement attached (quotation, vendor mail, drawing) — never sent to a vendor login */
  files: BoqFileDto[];
  /** this reader may add files / may take one off again */
  canAttach: boolean;
  canDetach: boolean;
  canEdit: boolean;
  canApprove: boolean;
  /** QS, on a PO the Procurement Manager has passed on */
  canValidate: boolean;
  /** management, on a PO QS has validated */
  canMgmtApprove: boolean;
  canRevise: boolean;
  canCancel: boolean;
  isOwnPo: boolean;
  taxByRate: { rate: number; tax: number }[];
}

export interface GrnDto extends Doc {
  no: string;
  poId: string;
  poNo: string;
  vendorName: string;
  location: DeliverTo;
  dnNo: string;
  invNo: string;
  remark: string;
  createdByName: string;
  projectCodes: string[];
  /** delivery note / photos attached when it was received — required for a site receipt */
  fileCount: number;
}

/** One receivable allocation on the GRN screen. */
export interface GrnOpenLineDto {
  poAllocId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  projectId: string;
  projectCode: string;
  mrNo: string;
  ordered: number;
  receivedBefore: number;
  balance: number;
}

export interface GrnOpenPoDto {
  po: PoDto;
  lines: GrnOpenLineDto[];
  projectCount: number;
  /** the vendor's latest uploaded DO number, prefilled into the form */
  suggestedDnNo: string;
  vendorDoNos: string[];
}

/** One issuable MR line, grouped by MR on the Issue page. */
export interface IssuableLineDto {
  mrLineId: string;
  itemId: string;
  itemName: string;
  unit: string;
  issuable: number;
  onHand: number;
  suggested: number;
}

export interface IssuableMrDto {
  mrId: string;
  mrNo: string;
  projectCode: string;
  projectName: string;
  requiredDate: string;
  lines: IssuableLineDto[];
}

export interface IssueLineDto {
  id: string;
  mrLineId: string;
  itemName: string;
  unit: string;
  qtyIssued: number;
  qtyAccepted: number;
}

export interface IssueDetailDto extends IssueDto {
  lines: IssueLineDto[];
  canAccept: boolean;
}

/** Everything the printable documents need, resolved server-side. */
export interface MrPrintDto {
  mr: MrDto;
  lines: MrLineDto[];
  company: CompanyDto | null;
  requestedByName: string;
  qsName: string | null;
  qsAt: string | null;
}
