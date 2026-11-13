/**
 * Enumerations ported verbatim from the prototype.
 * Prototype origin: UNITS, TAX_RATES, TAXM, ROLE_NAMES.
 */

export const UNITS = [
  'Nos',
  'Pkt',
  'Lm',
  'Rmt',
  'Sqm',
  'Sqft',
  'Cum',
  'Cft',
  'Kg',
  'Bag',
  'Box',
  'Pail',
  'Sheet',
  'Ltr',
  'Set',
  'Roll',
  'Pair',
  'Ton',
  'Lot',
  // From the product lists (5 Oct 2026): units those items are bought in.
  'Bucket',
  'Can',
  'Coil',
  'Bundle',
  'Rft',
  'Case',
  'Ml',
] as const;
export type BuiltInUnit = (typeof UNITS)[number];
/**
 * A unit name. The built-in list above, plus any unit QS or an administrator adds from the
 * item master (kept in the units collection); the API checks a name is on one of the two.
 */
export type Unit = string;

/**
 * The long name behind each abbreviation, for the dropdowns — "Cft" and "Cum"
 * are one letter apart on screen and a factor of 35 apart on site.
 */
export const UNIT_NAMES: Record<BuiltInUnit, string> = {
  Nos: 'Nos — numbers',
  Pkt: 'Pkt — packets',
  Lm: 'Lm — linear metre',
  Rmt: 'Rmt — running metre',
  Sqm: 'Sqm — square metre',
  Sqft: 'Sqft — square foot',
  Cum: 'Cum — cubic metre',
  Cft: 'Cft — cubic foot',
  Kg: 'Kg — kilogram',
  Bag: 'Bag',
  Box: 'Box',
  Pail: 'Pail',
  Sheet: 'Sheet',
  Ltr: 'Ltr — litre',
  Set: 'Set',
  Roll: 'Roll',
  Pair: 'Pair',
  Ton: 'Ton',
  Lot: 'Lot',
  Bucket: 'Bucket',
  Can: 'Can',
  Coil: 'Coil',
  Bundle: 'Bundle',
  Rft: 'Rft — running foot',
  Case: 'Case',
  Ml: 'Ml — millilitre',
};

/** The dropdown label for a unit: the long name of a built-in one, else the name itself. */
export const unitLabel = (unit: string): string =>
  (UNIT_NAMES as Record<string, string>)[unit] ?? unit;

/** Suggested tax rates offered in the datalists. Not a constraint. */
export const TAX_RATES = [0, 5, 12, 15, 18, 28] as const;

export const TAX_MODES = ['VAT', 'IGST', 'CGST_SGST', 'NONE'] as const;
export type TaxMode = (typeof TAX_MODES)[number];

/** Prototype: TAXM */
export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  VAT: 'VAT',
  IGST: 'GST — IGST',
  CGST_SGST: 'GST — CGST + SGST',
  NONE: 'No tax',
};

export const ROLES = [
  'SITE',
  'PM',
  'QS',
  'PROC',
  'PROC_MGR',
  'MGMT',
  'STORE',
  'ADMIN',
  'VENDOR',
  /** view only: dashboard, MRs and POs to look at (no role uses it at present) */
  'VIEW',
  /** Operations: approves the corporate purchase project's MRs in place of the PM */
  'OPS',
  /** IT Manager: approves the IT assets project's MRs in place of the PM */
  'IT',
] as const;
export type Role = (typeof ROLES)[number];

/** Prototype: ROLE_NAMES */
export const ROLE_NAMES: Record<Role, string> = {
  SITE: 'Site engineer',
  PM: 'Project Manager',
  QS: 'QS',
  PROC: 'Procurement (buyer)',
  PROC_MGR: 'Procurement Manager',
  MGMT: 'Management (view)',
  STORE: 'Store',
  ADMIN: 'Admin',
  VENDOR: 'Vendor',
  VIEW: 'View only',
  OPS: 'Operations',
  IT: 'IT Manager',
};

/** The roles that can be kept to chosen projects (none chosen = every project). */
export const isProjectScopedRole = (role: Role | string | undefined): boolean =>
  role === 'SITE' || role === 'PM';

/** Prototype: isBuyer() */
export const isBuyer = (role: Role | string | undefined): boolean =>
  role === 'PROC' || role === 'PROC_MGR';

/**
 * Prototype: roleMatch() — a notification addressed to PROC also reaches PROC_MGR.
 */
export const roleMatch = (
  notificationRole: string | undefined,
  userRole: string | undefined,
): boolean =>
  !!notificationRole &&
  (notificationRole === userRole ||
    (notificationRole === 'PROC' && userRole === 'PROC_MGR'));

export const MASTER_SOURCES = ['LOCAL', 'PAYMENT_APP'] as const;
export type MasterSource = (typeof MASTER_SOURCES)[number];

/** Prototype: the `src` column shown on the Vendors and Projects pages. */
export const SOURCE_LABELS: Record<MasterSource, string> = {
  LOCAL: 'Created here',
  PAYMENT_APP: 'Payment app',
};

export const DELIVER_TO = ['STORE', 'SITE'] as const;
export type DeliverTo = (typeof DELIVER_TO)[number];

export const LEDGER_DOC_TYPES = [
  'OPENING',
  'GRN',
  'SITE_GRN',
  'ISSUE',
  'RETURN',
  /** taken out of the Store Stock register to be issued (it then leaves on the ISSUE row) */
  'STORE_STOCK',
] as const;
export type LedgerDocType = (typeof LEDGER_DOC_TYPES)[number];

export const AUDIT_DOC_TYPES = ['MR', 'PO', 'RFQ'] as const;
export type AuditDocType = (typeof AUDIT_DOC_TYPES)[number];

export const VENDOR_DOC_TYPES = ['INVOICE', 'DO'] as const;
export type VendorDocType = (typeof VENDOR_DOC_TYPES)[number];

/** Prototype: the reason dropdown on PO wizard step 3. */
export const PO_DIRECT_REASONS = [
  'Repeat order at last rate',
  'Rate contract',
  'Urgent requirement',
  'Sole / approved supplier',
  'Other — see notes',
] as const;

/** Prototype: IMPORT_COLS */
export const IMPORT_COLS = [
  'Item Code',
  'Item Name',
  'Unit',
  'Category',
  'Sub Category',
  'Opening Qty',
  'Rate',
  'Remarks',
] as const;

/** Prototype: A.vSheetCsv header row */
export const QUOTATION_SHEET_COLS = [
  'S.No',
  'Item Code',
  'Description',
  'Measurement',
  'Qty',
  'Requested qty',
  'Unit',
  'Rate',
  'Remarks',
] as const;

/** Prototype: A.mrCsv column list */
export const MR_CSV_COLS = [
  'MR No',
  'Date',
  'Job No',
  'Job Name',
  'S.No',
  'BOQ Ref',
  'Description',
  'Qty',
  'Unit',
  'Req Date',
  'QS store',
  'QS PO',
  'Status',
  'Requested by',
  'PM',
  'QS',
] as const;

/**
 * The Chandramari Group mark, printed at the head of every material request
 * and every purchase order. It is a static asset of the web app rather than an
 * upload, so a document can never come out unbranded because nobody configured
 * one. A billing entity that sets its own logo (Company & PO print) overrides
 * it — that is the point of that setting.
 */
export const BRAND_LOGO_URL = '/logo.png';

/** The currencies a purchase order may be raised in. */
export const CURRENCIES = ['INR', 'USD', 'AED', 'SAR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<Currency, string> = {
  INR: 'INR — Indian rupee',
  USD: 'USD — US dollar',
  AED: 'AED — UAE dirham',
  SAR: 'SAR — Saudi riyal',
};

export const DEFAULT_CURRENCY: Currency = 'INR';

export const DEFAULT_PAYMENT_TERMS = '30 days from delivery';
export const DEFAULT_QUOTE_VALIDITY_DAYS = 14;
export const DEFAULT_RFQ_DUE_HOURS = 72;
export const DEFAULT_PO_DELIVERY_DAYS = 7;

/** Upload limits (§13). */
export const MAX_VENDOR_DOC_BYTES = 1024 * 1024; // 1 MB
export const MAX_LOGO_BYTES = 300 * 1024; // 300 KB

/**
 * Extra charges procurement may add to a purchase order, beside the material lines.
 * Optional: a PO without any is the normal case. Each is a flat amount in the PO's
 * currency, added to the total as entered; Round-off alone may be negative, and a Discount
 * is always a minus amount.
 */
export const PO_EXTRA_CHARGES = [
  'Transport Charge',
  'Cut-out Charge',
  'Planing Charge',
  'Weighing Charge',
  'Energy Surcharge',
  'Document Charge',
  'Handling Charge',
  'Insurance Charge',
  'Polishing Charge',
  'Logo Charge',
  'Cutting Charge',
  'Loading Charge',
  'Installation Charge',
  'Holes Charge',
  'Packaging Charge',
  'Fixing Charge',
  'Discount',
  'Round-off',
] as const;
export type PoExtraCharge = (typeof PO_EXTRA_CHARGES)[number];
export const PO_ROUND_OFF: PoExtraCharge = 'Round-off';
/** Taken off the total: kept as a minus amount, typed as a plain figure, never taxed. */
export const PO_DISCOUNT: PoExtraCharge = 'Discount';
/** Charges that carry no GST: Round-off and Discount. */
export const isUntaxedCharge = (type: string): boolean => type === PO_ROUND_OFF || type === PO_DISCOUNT;
/** The tax % every new PO line starts with; procurement can change it per line or for all. */
export const DEFAULT_PO_GST_PCT = 18;

/** GST filled in on an extra charge as its amount is typed; procurement can still change it. */
export const PO_CHARGE_GST_PCT = 18;

/**
 * What a request is for. Material, tools & assets and sub-contractor requests all follow
 * the same process (PM, QS, procurement, PO, receipt); the type only says what is being
 * asked for. Petty cash differs - see below. Requests from before the type existed are
 * material requests.
 */
export const REQUEST_TYPES = ['MATERIAL', 'TOOLS', 'SUB_CONTRACTOR', 'PETTY_CASH'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  MATERIAL: 'Material request',
  TOOLS: 'Tools & Assets',
  SUB_CONTRACTOR: 'Sub-Contractor',
  PETTY_CASH: 'Project Petty Cash',
};

/**
 * Project petty cash: site engineer -> PM -> QS -> procurement reviews and approves
 * (no PO is raised) -> the site engineer posts the GRN for what was bought.
 */
export const isPettyCash = (type: string | null | undefined): boolean => type === 'PETTY_CASH';

/**
 * Where the site engineer wants the material delivered: to the site, or into the store.
 * Asked of material and tools requests only, and only of the site engineer who raises it.
 */
export const DELIVER_TO_LABELS: Record<DeliverTo, string> = { SITE: 'Site', STORE: 'Store' };
export const asksDeliverTo = (type: string | null | undefined): boolean =>
  type === 'MATERIAL' || type === 'TOOLS' || !type;

/**
 * A Tools & Assets request always goes to this one project - it is chosen for the
 * engineer, not picked. Matched without spacing, hyphens or case, so
 * "TRG- TOOLS & ASSET" and "TRG TOOLS & ASSET" are the same project.
 */
export const TOOLS_PROJECT_CODE = 'TRG TOOLS & ASSET';
export const TOOLS_PROJECT_NAME = 'TRG PROJECT TOOLS & ASSETS';
/**
 * Projects whose material requests get their first approval from a department head role
 * instead of a Project Manager; that role sees only its own project's MRs and POs. After
 * the first approval the request goes to QS like any other. Codes are matched without
 * spacing, hyphens or case, like the tools project.
 */
export const FIRST_APPROVER_PROJECTS = [
  { role: 'OPS', code: 'TRG-CORP', approver: 'Operations', project: 'corporate purchase' },
  { role: 'IT', code: 'TRG-IT', approver: 'IT Manager', project: 'IT assets' },
  { role: 'OPS', code: 'TRG-GENERAL', approver: 'Operations', project: 'office general expense' },
] as const;
export type FirstApproverProject = (typeof FIRST_APPROVER_PROJECTS)[number];
export type FirstApproverRole = FirstApproverProject['role'];

const codeKey = (code: string | null | undefined) =>
  String(code ?? '').toUpperCase().replace(/[\s-]+/g, '');

/** The department that approves this project's MRs first, or null for a Project Manager. */
export const firstApproverForProjectCode = (
  code: string | null | undefined,
): FirstApproverProject | null =>
  FIRST_APPROVER_PROJECTS.find((p) => codeKey(p.code) === codeKey(code)) ?? null;

/**
 * Projects whose MRs skip QS: once the first approver approves, the MR goes straight to
 * procurement with everything for PO. An MR asking for an item not yet in the item master
 * still goes to QS, who adds new items.
 */
export const QS_SKIP_PROJECT_CODES = ['TRG-IT'] as const;
export const skipsQs = (code: string | null | undefined): boolean =>
  QS_SKIP_PROJECT_CODES.some((c) => codeKey(c) === codeKey(code));

/** The projects a first-approver role is kept to (Operations has more than one). */
export const firstApproverProjectsOfRole = (role: string): FirstApproverProject[] =>
  FIRST_APPROVER_PROJECTS.filter((p) => p.role === role);

export const isFirstApproverRole = (role: string): role is FirstApproverRole =>
  FIRST_APPROVER_PROJECTS.some((p) => p.role === role);

export const isToolsProjectCode = (code: string | null | undefined): boolean =>
  String(code ?? '').toUpperCase().replace(/[\s-]+/g, '') ===
  TOOLS_PROJECT_CODE.replace(/[\s-]+/g, '');

/**
 * The same item in another measurement is another product - it has its own price - so
 * lines are merged only when item and measurement match. Compared without case, spacing
 * or the kind of "x": "2400 x 1200" and "2400×1200" are one size.
 */
/**
 * What the site engineer wrote on an MR line, for telling lines of one item apart on a PO:
 * "round chair" and "long chair" are two products even when both are the item Chair.
 * Compared without case or extra spacing.
 */
export const mrTextKey = (text: string | null | undefined): string =>
  String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const measurementKey = (measurement: string | null | undefined): string =>
  String(measurement ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*[x×*]\s*/g, '×')
    .replace(/\s+/g, ' ');
