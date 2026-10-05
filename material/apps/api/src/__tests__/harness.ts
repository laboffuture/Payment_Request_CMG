import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { connectDb, disconnectDb, mongoose } from '../db.js';

/**
 * A real Mongo (in memory, as a replica set) and a real Express app, so the
 * tests exercise the same transactions, indexes and middleware as production.
 *
 * Redis-backed pieces — rate limiting and idempotency — degrade gracefully when
 * Redis is absent, and the limiters are effectively disabled under NODE_ENV=test.
 */
let replSet: MongoMemoryReplSet | null = null;

export async function startDb(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDb(replSet.getUri('cm_test'));
}

export async function stopDb(): Promise<void> {
  await disconnectDb();
  await replSet?.stop();
  replSet = null;
}

export async function resetDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function buildApp(): Promise<Express> {
  const { createApp } = await import('../app.js');
  return createApp();
}

export interface Agent {
  agent: ReturnType<typeof request.agent>;
}

/** Signs in and returns a supertest agent that keeps the auth cookies. */
export async function signIn(
  app: Express,
  login: string,
  password: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ login, password });
  if (res.status !== 200) {
    throw new Error(`sign-in failed for ${login}: ${res.status} ${res.text}`);
  }
  return agent;
}
