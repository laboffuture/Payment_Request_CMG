'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EMAIL_ST, type MailHealthDto, type OutboxRowDto } from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, Chip, Grid, PageHeader, Stack } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';
import { useSession } from '@mm/lib/session';
import { fmtDateTime } from '@mm/lib/format';

/**
 * Prototype: VIEWS.outbox (second definition) — status chip, how to switch
 * email on, a test send, "send queued now", "retry failed", and the outbox.
 */
export default function EmailSettingsPage() {
  const toast = useToast();
  const { me } = useSession();
  const queryClient = useQueryClient();
  const [openRow, setOpenRow] = useState<OutboxRowDto | null>(null);
  const [testTo, setTestTo] = useState(me.email);

  const health = useQuery({
    queryKey: ['admin', 'mail', 'health'],
    queryFn: () => get<MailHealthDto>('/admin/mail/health'),
  });

  const outbox = useQuery({
    queryKey: ['admin', 'mail', 'outbox'],
    queryFn: () => get<OutboxRowDto[]>('/admin/mail/outbox'),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'mail'] });
  };

  const sendTest = useMutation({
    mutationFn: () => post('/admin/mail/test', { to: testTo }),
    onSuccess: () => {
      toast('Test email queued — check the inbox in a moment');
      refresh();
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not queue the test'),
  });

  const sendNow = useMutation({
    mutationFn: () => post<{ queued: number }>('/admin/mail/send-now'),
    onSuccess: (res) => {
      toast(`Sending ${res.queued} queued email(s)`);
      refresh();
    },
  });

  const retry = useMutation({
    mutationFn: () => post<{ retried: number }>('/admin/mail/retry-failed'),
    onSuccess: (res) => {
      toast(`${res.retried} failed email(s) queued again`);
      refresh();
    },
  });

  const status = health.data;
  const chip = !status
    ? { label: 'Checking…', tone: 'gry' as const }
    : status.ready
      ? { label: `Email ON · ${status.provider}`, tone: 'grn' as const }
      : { label: 'Email not set up yet', tone: 'amb' as const };

  const columns: Column<OutboxRowDto>[] = [
    { key: 'when', header: 'When', render: (r) => fmtDateTime(r.createdAt) },
    {
      key: 'to',
      header: 'To',
      render: (r) => (r.to.length ? r.to.join(', ') : '(no email on file)'),
    },
    { key: 'subject', header: 'Subject', render: (r) => r.subject },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span>
          <Chip spec={EMAIL_ST[r.status]} />
          {r.error ? <div className="text-mut text-xs">{r.error}</div> : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Email settings"
        subtitle="Every status change creates an email for the right people (choose which under Notification settings)."
        actions={<Chip spec={chip} />}
      />

      <Grid className="!grid-cols-1 desk:!grid-cols-2">
        <Card>
          <Stack>
            <b>Switch email on</b>
            <div className="text-mut text-sm">
              1. Create an account with <b>Brevo</b> (300 emails/day free) or{' '}
              <b>Resend</b> (3,000/month free), verify your company domain there and
              copy the API key.
            </div>
            <div className="text-mut text-sm">
              2. Put it in <span className="font-mono">.env</span> as{' '}
              <span className="font-mono">MAIL_API_KEY</span>, set{' '}
              <span className="font-mono">MAIL_PROVIDER</span> to{' '}
              <span className="font-mono">brevo</span> or{' '}
              <span className="font-mono">resend</span> and{' '}
              <span className="font-mono">MAIL_FROM</span> to your sending address.
            </div>
            <div className="text-mut text-sm">
              3. Restart the worker:{' '}
              <span className="font-mono">docker compose up -d --build worker</span>.
            </div>
            {status && !status.ready && status.error ? (
              <div className="warn">{status.error}</div>
            ) : null}
            <div className="text-mut text-sm">
              Sending from: <span className="font-mono">{status?.from ?? '—'}</span>
            </div>
          </Stack>
        </Card>

        <Card>
          <Stack>
            <b>Send a test email</b>
            <label className="field">
              To
              <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-[10px]">
              <Btn variant="primary" disabled={sendTest.isPending} onClick={() => sendTest.mutate()}>
                Send test
              </Btn>
              <Btn disabled={!status?.queued} onClick={() => sendNow.mutate()}>
                Send queued now ({status?.queued ?? 0})
              </Btn>
              <Btn disabled={!status?.failed} onClick={() => retry.mutate()}>
                Retry failed ({status?.failed ?? 0})
              </Btn>
            </div>
            <div className="text-mut text-sm">
              Queued emails also go out on their own — the worker picks them up as
              they are created. Each person can switch their own alerts off in their
              profile.
            </div>
          </Stack>
        </Card>
      </Grid>

      <h2>Outbox</h2>
      {outbox.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={outbox.data ?? []}
          rowKey={(r) => r.id}
          onRowClick={setOpenRow}
          emptyText="No emails yet"
        />
      )}

      {openRow ? (
        <Modal title="Email" onClose={() => setOpenRow(null)}>
          <div className="text-mut text-sm">
            To: {openRow.to.join(', ') || '(no email on file)'}
          </div>
          <b>{openRow.subject}</b>
          <div className="card whitespace-pre-line">{openRow.body}</div>
          {openRow.error ? <div className="errb">{openRow.error}</div> : null}
        </Modal>
      ) : null}
    </>
  );
}
