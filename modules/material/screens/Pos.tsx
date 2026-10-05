'use client';

import { useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import { PO_LIST_TABS, PO_ST, isBuyer, type PoDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { Btn, PageHeader, Tabs } from '@mm/components/ui';
import { PoTable } from '@mm/features/po/PoTable';
import { useSession } from '@mm/lib/session';

/** Prototype: VIEWS.pos — the register with its status tabs. */
export default function PosPage() {
  const { me } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<string>('');

  const list = useQuery({
    queryKey: ['pos', status],
    queryFn: () => get<{ rows: PoDto[] }>(`/pos${status ? `?status=${status}` : ''}`),
  });

  const tabs = PO_LIST_TABS.map((value) => ({
    value: value as string,
    label: value ? PO_ST[value].label : 'All',
  }));

  return (
    <>
      <PageHeader
        title="Purchase orders"
        subtitle="One PO can carry lines for several projects and MRs."
        actions={
          isBuyer(me.role) ? (
            <Btn variant="primary" onClick={() => router.push('/pos/new')}>
              + Create PO
            </Btn>
          ) : null
        }
      />
      <Tabs tabs={tabs} active={status} onChange={setStatus} />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <PoTable rows={list.data?.rows ?? []} />
      )}
    </>
  );
}
