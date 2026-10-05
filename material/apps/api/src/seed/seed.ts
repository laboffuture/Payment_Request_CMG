import { Types } from 'mongoose';
import { hashPassword } from '../lib/password.js';
import { inTransaction } from '../db.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { logger } from '../logger.js';
import {
  AuditLog,
  Category,
  Company,
  Counter,
  EmailOutbox,
  Grn,
  GrnLine,
  Issue,
  IssueLine,
  Item,
  Mr,
  MrLine,
  Notification,
  Po,
  PoAlloc,
  PoLine,
  PoRevision,
  Project,
  Quote,
  RefreshToken,
  Rfq,
  RfqLine,
  RfqVendor,
  StockLedger,
  User,
  Vendor,
  VendorDoc,
} from '../models/index.js';
import { ensureSystemDefaults } from './defaults.js';

/**
 * The prototype's `seed()`, one for one.
 *
 * §9: seed only in development or staging — `run.ts` refuses otherwise.
 *
 * The demo password is `demo123`, exactly as the brief specifies. That is
 * shorter than the ≥ 8 rule the API enforces on passwords people type; the rule
 * lives in the request schema, and the seed writes hashes directly. Demo
 * accounts therefore work as documented without weakening the real rule, and
 * they never exist in production.
 */

const DEMO_PASSWORD = 'demo123';

const id = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));

// Stable ids so re-seeding is idempotent and deep links in the docs keep working.
const IDS = {
  users: {
    site1: id('1001'),
    pm1: id('1002'),
    admin: id('1003'),
    qs: id('1004'),
    proc: id('1005'),
    mgmt: id('1006'),
    pmgr: id('1007'),
    store: id('1008'),
    vendora: id('1009'),
    vendorb: id('100a'),
    vendorc: id('100b'),
    site2: id('100c'),
  },
  vendors: { a: id('2001'), b: id('2002'), c: id('2003') },
  projects: { p98: id('3001'), p114: id('3002'), p105: id('3003') },
  company: id('4001'),
  cats: {
    civil: id('5001'),
    mep: id('5002'),
    finishes: id('5003'),
    joinery: id('5004'),
    consumables: id('5005'),
    electrical: id('5011'),
    plumbing: id('5012'),
    hvac: id('5013'),
    drywall: id('5014'),
    cement: id('5015'),
    paint: id('5016'),
    ceiling: id('5017'),
  },
  items: {
    i1: id('6001'),
    i2: id('6002'),
    i3: id('6003'),
    i4: id('6004'),
    i5: id('6005'),
    i6: id('6006'),
    i7: id('6007'),
    i8: id('6008'),
    i9: id('6009'),
  },
  mrs: { m1: id('7001'), m2: id('7002'), m3: id('7003') },
  mrLines: {
    l1: id('8001'),
    l2: id('8002'),
    l3: id('8003'),
    l4: id('8004'),
    l5: id('8005'),
    l6: id('8006'),
    l7: id('8007'),
    l8: id('8008'),
    l9: id('8009'),
  },
};

const addDays = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const yy = String(new Date().getFullYear()).slice(2);

/** Wipes every collection. Only ever called from `run.ts` outside production. */
export async function clearAll(): Promise<void> {
  // Each model has its own document type, so the array is a union that no
  // single call signature satisfies — narrow it to the one method we need.
  const collections: { deleteMany: (filter: object) => Promise<unknown> }[] = [
    AuditLog,
    Category,
    Company,
    Counter,
    EmailOutbox,
    Grn,
    GrnLine,
    Issue,
    IssueLine,
    Item,
    Mr,
    MrLine,
    Notification,
    Po,
    PoAlloc,
    PoLine,
    PoRevision,
    Project,
    Quote,
    RefreshToken,
    Rfq,
    RfqLine,
    RfqVendor,
    StockLedger,
    User,
    Vendor,
    VendorDoc,
  ];

  await Promise.all(collections.map((m) => m.deleteMany({})));
}

export async function seed(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();

  await inTransaction(async (session) => {
    // --- vendors, projects, company ---------------------------------------
    await Vendor.create(
      [
        {
          _id: IDS.vendors.a,
          name: 'Vendor A (demo)',
          email: 'sales@vendor-a.example',
          source: 'LOCAL',
        },
        {
          _id: IDS.vendors.b,
          name: 'Vendor B (demo)',
          email: 'sales@vendor-b.example',
          source: 'LOCAL',
        },
        { _id: IDS.vendors.c, name: 'Vendor C (demo)', source: 'LOCAL' },
      ],
      { session, ordered: true },
    );

    await Project.create(
      [
        { _id: IDS.projects.p98, code: 'PRJ-0098', name: 'Demo project 0098', source: 'LOCAL' },
        { _id: IDS.projects.p114, code: 'PRJ-0114', name: 'Demo project 0114', source: 'LOCAL' },
        { _id: IDS.projects.p105, code: 'PRJ-0105', name: 'Demo project 0105', source: 'LOCAL' },
      ],
      { session, ordered: true },
    );

    await Company.create(
      [
        {
          _id: IDS.company,
          name: 'Chandramari (demo)',
          legalName: '[Legal entity name]',
          address: '[Address line 1]\n[City, Country]',
          taxLabel: 'TRN',
          taxNo: '[Tax number]',
          currency: 'AED',
          taxMode: 'VAT',
          defaultTax: 5,
          poTerms:
            '1. Quote the PO number on every delivery note and invoice.\n' +
            '2. Goods are accepted only after inspection at the delivery point.\n' +
            '3. [Add your standard terms here]',
          isDefault: true,
        },
      ],
      { session, ordered: true },
    );

    // --- users -------------------------------------------------------------
    const user = (
      _id: Types.ObjectId,
      login: string,
      name: string,
      role: string,
      extra: Record<string, unknown> = {},
    ) => ({
      _id,
      login,
      name,
      email: `${login}@example.com`,
      role,
      active: true,
      emailOn: true,
      passwordHash,
      projectIds: [],
      ...extra,
    });

    await User.create(
      [
        user(IDS.users.site1, 'site1', 'Site Engineer 1', 'SITE', {
          projectIds: [IDS.projects.p114, IDS.projects.p98],
        }),
        // A site engineer for the third project, so every project has one.
        user(IDS.users.site2, 'site2', 'Site Engineer 2', 'SITE', {
          projectIds: [IDS.projects.p105],
        }),
        // The Project Manager reviews every project's requests before QS does.
        user(IDS.users.pm1, 'pm1', 'Project Manager 1', 'PM'),
        user(IDS.users.admin, 'admin', 'Admin User', 'ADMIN'),
        user(IDS.users.qs, 'qs', 'QS User', 'QS'),
        user(IDS.users.proc, 'proc', 'Procurement User', 'PROC'),
        user(IDS.users.mgmt, 'mgmt', 'Management User', 'MGMT'),
        user(IDS.users.pmgr, 'pmgr', 'Procurement Manager', 'PROC_MGR'),
        user(IDS.users.store, 'store', 'Store Keeper', 'STORE'),
        user(IDS.users.vendora, 'vendora', 'Vendor A — sales', 'VENDOR', {
          vendorId: IDS.vendors.a,
        }),
        user(IDS.users.vendorb, 'vendorb', 'Vendor B — sales', 'VENDOR', {
          vendorId: IDS.vendors.b,
        }),
        user(IDS.users.vendorc, 'vendorc', 'Vendor C — sales', 'VENDOR', {
          vendorId: IDS.vendors.c,
        }),
      ],
      { session, ordered: true },
    );

    // --- category tree -----------------------------------------------------
    const cat = (_id: Types.ObjectId, name: string, parentId: Types.ObjectId | null = null) => ({
      _id,
      name,
      parentId,
      active: true,
    });

    await Category.create(
      [
        cat(IDS.cats.civil, 'Civil'),
        cat(IDS.cats.mep, 'MEP'),
        cat(IDS.cats.finishes, 'Finishes'),
        cat(IDS.cats.joinery, 'Joinery'),
        cat(IDS.cats.consumables, 'Consumables'),
        cat(IDS.cats.electrical, 'Electrical', IDS.cats.mep),
        cat(IDS.cats.plumbing, 'Plumbing', IDS.cats.mep),
        cat(IDS.cats.hvac, 'HVAC', IDS.cats.mep),
        cat(IDS.cats.drywall, 'Drywall', IDS.cats.civil),
        cat(IDS.cats.cement, 'Cement & blocks', IDS.cats.civil),
        cat(IDS.cats.paint, 'Paint', IDS.cats.finishes),
        cat(IDS.cats.ceiling, 'Ceiling', IDS.cats.finishes),
      ],
      { session, ordered: true },
    );

    // --- item master -------------------------------------------------------
    const item = (
      _id: Types.ObjectId,
      code: string,
      name: string,
      unit: string,
      category: string,
      subCategory: string,
      lastRate: number | null,
    ) => ({
      _id,
      code,
      name,
      unit,
      category,
      subCategory,
      active: true,
      lastRate,
      lastVendorId: lastRate ? IDS.vendors.a : null,
      createdBy: IDS.users.admin,
    });

    await Item.create(
      [
        item(IDS.items.i1, 'ITM-00231', 'Gypsum board 12.5 mm', 'Nos', 'Civil', 'Drywall', 21.5),
        item(IDS.items.i2, 'ITM-00410', 'Joint compound 20 kg', 'Bag', 'Civil', 'Drywall', 38),
        item(IDS.items.i3, 'ITM-00377', 'Ceiling tile 600×600', 'Nos', 'Finishes', 'Ceiling', 9.8),
        item(IDS.items.i4, 'ITM-00812', 'Emulsion paint, white 18 L', 'Pail', 'Finishes', 'Paint', 145),
        item(IDS.items.i5, 'ITM-00955', 'Wall plug 8 mm', 'Box', 'Consumables', '', 12),
        item(IDS.items.i6, 'ITM-00602', 'Aluminium main runner 24 mm', 'Lm', 'Finishes', 'Ceiling', 6.5),
        item(IDS.items.i7, 'ITM-00118', 'MDF board 18 mm', 'Sheet', 'Joinery', '', 95),
        item(IDS.items.i8, 'ITM-00701', 'PVC conduit 20 mm', 'Lm', 'MEP', 'Electrical', 2.5),
        item(IDS.items.i9, 'ITM-00702', 'PPR pipe 25 mm', 'Lm', 'MEP', 'Plumbing', 4.2),
      ],
      { session, ordered: true },
    );

    // --- opening stock -----------------------------------------------------
    const opening: [Types.ObjectId, number][] = [
      [IDS.items.i1, 30],
      [IDS.items.i2, 52],
      [IDS.items.i4, 6],
      [IDS.items.i5, 12],
      [IDS.items.i8, 200],
    ];
    await StockLedger.create(
      opening.map(([itemId, qty]) => ({
        at: now,
        itemId,
        docType: 'OPENING',
        docNo: 'OPENING',
        refNo: 'Stock count',
        qtyIn: qty,
        qtyOut: 0,
      })),
      { session, ordered: true },
    );

    // --- three material requests, in the prototype's states ----------------
    await Mr.create(
      [
        {
          _id: IDS.mrs.m1,
          no: `MR-0114-${yy}-0001`,
          projectId: IDS.projects.p114,
          requiredDate: addDays(7),
          remarks: 'Deliver to site store, gate 2.',
          status: 'QS_PENDING',
          createdBy: IDS.users.site1,
          submittedAt: now,
        },
        {
          _id: IDS.mrs.m2,
          no: `MR-0098-${yy}-0001`,
          projectId: IDS.projects.p98,
          requiredDate: addDays(11),
          status: 'QS_PENDING',
          createdBy: IDS.users.site1,
          submittedAt: now,
        },
        {
          _id: IDS.mrs.m3,
          no: `MR-0105-${yy}-0001`,
          projectId: IDS.projects.p105,
          requiredDate: addDays(9),
          status: 'APPROVED',
          createdBy: IDS.users.pm1,
          submittedAt: now,
          qsBy: IDS.users.qs,
          qsAt: now,
        },
      ],
      { session, ordered: true },
    );

    await MrLine.create(
      [
        {
          _id: IDS.mrLines.l1,
          mrId: IDS.mrs.m1,
          sn: 1,
          itemId: IDS.items.i1,
          qty: 40,
          remarks: 'Level 2 ceiling, rooms 201–206',
        },
        {
          // The new item waiting for QS — the demo's most interesting line.
          _id: IDS.mrLines.l2,
          mrId: IDS.mrs.m1,
          sn: 2,
          itemId: null,
          newItemName: 'Aluminium T-grid 24 mm, white',
          newUnit: 'Lm',
          newCategory: 'Finishes',
          newStatus: 'PENDING',
          qty: 120,
          remarks: 'Match existing grid on Level 1',
        },
        { _id: IDS.mrLines.l3, mrId: IDS.mrs.m2, sn: 1, itemId: IDS.items.i1, qty: 100, remarks: 'Level 3 partitions' },
        { _id: IDS.mrLines.l4, mrId: IDS.mrs.m2, sn: 2, itemId: IDS.items.i2, qty: 40, remarks: 'Level 3' },
        { _id: IDS.mrLines.l5, mrId: IDS.mrs.m2, sn: 3, itemId: IDS.items.i3, qty: 400, remarks: 'Corridors' },
        { _id: IDS.mrLines.l6, mrId: IDS.mrs.m2, sn: 4, itemId: IDS.items.i4, qty: 24, remarks: 'Two coats' },
        { _id: IDS.mrLines.l7, mrId: IDS.mrs.m2, sn: 5, itemId: IDS.items.i5, qty: 10, remarks: 'Fixing' },
        {
          _id: IDS.mrLines.l8,
          mrId: IDS.mrs.m3,
          sn: 1,
          itemId: IDS.items.i3,
          qty: 250,
          remarks: 'Meeting rooms',
          storeQty: 0,
          poQty: 250,
        },
        {
          _id: IDS.mrLines.l9,
          mrId: IDS.mrs.m3,
          sn: 2,
          itemId: IDS.items.i1,
          qty: 50,
          remarks: 'Shaft walls',
          storeQty: 20,
          poQty: 30,
        },
      ],
      { session, ordered: true },
    );

    // --- counters: the three MR numbers above are already used -------------
    await Counter.create(
      [
        { _id: `MR-0114-${yy}`, n: 1 },
        { _id: `MR-0098-${yy}`, n: 1 },
        { _id: `MR-0105-${yy}`, n: 1 },
        { _id: 'ITM', n: 955 },
      ],
      { session, ordered: true },
    );

    // --- audit trail -------------------------------------------------------
    await AuditLog.create(
      [
        { docType: 'MR', docId: IDS.mrs.m1, action: 'Submitted to QS', userId: IDS.users.site1, at: now },
        { docType: 'MR', docId: IDS.mrs.m2, action: 'Submitted to QS', userId: IDS.users.site1, at: now },
        {
          docType: 'MR',
          docId: IDS.mrs.m3,
          action: 'QS approved split',
          userId: IDS.users.qs,
          at: now,
          note: 'store 20 · PO 280',
        },
      ],
      { session, ordered: true },
    );

    await bumpSyncStamp(session);
  });

  await ensureSystemDefaults();
  logger.info('seed complete — every demo login uses the password demo123');
}

export { IDS as SEED_IDS, DEMO_PASSWORD };
