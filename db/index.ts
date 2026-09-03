import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let cached: Partial<Env> | null = null;

/**
 * Resolves the Worker bindings without importing `cloudflare:workers` at module
 * scope. Outside the Workers runtime that import fails, and callers now get an
 * empty binding set instead of an unhandled crash during module evaluation.
 */
export async function getBindings(): Promise<Partial<Env>> {
  if (cached) return cached;
  try {
    const mod = await import("./bindings");
    cached = mod.env as Partial<Env>;
  } catch {
    cached = {};
  }
  return cached;
}

export async function getDb() {
  const env = await getBindings();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
