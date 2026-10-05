'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotifyRuleDto } from '@cm/shared';
import { get, patch } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { PageHeader } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';

/**
 * Prototype: VIEWS.notifyrules.
 * Vendors only get email for the events that allow it (RFQ sent, PO approved);
 * everything else shows a dash in that column.
 */
export default function NotificationRulesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const rules = useQuery({
    queryKey: ['admin', 'notify-rules'],
    queryFn: () => get<NotifyRuleDto[]>('/admin/notify-rules'),
  });

  const update = useMutation({
    mutationFn: (vars: { event: string; patch: Record<string, boolean> }) =>
      patch<NotifyRuleDto[]>(`/admin/notify-rules/${vars.event}`, vars.patch),
    onSuccess: (next) => {
      queryClient.setQueryData(['admin', 'notify-rules'], next);
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not save'),
  });

  const toggle = (row: NotifyRuleDto, key: 'portal' | 'email' | 'vendorEmail') =>
    update.mutate({ event: row.event, patch: { [key]: !row[key] } });

  const columns: Column<NotifyRuleDto>[] = [
    { key: 'label', header: 'Status change', render: (r) => <b>{r.label}</b> },
    { key: 'goesTo', header: 'Goes to', render: (r) => r.goesTo },
    {
      key: 'portal',
      header: 'Portal',
      render: (r) => (
        <input
          type="checkbox"
          aria-label={`Portal alert for ${r.label}`}
          checked={r.portal}
          onChange={() => toggle(r, 'portal')}
        />
      ),
    },
    {
      key: 'email',
      header: 'Email (staff)',
      render: (r) => (
        <input
          type="checkbox"
          aria-label={`Staff email for ${r.label}`}
          checked={r.email}
          onChange={() => toggle(r, 'email')}
        />
      ),
    },
    {
      key: 'vendorEmail',
      header: 'Email (vendor)',
      render: (r) =>
        r.vendorEmailAllowed ? (
          <input
            type="checkbox"
            aria-label={`Vendor email for ${r.label}`}
            checked={r.vendorEmail}
            onChange={() => toggle(r, 'vendorEmail')}
          />
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Notification settings"
        subtitle="Choose which status changes send a portal alert and an email. Vendors only get email for the events ticked in the vendor column. Each user can also switch their own email alerts off."
      />

      {rules.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={rules.data ?? []}
          rowKey={(r) => r.event}
          emptyText="No events"
        />
      )}
    </>
  );
}
