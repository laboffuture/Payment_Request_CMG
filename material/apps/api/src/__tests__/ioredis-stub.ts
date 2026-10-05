/**
 * Stands in for `ioredis` during tests (wired up by the alias in
 * vitest.config.ts).
 *
 * `ioredis-mock` only has a default export, while the API imports the class by
 * name — this re-exports it both ways so the production code needs no test
 * branch.
 */
import RedisMock from 'ioredis-mock';

export const Redis = RedisMock;
export default RedisMock;
