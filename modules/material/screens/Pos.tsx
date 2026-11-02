'use client';

import { useMemo, useState } from 'react';
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
  const [search, setSearch] = useState('');

  const list = useQuery({
    queryKey: ['pos', status],
    queryFn: () => get<{ rows: PoDto[] }>(`/pos${status ? `?status=${status}` : ''}`),
  });

  // Every word typed must appear somewhere on the PO: its number, vendor, projects,
  // enquiry, who raised it, the total or the status.
  const all = list.data?.rows;
  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!all || !words.length) return all ?? [];
    return all.filter((p) => {
      const text = [
        p.no,
        p.displayNo,
        p.vendorName,
        p.projectCodes.join(' '),
        p.rfqNo,
        p.createdByName,
        p.total,
        // as printed, so "93,880" finds it as well as "93880"
        p.total.toLocaleString('en-IN'),
        p.total.toLocaleString('en-US'),
        PO_ST[p.status]?.label,
      ]
        .join(' ')
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [all, search]);

  const tabs = PO_LIST_TABS.map((value) => ({
    value: value as string,
    label: value ? PO_ST[value].label : 'All',
  }));

  return (
    <>
      <PageHeader
        title="Purchase orders"
        subtitle={
          search.trim() && all
            ? `${rows.length} of ${all.length} match`
            : 'One PO can carry lines for several projects and MRs.'
        }
        actions={
          <>
            <input
              type="search"
              aria-label="Search purchase orders"
              placeholder="Search PO no., vendor, project or amount"
              className="min-w-[230px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isBuyer(me.role) ? (
              <Btn variant="primary" onClick={() => router.push('/pos/new')}>
                + Create PO
              </Btn>
            ) : null}
          </>
        }
      />
      <Tabs tabs={tabs} active={status} onChange={setStatus} />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <PoTable rows={rows} canDelete={me.role === 'ADMIN'} />
      )}
    </>
  );
}
