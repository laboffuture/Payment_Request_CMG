import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

/**
 * A tiny in-process stand-in for Redis, used only when `REDIS_URL` is empty.
 *
 * Why it exists: Redis has no native Windows build, so a developer without
 * Docker could not start the API at all. This keeps `pnpm dev` working on a
 * laptop. It implements exactly the commands this codebase uses — nothing more
 * — and `env.ts` refuses to start production without a real `REDIS_URL`.
 *
 * What you give up by using it: nothing is shared between processes, so rate
 * limits and idempotency keys are per-container, the report cache is not
 * shared, and BullMQ is off (see `redisEnabled`). All fine for one developer on
 * one machine; never acceptable in production.
 */
interface Entry {
  value: string;
  expiresAt: number | null;
}

export class MemoryRedis extends EventEmitter {
  private store = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  /**
   * Supports the two forms the app uses:
   *   set(key, value, 'EX', seconds)
   *   set(key, value, 'EX', seconds, 'NX')   -> null when the key exists
   */
  async set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<'OK' | null> {
    let expiresAt: number | null = null;
    let onlyIfAbsent = false;

    for (let i = 0; i < args.length; i += 1) {
      const flag = String(args[i]).toUpperCase();
      if (flag === 'EX') {
        expiresAt = Date.now() + Number(args[i + 1]) * 1000;
        i += 1;
      } else if (flag === 'NX') {
        onlyIfAbsent = true;
      }
    }

    if (onlyIfAbsent && this.live(key)) return null;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed += 1;
    return removed;
  }

  /** Only the `match` option is honoured — it is all `dropCache` needs. */
  scanStream(options: { match?: string; count?: number } = {}): Readable {
    const pattern = options.match ?? '*';
    const regex = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    );
    const keys = [...this.store.keys()].filter((k) => regex.test(k));
    return Readable.from(keys.length ? [keys] : [], { objectMode: true });
  }

  async call(): Promise<never> {
    throw new Error('Redis is not configured — set REDIS_URL');
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
}
