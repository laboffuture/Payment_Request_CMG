import { Router } from 'express';
import { z } from 'zod';
import { wrap, sendCsv } from '../lib/http.js';
import { buildCsv, csvFilename } from '../lib/csv.js';
import { actorOf, authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createStoreStock,
  deleteStoreStock,
  listStoreStock,
  updateStoreStock,
} from '../services/storeStock.service.js';

/** Store Stock register - kept by the store and the administrator. */
export const storeStockRouter: Router = Router();

const keepers = [requireAuth, authorize('STORE', 'ADMIN')] as const;

const text = (max: number) => z.string().trim().max(max).default('');
const entryInput = z.object({
  name: z.string().trim().min(1, 'Enter the material name').max(300),
  category: text(120),
  specification: text(1000),
  brand: text(120),
  unit: text(40),
  qty: z.coerce.number().min(0, 'Quantity cannot be below 0').default(0),
  location: text(200),
  remarks: text(1000),
});

storeStockRouter.get(
  '/store-stock',
  ...keepers,
  wrap(async (_req, res) => res.json(await listStoreStock())),
);

const CSV_COLUMNS = [
  'Code', 'Material', 'Category', 'Specification', 'Brand', 'Unit', 'Quantity',
  'Location', 'Remarks', 'Last updated by',
] as const;

storeStockRouter.get(
  '/store-stock/export.csv',
  ...keepers,
  wrap(async (_req, res) => {
    const rows = (await listStoreStock()).map((r) => ({
      Code: r.code,
      Material: r.name,
      Category: r.category,
      Specification: r.specification,
      Brand: r.brand,
      Unit: r.unit,
      Quantity: r.qty,
      Location: r.location,
      Remarks: r.remarks,
      'Last updated by': r.updatedByName,
    }));
    sendCsv(res, csvFilename('store-stock'), buildCsv(CSV_COLUMNS, rows));
  }),
);

storeStockRouter.post(
  '/store-stock',
  ...keepers,
  validateBody(entryInput),
  wrap(async (req, res) => {
    res.status(201).json(await createStoreStock(actorOf(req), req.body));
  }),
);

storeStockRouter.put(
  '/store-stock/:id',
  ...keepers,
  validateBody(entryInput.extend({ rv: z.coerce.number().int().min(0) })),
  wrap(async (req, res) => {
    res.json(await updateStoreStock(actorOf(req), req.params.id!, req.body));
  }),
);

storeStockRouter.delete(
  '/store-stock/:id',
  ...keepers,
  wrap(async (req, res) => {
    res.json(await deleteStoreStock(req.params.id!));
  }),
);
