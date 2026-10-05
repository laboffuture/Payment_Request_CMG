/**
 * §10 — the "Chandramari Payment app" adapter.
 *
 * We do not have the Payment app's API details yet, so the default
 * implementation is a stub that returns empty arrays. A repeatable BullMQ job
 * (every 15 minutes) calls `syncExternalMasters()` below, which upserts vendors
 * and projects with `source: "PAYMENT_APP"` and their `externalId`.
 *
 * Records that came from the Payment app are read-only in our UI, and we never
 * write back to it.
 */

import { env } from '../env.js';
import { logger } from '../logger.js';
import { Project, Vendor } from '../models/masters.js';
import { bumpSyncStamp } from '../lib/sync.js';

export interface ExtVendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  taxNo?: string;
  address?: string;
}

export interface ExtProject {
  id: string;
  code: string;
  name: string;
  active?: boolean;
}

export interface ExtUser {
  id: string;
  name: string;
  email?: string;
}

export interface ExternalMasters {
  listVendors(): Promise<ExtVendor[]>;
  listProjects(): Promise<ExtProject[]>;
  listUsers(): Promise<ExtUser[]>;
}

/** Used until the Payment app's details arrive. */
export class StubExternalMasters implements ExternalMasters {
  async listVendors(): Promise<ExtVendor[]> {
    return [];
  }
  async listProjects(): Promise<ExtProject[]> {
    return [];
  }
  async listUsers(): Promise<ExtUser[]> {
    return [];
  }
}

/**
 * The Payment app, reached server to server with the shared INTEGRATION_TOKEN
 * (PAYMENT_APP_TOKEN here). It publishes its staff list for the "Import from
 * Payment app" screen. It has no project register and its vendors are payees,
 * not Material suppliers, so those two stay local and return nothing.
 */
export class HttpExternalMasters implements ExternalMasters {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async get<T>(path: string): Promise<T[]> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Payment app ${path} returned ${res.status}`);
    return (await res.json()) as T[];
  }

  listVendors = async (): Promise<ExtVendor[]> => [];

  /**
   * The Payment app's job register: JB code, project and site. One project per
   * code; the site goes into the name because a project such as JUNIOR KUPPANNA
   * runs at more than one site and the name dropdown must tell them apart.
   */
  listProjects = async (): Promise<ExtProject[]> =>
    (
      await this.get<{ id: string; code: string; project: string; location: string; active: boolean }>(
        '/api/integration/projects',
      )
    ).map((j) => ({
      id: j.id,
      code: j.code,
      name: j.location ? `${j.project} — ${j.location}` : j.project,
      active: j.active,
    }));
  listUsers = () => this.get<ExtUser>('/api/integration/users');
}

let instance: ExternalMasters | null = null;

export function externalMasters(): ExternalMasters {
  if (instance) return instance;
  instance =
    env.PAYMENT_APP_BASE_URL && env.PAYMENT_APP_TOKEN
      ? new HttpExternalMasters(env.PAYMENT_APP_BASE_URL, env.PAYMENT_APP_TOKEN)
      : new StubExternalMasters();
  return instance;
}

/** Test seam. */
export const setExternalMasters = (impl: ExternalMasters | null): void => {
  instance = impl;
};

export interface SyncResult {
  vendors: number;
  projects: number;
}

/**
 * Upsert vendors and projects from the Payment app. Local records (source
 * LOCAL) are never touched, and nothing is ever deleted — a supplier that
 * disappears upstream still has POs here.
 */
export async function syncExternalMasters(): Promise<SyncResult> {
  const api = externalMasters();
  const [vendors, projects] = await Promise.all([
    api.listVendors(),
    api.listProjects(),
  ]);

  let vendorCount = 0;
  for (const v of vendors) {
    const res = await Vendor.updateOne(
      { source: 'PAYMENT_APP', externalId: v.id },
      {
        $set: {
          name: v.name,
          email: v.email ?? '',
          phone: v.phone ?? '',
          taxNo: v.taxNo ?? '',
          address: v.address ?? '',
          source: 'PAYMENT_APP',
          externalId: v.id,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount || res.modifiedCount) vendorCount += 1;
  }

  let projectCount = 0;
  for (const p of projects) {
    // Already here by its external id, or entered by hand under the same code.
    const known =
      (await Project.findOne({ source: 'PAYMENT_APP', externalId: p.id }).select('_id').lean()) ??
      (await Project.findOne({ code: p.code })
        .collation({ locale: 'en', strength: 2 })
        .select('_id')
        .lean());
    const res = await Project.updateOne(
      known ? { _id: known._id } : { source: 'PAYMENT_APP', externalId: p.id },
      {
        $set: {
          code: p.code,
          name: p.name,
          active: p.active ?? true,
          source: 'PAYMENT_APP',
          externalId: p.id,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount || res.modifiedCount) projectCount += 1;
  }

  if (vendorCount || projectCount) await bumpSyncStamp();
  logger.info({ vendorCount, projectCount }, 'payment app masters synced');
  return { vendors: vendorCount, projects: projectCount };
}
