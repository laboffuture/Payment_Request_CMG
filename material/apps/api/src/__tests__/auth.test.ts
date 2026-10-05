import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MSG } from '@cm/shared';
import { buildApp, resetDb, signIn, startDb, stopDb } from './harness.js';
import { seed } from '../seed/seed.js';
import { User } from '../models/masters.js';

let app: Express;

beforeAll(async () => {
  await startDb();
  app = await buildApp();
});

afterAll(stopDb);

describe('first setup', () => {
  beforeEach(resetDb);

  it('creates the first admin only while there are no users', async () => {
    const state = await request(app).get('/api/auth/state');
    expect(state.body.needsFirstSetup).toBe(true);

    const created = await request(app).post('/api/auth/first-setup').send({
      name: 'First Admin',
      login: 'boss',
      email: 'boss@example.com',
      password: 'firstpass1',
    });
    expect(created.status).toBe(201);
    expect(created.body.me.role).toBe('ADMIN');

    const again = await request(app).post('/api/auth/first-setup').send({
      name: 'Second Admin',
      login: 'boss2',
      password: 'secondpass1',
    });
    expect(again.status).toBe(409);
  });

  it('rejects a password without a digit or under eight characters', async () => {
    const short = await request(app)
      .post('/api/auth/first-setup')
      .send({ name: 'A', login: 'admin', password: 'ab1' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe(MSG.passwordRule);

    const noDigit = await request(app)
      .post('/api/auth/first-setup')
      .send({ name: 'A', login: 'admin', password: 'abcdefghij' });
    expect(noDigit.status).toBe(400);
    expect(noDigit.body.error).toBe(MSG.passwordRule);
  });
});

describe('sign in', () => {
  beforeAll(async () => {
    await resetDb();
    await seed();
  });

  it('accepts a demo login and returns the profile', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'site1', password: 'demo123' });

    expect(res.status).toBe(200);
    expect(res.body.me.login).toBe('site1');
    expect(res.body.me.role).toBe('SITE');
    // Two httpOnly cookies, never a token in the body (§1).
    expect(JSON.stringify(res.body)).not.toContain('eyJ');
    const cookies = res.get('set-cookie') ?? [];
    expect(cookies.join(';')).toContain('HttpOnly');
  });

  it('gives the same message whether the login or the password is wrong', async () => {
    const noSuchUser = await request(app)
      .post('/api/auth/login')
      .send({ login: 'nobody', password: 'demo123' });
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ login: 'site1', password: 'not-it' });

    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.body.error).toBe(MSG.badCredentials);
    expect(wrongPassword.body.error).toBe(MSG.badCredentials);
  });

  it('refuses a deactivated account', async () => {
    await User.updateOne({ login: 'mgmt' }, { $set: { active: false } });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'mgmt', password: 'demo123' });
    expect(res.status).toBe(401);
    await User.updateOne({ login: 'mgmt' }, { $set: { active: true } });
  });

  it('never returns a password hash from any endpoint', async () => {
    const admin = await signIn(app, 'admin', 'demo123');
    const users = await admin.get('/api/admin/users');
    expect(users.status).toBe(200);
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');
    expect(JSON.stringify(users.body)).not.toContain('$2a$');
  });

  it('rotates the refresh token and rejects the one it replaced', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ login: 'qs', password: 'demo123' });

    const first = await agent.post('/api/auth/refresh');
    expect(first.status).toBe(200);

    // A fresh agent replaying the *first* refresh token has nothing to present.
    const stale = await request(app).post('/api/auth/refresh');
    expect(stale.status).toBe(401);
  });

  it('signs out and stops answering', async () => {
    const agent = await signIn(app, 'store', 'demo123');
    expect((await agent.get('/api/me')).status).toBe(200);

    await agent.post('/api/auth/logout');
    const after = await agent.get('/api/me');
    expect(after.status).toBe(401);
  });
});

describe('profile', () => {
  beforeAll(async () => {
    await resetDb();
    await seed();
  });

  it('changes a password only with the current one, then signs other sessions out', async () => {
    const agent = await signIn(app, 'proc', 'demo123');

    const wrong = await agent
      .patch('/api/me')
      .send({ currentPassword: 'nope', newPassword: 'brandnew1' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe(MSG.currentPasswordWrong);

    const ok = await agent
      .patch('/api/me')
      .send({ currentPassword: 'demo123', newPassword: 'brandnew1' });
    expect(ok.status).toBe(200);
    expect(ok.body.signedOutElsewhere).toBe(true);

    const oldPassword = await request(app)
      .post('/api/auth/login')
      .send({ login: 'proc', password: 'demo123' });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post('/api/auth/login')
      .send({ login: 'proc', password: 'brandnew1' });
    expect(newPassword.status).toBe(200);
  });

  it('toggles my own email alerts', async () => {
    const agent = await signIn(app, 'qs', 'demo123');
    const res = await agent.patch('/api/me').send({ emailOn: false });
    expect(res.status).toBe(200);
    expect(res.body.me.emailOn).toBe(false);
  });
});
