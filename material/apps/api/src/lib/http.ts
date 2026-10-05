import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { CSV_BOM } from './csv.js';

/** Keeps every route handler free of try/catch boilerplate. */
export const wrap =
  <T>(handler: (req: Request, res: Response) => Promise<T>): RequestHandler =>
  (req, res, next: NextFunction) => {
    handler(req, res).catch(next);
  };

/**
 * §9: CSV downloads are UTF-8 with a BOM so Excel opens them correctly.
 */
export function sendCsv(res: Response, filename: string, body: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(CSV_BOM + body);
}

export const noStore = (res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
};
