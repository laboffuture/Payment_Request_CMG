'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isBuyer, type VendorDocDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader, Tabs } from '@mm/components/ui';
import { DocsTable } from '@mm/features/docs/DocsTable';
import { useSession } from '@mm/lib/session';

/** Prototype: VIEWS.docs — to check / verified / rejected / all. */
const TABS = [
  { value: 'SUBMITTED', label: 'To check' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
] as const;

export default function DocsPage() {
  const { me } = useSession();
  const [status, setStatus] = useState<string>('SUBMITTED');

  const list = useQuery({
    queryKey: ['docs', status],
    queryFn: () => get<VendorDocDto[]>(`/docs?status=${status}`),
  });

  return (
    <>
      <PageHeader
        title="Invoices & delivery orders"
        subtitle="Uploaded by vendors on the portal. Check against the PO and GRN value."
      />
      <Tabs tabs={TABS} active={status} onChange={setStatus} />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DocsTable rows={list.data ?? []} canCheck={isBuyer(me.role)} />
      )}
    </>
  );
}
