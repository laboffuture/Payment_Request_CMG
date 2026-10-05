import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_BOQ_FILES, MSG } from '@cm/shared';
import { buildApp, resetDb, signIn, startDb, stopDb } from './harness.js';
import { seed } from '../seed/seed.js';
import { Mr, Notification } from '../models/index.js';

/**
 * The two-step approval the site engineer sees from the other end:
 *
 *   the MR is raised with a quantity, a measurement and a unit per line,
 *   and optionally a bill of quantities
 *   → the Project Manager may change all three, send it back, or reject it
 *   → QS may do the same again before splitting it
 *   → whatever either of them does is visible to the site engineer, and a QS
 *     rejection reaches the Project Manager too.
 */
let app: Express;
let site: Awaited<ReturnType<typeof signIn>>;
let pm: Awaited<ReturnType<typeof signIn>>;
let qs: Awaited<ReturnType<typeof signIn>>;

/** A one-page PDF, enough for the magic-byte check. */
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);

beforeAll(async () => {
  await startDb();
  app = await buildApp();
  await resetDb();
  await seed();

  site = await signIn(app, 'site1', 'demo123');
  pm = await signIn(app, 'pm1', 'demo123');
  qs = await signIn(app, 'qs', 'demo123');
}, 180_000);

afterAll(stopDb);

/** Raises a fresh MR for one master item and returns its id. */
async function raiseMr(submit = true): Promise<string> {
  const reference = await site.get('/api/reference');
  const project = reference.body.projects.find(
    (p: { code: string }) => p.code === 'PRJ-0114',
  );
  const items = await site.get('/api/items?limit=200');
  const item = items.body[0];

  const res = await site.post('/api/mrs').send({
    projectId: project.id,
    requiredDate: '2026-12-31',
    submit,
    lines: [
      {
        itemId: item.id,
        qty: 25,
        description: 'Threaded rod for the grid B hangers',
        measurement: '12 mm dia',
        unit: 'Nos',
        remarks: 'Grid B',
      },
    ],
  });

  expect(res.status).toBe(201);
  return res.body.id as string;
}

const firstLine = async (
  agent: Awaited<ReturnType<typeof signIn>>,
  mrId: string,
): Promise<any> => (await agent.get(`/api/mrs/${mrId}`)).body.lines[0];

describe('the item description is compulsory', () => {
  /** The same MR, but with whatever description the caller wants. */
  const raiseWith = async (description: string | undefined, submit = true) => {
    const reference = await site.get('/api/reference');
    const project = reference.body.projects.find(
      (p: { code: string }) => p.code === 'PRJ-0114',
    );
    const items = await site.get('/api/items?limit=200');

    return site.post('/api/mrs').send({
      projectId: project.id,
      requiredDate: '2026-12-31',
      submit,
      lines: [{ itemId: items.body[0].id, qty: 4, description }],
    });
  };

  it('refuses a submit with no description at all', async () => {
    const res = await raiseWith(undefined);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.mrDescriptionRequired);
  });

  it('refuses a description that is only spaces', async () => {
    const res = await raiseWith('   ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.mrDescriptionRequired);
  });

  it('still lets a draft be saved while the engineer is thinking', async () => {
    const res = await raiseWith(undefined, false);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
  });

  it('will not let that draft be submitted until it is described', async () => {
    const draft = await raiseWith(undefined, false);
    const seen = await site.get(`/api/mrs/${draft.body.id}`);

    const send = (description: string) =>
      site.put(`/api/mrs/${draft.body.id}`).send({
        projectId: seen.body.projectId,
        requiredDate: seen.body.requiredDate,
        submit: true,
        lines: [
          { id: seen.body.lines[0].id, itemId: seen.body.lines[0].itemId, qty: 4, description },
        ],
      });

    expect((await send('')).status).toBe(400);

    const ok = await send('Cement for the lift-lobby screed');
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('PM_PENDING');
  });

  it('carries the description through to the approvers', async () => {
    const created = await raiseWith('Cement for the lift-lobby screed');
    expect(created.status).toBe(201);

    for (const who of [site, pm]) {
      const seen = await who.get(`/api/mrs/${created.body.id}`);
      expect(seen.body.lines[0].description).toBe('Cement for the lift-lobby screed');
    }
  });
});

describe('the Project Manager step', () => {
  it('sends a submitted MR to the PM, not to QS', async () => {
    const mrId = await raiseMr();

    const queue = await pm.get('/api/mrs?queue=pm');
    expect(queue.body.rows.some((m: { id: string }) => m.id === mrId)).toBe(true);

    const qsQueue = await qs.get('/api/mrs?queue=qs');
    expect(qsQueue.body.rows.some((m: { id: string }) => m.id === mrId)).toBe(false);
  });

  it('keeps the measurement and the unit the site engineer entered', async () => {
    const mrId = await raiseMr();
    const line = await firstLine(pm, mrId);

    expect(line.measurement).toBe('12 mm dia');
    expect(line.unit).toBe('Nos');
    expect(line.requestedQty).toBe(25);
    expect(line.changed).toBe(false);
  });

  it('refuses a PM approval that drops every line', async () => {
    const mrId = await raiseMr();
    const line = await firstLine(pm, mrId);

    const res = await pm.post(`/api/mrs/${mrId}/pm-approve`).send({
      lines: [{ id: line.id, qty: line.qty, rejected: true }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.pmNothingApproved);
  });

  it('shows the site engineer a PM rejection and the reason', async () => {
    const mrId = await raiseMr();

    const res = await pm.post(`/api/mrs/${mrId}/pm-reject`).send({
      comment: 'Already ordered against MR-0114-01-0001',
    });
    expect(res.status).toBe(200);

    const seen = await site.get(`/api/mrs/${mrId}`);
    expect(seen.body.status).toBe('REJECTED');
    expect(seen.body.lastComment).toContain('Already ordered');
    expect(seen.body.lastCommentRole).toBe('PM');
    expect(seen.body.lastCommentByName).toBe('Project Manager 1');

    const inbox = await site.get('/api/notifications');
    expect(inbox.body.some((n: { event: string }) => n.event === 'MR_PM_REJECTED')).toBe(
      true,
    );
  });

  it('sends it back for the site engineer to correct and resubmit', async () => {
    const mrId = await raiseMr();

    await pm.post(`/api/mrs/${mrId}/pm-send-back`).send({ comment: 'Split by floor' });

    const seen = await site.get(`/api/mrs/${mrId}`);
    expect(seen.body.status).toBe('SENT_BACK');
    // Sent back means editable again, and it returns to the PM on resubmit.
    expect(seen.body.canEdit).toBe(true);

    const again = await site.put(`/api/mrs/${mrId}`).send({
      projectId: seen.body.projectId,
      requiredDate: seen.body.requiredDate,
      submit: true,
      lines: [
        {
          id: seen.body.lines[0].id,
          itemId: seen.body.lines[0].itemId,
          qty: 12,
          description: 'Threaded rod for the grid B hangers',
        },
      ],
    });
    expect(again.status).toBe(200);
    expect((await Mr.findById(mrId).lean())?.status).toBe('PM_PENDING');
  });

  it('lets only the PM act while the MR is with the PM', async () => {
    const mrId = await raiseMr();
    const line = await firstLine(pm, mrId);

    const bySite = await site.post(`/api/mrs/${mrId}/pm-approve`).send({
      lines: [{ id: line.id, qty: line.qty }],
    });
    expect(bySite.status).toBe(403);

    const byQs = await qs.post(`/api/mrs/${mrId}/pm-approve`).send({
      lines: [{ id: line.id, qty: line.qty }],
    });
    expect(byQs.status).toBe(403);
  });
});

describe('a QS rejection reaches the PM as well', () => {
  it('tells the requester and the Project Manager who approved it', async () => {
    const mrId = await raiseMr();
    const line = await firstLine(pm, mrId);

    await pm.post(`/api/mrs/${mrId}/pm-approve`).send({
      lines: [{ id: line.id, qty: 20, measurement: '10 mm dia', unit: 'Nos' }],
      comment: 'Trimmed to the drawing',
    });

    const rejected = await qs.post(`/api/mrs/${mrId}/reject`).send({
      comment: 'Not in this BOQ',
    });
    expect(rejected.status).toBe(200);

    // Both the site engineer and the PM are notified.
    const notes = await Notification.find({ event: 'MR_REJECTED' }).lean();
    const named = await Promise.all(
      notes.map(async (n) => String(n.userId)),
    );
    expect(named.length).toBeGreaterThanOrEqual(2);

    const asPm = await pm.get('/api/notifications');
    expect(asPm.body.some((n: { event: string }) => n.event === 'MR_REJECTED')).toBe(true);

    const asSite = await site.get('/api/notifications');
    expect(asSite.body.some((n: { event: string }) => n.event === 'MR_REJECTED')).toBe(
      true,
    );
  });

  it('shows the site engineer what QS changed before approving', async () => {
    const mrId = await raiseMr();
    const pmLine = await firstLine(pm, mrId);

    await pm.post(`/api/mrs/${mrId}/pm-approve`).send({
      lines: [{ id: pmLine.id, qty: 25, measurement: '12 mm dia', unit: 'Nos' }],
    });

    const qsLine = await firstLine(qs, mrId);
    const res = await qs.post(`/api/mrs/${mrId}/qs-approve`).send({
      comment: 'Half from store',
      lines: [
        {
          id: qsLine.id,
          qty: 18,
          measurement: '12 mm dia, cut to 3 m',
          unit: 'Nos',
          storeQty: 0,
          poQty: 18,
          qsRemark: 'Rest not needed this month',
        },
      ],
    });
    expect(res.status).toBe(200);

    const seen = await firstLine(site, mrId);
    expect(seen.qty).toBe(18);
    expect(seen.requestedQty).toBe(25);
    expect(seen.measurement).toBe('12 mm dia, cut to 3 m');
    expect(seen.changed).toBe(true);
  });
});

describe('the optional bill of quantities', () => {
  it('raises an MR perfectly well without one', async () => {
    const mrId = await raiseMr();
    const seen = await site.get(`/api/mrs/${mrId}`);

    expect(seen.body.boqFileCount).toBe(0);
    expect(seen.body.boqFiles).toEqual([]);
  });

  it('takes several sheets at once and shows them to the PM and to QS', async () => {
    const mrId = await raiseMr(false);

    const up = await site
      .post(`/api/mrs/${mrId}/boq`)
      .attach('files', pdf, { filename: 'level-2.pdf', contentType: 'application/pdf' })
      .attach('files', pdf, { filename: 'level-3.pdf', contentType: 'application/pdf' });

    expect(up.status).toBe(200);
    expect(up.body.map((f: { name: string }) => f.name)).toEqual([
      'level-2.pdf',
      'level-3.pdf',
    ]);

    // Submit it so both approvers can reach them.
    const draft = await site.get(`/api/mrs/${mrId}`);
    await site.put(`/api/mrs/${mrId}`).send({
      projectId: draft.body.projectId,
      requiredDate: draft.body.requiredDate,
      submit: true,
      lines: [
        {
          id: draft.body.lines[0].id,
          itemId: draft.body.lines[0].itemId,
          qty: 25,
          description: 'Threaded rod for the grid B hangers',
        },
      ],
    });

    for (const who of [site, pm, qs]) {
      const seen = await who.get(`/api/mrs/${mrId}`);
      expect(seen.body.boqFileCount).toBe(2);
      expect(seen.body.boqFiles).toHaveLength(2);
      for (const file of seen.body.boqFiles) {
        expect(file.url).toBeTruthy();
        expect(file.size).toBeGreaterThan(0);
      }

      const links = await who.get(`/api/mrs/${mrId}/boq`);
      expect(links.status).toBe(200);
      expect(links.body).toHaveLength(2);
    }
  });

  it('adds later sheets to the ones already there', async () => {
    const mrId = await raiseMr(false);

    await site
      .post(`/api/mrs/${mrId}/boq`)
      .attach('files', pdf, { filename: 'first.pdf', contentType: 'application/pdf' })
      .expect(200);

    const second = await site
      .post(`/api/mrs/${mrId}/boq`)
      .attach('files', pdf, { filename: 'second.pdf', contentType: 'application/pdf' });

    expect(second.status).toBe(200);
    expect(second.body.map((f: { name: string }) => f.name)).toEqual([
      'first.pdf',
      'second.pdf',
    ]);
  });

  it('removes one file and leaves the rest alone', async () => {
    const mrId = await raiseMr(false);

    const up = await site
      .post(`/api/mrs/${mrId}/boq`)
      .attach('files', pdf, { filename: 'keep.pdf', contentType: 'application/pdf' })
      .attach('files', pdf, { filename: 'drop.pdf', contentType: 'application/pdf' });

    const drop = up.body.find((f: { name: string }) => f.name === 'drop.pdf')!;
    const res = await site.delete(`/api/mrs/${mrId}/boq/${encodeURIComponent(drop.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.map((f: { name: string }) => f.name)).toEqual(['keep.pdf']);

    const seen = await site.get(`/api/mrs/${mrId}`);
    expect(seen.body.boqFileCount).toBe(1);
  });

  it('refuses more files than the limit allows', async () => {
    const mrId = await raiseMr(false);

    let req = site.post(`/api/mrs/${mrId}/boq`);
    for (let i = 0; i <= MAX_BOQ_FILES; i += 1) {
      req = req.attach('files', pdf, {
        filename: `sheet-${i}.pdf`,
        contentType: 'application/pdf',
      });
    }

    const res = await req;
    expect(res.status).toBe(400);
  });

  it('refuses a file that is not a document, whatever it is called', async () => {
    const mrId = await raiseMr(false);

    const res = await site
      .post(`/api/mrs/${mrId}/boq`)
      .attach('files', Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00]), {
        filename: 'boq.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.boqWrongType);
  });

  it('will not let the site engineer attach one after it has gone to the PM', async () => {
    const mrId = await raiseMr();

    const res = await site
      .post(`/api/mrs/${mrId}/boq`)
      .attach('files', pdf, { filename: 'late.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.mrEditNotAllowed);
  });
});
