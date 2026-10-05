/**
 * Sidebar definition per role — exact order and labels.
 * Prototype origin: NAV (with the *second* NAV.VENDOR definition, which wins
 * at runtime and adds "Invoices & DOs"; see plan decision (d)(13)).
 *
 * `count` names the key returned by GET /api/me/counts that draws the badge.
 */

import type { Role } from './enums.js';

export interface NavItem {
  href: string;
  label: string;
  /** key in the /me/counts payload, if this item shows a badge */
  count?: CountKey;
}

export const COUNT_KEYS = [
  'notifications',
  'pmQueue',
  'qsQueue',
  'pool',
  'docs',
  'poApprovals',
  'poValidations',
  'poMgmtApprovals',
  'issue',
  'grn',
  'receive',
  'vendorRfqs',
] as const;
export type CountKey = (typeof COUNT_KEYS)[number];

export type Counts = Partial<Record<CountKey, number>>;

export const NAV: Record<Role, readonly NavItem[]> = {
  SITE: [
    { href: '/', label: 'Home' },
    { href: '/mrs', label: 'My MRs' },
    { href: '/mrs/new', label: 'New MR' },
    // Read-only: where a request went once QS approved it.
    { href: '/pos', label: 'Purchase orders' },
    { href: '/receive', label: 'Receive at site', count: 'receive' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  PM: [
    { href: '/', label: 'Home' },
    { href: '/pm', label: 'MR approvals', count: 'pmQueue' },
    { href: '/mrs', label: 'All MRs' },
    { href: '/pos', label: 'Purchase orders' },
    { href: '/rfqs', label: 'Enquiries' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  QS: [
    { href: '/', label: 'Home' },
    { href: '/qs', label: 'QS queue', count: 'qsQueue' },
    { href: '/pos/validate', label: 'PO validation', count: 'poValidations' },
    { href: '/mrs', label: 'All MRs' },
    { href: '/pos', label: 'Purchase orders' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  PROC: [
    { href: '/', label: 'Home' },
    { href: '/pool', label: 'Consolidate MRs', count: 'pool' },
    { href: '/pos/new', label: 'Create PO' },
    { href: '/rfqs', label: 'Enquiries' },
    { href: '/pos', label: 'Purchase orders' },
    { href: '/docs', label: 'Invoices & DOs', count: 'docs' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  PROC_MGR: [
    { href: '/', label: 'Home' },
    { href: '/pos/approvals', label: 'PO approvals', count: 'poApprovals' },
    { href: '/pool', label: 'Consolidate MRs', count: 'pool' },
    { href: '/pos/new', label: 'Create PO' },
    { href: '/rfqs', label: 'Enquiries' },
    { href: '/pos', label: 'Purchase orders' },
    { href: '/docs', label: 'Invoices & DOs', count: 'docs' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  MGMT: [
    { href: '/', label: 'Home' },
    { href: '/pos/approvals', label: 'PO approvals', count: 'poMgmtApprovals' },
    { href: '/pos', label: 'Purchase orders' },
    { href: '/mrs', label: 'All MRs' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  STORE: [
    { href: '/', label: 'Home' },
    { href: '/grn', label: 'GRN — receive PO', count: 'grn' },
    { href: '/issue', label: 'Issue to site', count: 'issue' },
    { href: '/issues', label: 'Issue notes' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  ADMIN: [
    { href: '/', label: 'Home' },
    { href: '/admin/users', label: 'Users & logins' },
    { href: '/admin/vendors', label: 'Vendors' },
    { href: '/admin/projects', label: 'Projects' },
    { href: '/admin/company', label: 'Company & PO print' },
    { href: '/admin/categories', label: 'Categories' },
    { href: '/admin/items', label: 'Item master' },
    { href: '/admin/import', label: 'Import inventory' },
    { href: '/admin/notification-rules', label: 'Notification settings' },
    { href: '/admin/email', label: 'Email settings' },
    { href: '/mrs', label: 'All MRs' },
    // Read-only: an admin watches the process, never approves within it.
    { href: '/pos', label: 'Purchase orders' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/reports', label: 'Reports' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
  VENDOR: [
    { href: '/vendor', label: 'Enquiries', count: 'vendorRfqs' },
    { href: '/vendor/pos', label: 'My POs' },
    { href: '/vendor/docs', label: 'Invoices & DOs' },
    { href: '/notifications', label: 'Notifications', count: 'notifications' },
  ],
};

/** Where a role lands after signing in. */
export const homeFor = (role: Role): string =>
  role === 'VENDOR' ? '/vendor' : '/';

/**
 * Deep links. Prototype: openLink() — `#mr:<id>` etc.
 * We accept `?open=mr:<id>` and translate to a route.
 */
export const DEEP_LINK_ROUTES: Record<string, (id: string) => string> = {
  mr: (id) => `/mrs/${id}`,
  po: (id) => `/pos/${id}`,
  rfq: (id) => `/rfqs/${id}`,
  vrfq: (id) => `/vendor/rfqs/${id}`,
  iss: (id) => `/issues/${id}`,
  doc: (id) => `/docs?open=${id}`,
};

export const resolveDeepLink = (link: string): string | null => {
  const idx = link.indexOf(':');
  if (idx < 0) return null;
  const kind = link.slice(0, idx);
  const id = link.slice(idx + 1);
  const make = DEEP_LINK_ROUTES[kind] as ((id: string) => string) | undefined;
  return make && id ? make(id) : null;
};
