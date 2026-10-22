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
};

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
 * currency, added to the total as entered; Round-off alone may be negative.
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
  'Round-off',
] as const;
export type PoExtraCharge = (typeof PO_EXTRA_CHARGES)[number];
export const PO_ROUND_OFF: PoExtraCharge = 'Round-off';

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
 * A Tools & Assets request always goes to this one project - it is chosen for the
 * engineer, not picked. Matched without spacing, hyphens or case, so
 * "TRG- TOOLS & ASSET" and "TRG TOOLS & ASSET" are the same project.
 */
export const TOOLS_PROJECT_CODE = 'TRG TOOLS & ASSET';
export const TOOLS_PROJECT_NAME = 'TRG PROJECT TOOLS & ASSETS';
export const isToolsProjectCode = (code: string | null | undefined): boolean =>
  String(code ?? '').toUpperCase().replace(/[\s-]+/g, '') ===
  TOOLS_PROJECT_CODE.replace(/[\s-]+/g, '');

/**
 * The same item in another measurement is another product - it has its own price - so
 * lines are merged only when item and measurement match. Compared without case, spacing
 * or the kind of "x": "2400 x 1200" and "2400×1200" are one size.
 */
export const measurementKey = (measurement: string | null | undefined): string =>
  String(measurement ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*[x×*]\s*/g, '×')
    .replace(/\s+/g, ' ');
