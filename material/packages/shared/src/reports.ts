/**
 * Reports & MIS — the thirteen tabs, in the prototype's order.
 * Prototype origin: REPORTS and reportData(tab, pj).
 *
 * Each tab returns an array of flat rows; `_id` and `_v` (when present) say
 * which record a row clicks through to, and are stripped from the CSV.
 */

export const REPORT_TABS = [
  { value: 'lines', label: 'MR line tracker' },
  { value: 'site', label: 'Site-wise MIS' },
  { value: 'itemproj', label: 'Item × project' },
  { value: 'category', label: 'Category-wise' },
  { value: 'overdue', label: 'Overdue lines' },
  { value: 'ageing', label: 'MR ageing' },
  { value: 'pos', label: 'PO register' },
  { value: 'povalue', label: 'PO value by project & vendor' },
  { value: 'rfq', label: 'Enquiry response' },
  { value: 'docs', label: 'Invoices & DOs' },
  { value: 'stock', label: 'Stock summary' },
  { value: 'stage', label: 'Pending by stage' },
  { value: 'vendors', label: 'Vendor summary' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['value'];

export const REPORT_TAB_VALUES = REPORT_TABS.map((t) => t.value) as readonly ReportTab[];

export const isReportTab = (value: string): value is ReportTab =>
  (REPORT_TAB_VALUES as readonly string[]).includes(value);

/** A row is a flat record; keys starting with `_` are metadata, not columns. */
export type ReportRow = Record<string, string | number> & {
  _id?: string;
  /** which detail route the row opens */
  _v?: 'mrview' | 'poview' | 'rfqview';
};

export interface ReportResponse {
  tab: ReportTab;
  label: string;
  columns: string[];
  rows: ReportRow[];
  /** only the MR line tracker carries the KPI tiles */
  kpis?: { label: string; value: number }[];
}

/** Where a clickable report row goes. */
export const REPORT_ROUTE: Record<string, (id: string) => string> = {
  mrview: (id) => `/mrs/${id}`,
  poview: (id) => `/pos/${id}`,
  rfqview: (id) => `/rfqs/${id}`,
};
