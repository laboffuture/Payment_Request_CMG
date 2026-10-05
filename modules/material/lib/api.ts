'use client';

/**
 * The fetch wrapper.
 * Prototype origin: api(path, opts) — which retried dropped connections.
 *
 * §9: retries network errors, 5xx and 429 up to three times with jittered
 * backoff. A 401 is left to the application shell, which owns the sign-in.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Material's API sits behind the gateway at /material/api, on the same origin. */
const BASE = '/material/api';

/**
 * The material role in use, chosen with the role selector in the header. Sent on
 * every call; the API honours it only if the signed-in login holds that role.
 */
let activeRole = '';
export const setActiveMaterialRole = (role: string): void => {
  activeRole = role;
};

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** send a FormData body (file uploads) instead of JSON */
  form?: FormData;
  /** §9: makes a retry safe — the server replays the first response */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, form, idempotencyKey, signal } = options;

  for (let attempt = 0; ; attempt += 1) {
    let res: Response | null = null;
    let payload: unknown = null;

    try {
      res = await fetch(BASE + path, {
        method,
        credentials: 'same-origin',
        signal,
        headers: {
          ...(form ? {} : { 'Content-Type': 'application/json' }),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...(activeRole ? { 'x-cm-role': activeRole } : {}),
        },
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
      payload = await res.json().catch(() => null);
    } catch {
      res = null;
    }

    // The one sign-in belongs to the application shell, which watches for a
    // lost session on every call and puts its own sign-in screen up.
    if (res?.status === 401) {
      throw new ApiError('Your session has expired — please sign in again', 401);
    }

    const transient =
      !res || res.status >= 500 || (res.status === 429 && path !== '/auth/login');

    if (transient && attempt < 3) {
      await sleep(400 * (attempt + 1) + Math.random() * 400);
      continue;
    }

    if (!res) {
      throw new ApiError('No connection — check your network', 0);
    }

    if (!res.ok) {
      const err = payload as { error?: string; code?: string; details?: unknown };
      throw new ApiError(
        err?.error ?? `HTTP ${res.status}`,
        res.status,
        err?.code,
        err?.details,
      );
    }

    return (payload ?? {}) as T;
  }
}

export const get = <T>(path: string, signal?: AbortSignal) =>
  api<T>(path, { signal });

export const post = <T>(path: string, body?: unknown, idempotencyKey?: string) =>
  api<T>(path, { method: 'POST', body, idempotencyKey });

export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body });

export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body });

export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export const upload = <T>(path: string, form: FormData) =>
  api<T>(path, { method: 'POST', form });

/** A key that makes one submit idempotent however many times it is retried. */
export const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Triggers a file download from an authenticated endpoint. */
export function downloadFile(path: string): void {
  // A plain navigation cannot carry the header, so the role rides in the query.
  const sep = path.includes('?') ? '&' : '?';
  window.location.href = BASE + path + (activeRole ? `${sep}_role=${encodeURIComponent(activeRole)}` : '');
}
