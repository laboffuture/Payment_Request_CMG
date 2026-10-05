/**
 * Which routes exist, so the sidebar and the catch-all route agree on what is
 * real.
 *
 * Every screen in the brief is built; PLANNED is kept because a route added to
 * the navigation before its page exists should explain itself rather than drop
 * the user on a bare 404.
 */

export const PHASES: Record<number, string> = {
  1: 'Foundation',
  2: 'MR + QS',
  3: 'Procurement',
  4: 'Store & site',
  5: 'Vendor documents',
  6: 'Reports & polish',
};

/** Routes that are built and working. Prefix match. */
export const BUILT_ROUTES: readonly string[] = [
  '/',
  '/mrs',
  '/pm',
  '/qs',
  '/pool',
  '/rfqs',
  '/pos',
  '/docs',
  '/grn',
  '/issue',
  '/issues',
  '/receive',
  '/inventory',
  '/reports',
  '/notifications',
  '/vendor',
  '/admin/users',
  '/admin/vendors',
  '/admin/projects',
  '/admin/company',
  '/admin/categories',
  '/admin/items',
  '/admin/import',
  '/admin/notification-rules',
  '/admin/email',
];

interface Planned {
  prefix: string;
  title: string;
  phase: number;
  /** What the page will do, in the words of the brief. */
  summary: string;
}

/** Longest prefix wins, so `/pos/approvals` beats `/pos`. */
const PLANNED: readonly Planned[] = [
  {
    prefix: '/mrs/new',
    title: 'New material request',
    phase: 2,
    summary:
      'The mobile-first MR form: one project and one required date, the item picker (choose from the master list or add a new item for QS to clear), quantity, B.O.Q ref and remarks per line, then Save draft or Submit to QS.',
  },
  {
    prefix: '/mrs',
    title: 'Material requests',
    phase: 2,
    summary:
      'The MR register with status tabs and a project filter, the detail page with its progress bars and audit trail, the printable paper MR form, and the CSV export.',
  },
  {
    prefix: '/qs',
    title: 'QS queue',
    phase: 2,
    summary:
      'MRs waiting for QS, sorted by required date: clear any new items first, then split each line into from-store and for-PO, with the live "not approved" column and the store-availability check.',
  },
  {
    prefix: '/pool',
    title: 'Consolidate MRs',
    phase: 3,
    summary:
      'QS-approved PO quantities from every project, grouped by item — tick lines from any MR, see the site-wise analysis, then send one enquiry or raise one PO.',
  },
  {
    prefix: '/rfqs',
    title: 'Enquiries (RFQ)',
    phase: 3,
    summary:
      'Send an enquiry to several vendors with a due time, watch the countdown, compare quotes side by side with the L1 highlight, and award — creating one PO per vendor.',
  },
  {
    prefix: '/pos/approvals',
    title: 'PO approvals',
    phase: 3,
    summary:
      'Purchase orders waiting for the Procurement Manager. You cannot approve a PO you raised yourself.',
  },
  {
    prefix: '/pos/new',
    title: 'Create purchase order',
    phase: 3,
    summary:
      'The three-step wizard: pick MR items from the open pool, choose the vendor and prices, then review the printable PO and submit it for approval.',
  },
  {
    prefix: '/pos',
    title: 'Purchase orders',
    phase: 3,
    summary:
      'The PO register with status tabs, and the detail page with the printable PO, the value check, the split by project and MR, GRNs, documents and the revision history.',
  },
  {
    prefix: '/docs',
    title: 'Invoices & delivery orders',
    phase: 5,
    summary:
      'Documents uploaded by vendors on the portal, checked against the PO total and the received value, then verified or rejected with a reason.',
  },
  {
    prefix: '/grn',
    title: 'GRN — receive against PO',
    phase: 4,
    summary:
      'Search a PO number and receive against it — one GRN can cover several projects. Received quantity becomes issuable stock; rejected quantity stays open on the PO.',
  },
  {
    prefix: '/issues',
    title: 'Issue notes',
    phase: 4,
    summary: 'Every issue note raised by the store, and whether site has accepted it.',
  },
  {
    prefix: '/issue',
    title: 'Issue to site',
    phase: 4,
    summary:
      'Issuable MR lines grouped by MR — never more than the QS-approved store quantity, and never more than stock on hand.',
  },
  {
    prefix: '/receive',
    title: 'Receive at site',
    phase: 4,
    summary:
      'Accept store issues (a shortfall returns to store stock) and receive a PO delivered straight to site.',
  },
  {
    prefix: '/reports',
    title: 'Reports & MIS',
    phase: 6,
    summary:
      'Thirteen tabs — MR line tracker, site-wise MIS, item × project, category-wise, overdue lines, MR ageing, PO register, PO value, enquiry response, invoices, stock summary, pending by stage and vendor summary — each exportable to CSV.',
  },
  {
    prefix: '/vendor/pos',
    title: 'My purchase orders',
    phase: 3,
    summary:
      'Approved POs for your company: acknowledge each one and upload your invoice or delivery order against it.',
  },
  {
    prefix: '/vendor/docs',
    title: 'My invoices & DOs',
    phase: 5,
    summary:
      'Everything you have uploaded, and whether Chandramari procurement has checked it yet.',
  },
  {
    prefix: '/vendor',
    title: 'Enquiries',
    phase: 3,
    summary:
      'Enquiries sent to you: accept or decline, fill in your rates (on screen or with the downloadable quotation sheet) and submit until the due time.',
  },
];

export const isBuilt = (href: string): boolean =>
  BUILT_ROUTES.some((route) =>
    route === '/' ? href === '/' : href === route || href.startsWith(`${route}/`),
  );

export function plannedFor(pathname: string): Planned | null {
  return (
    PLANNED.find(
      (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
    ) ?? null
  );
}
