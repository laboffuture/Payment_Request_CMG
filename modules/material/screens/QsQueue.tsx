'use client';

import { useQuery } from '@tanstack/react-query';
import type { MrDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader } from '@mm/components/ui';
import { MrTable } from '@mm/features/mr/MrTable';

/**
 * Prototype: VIEWS.approvals — the QS queue, sorted by required date so the
 * most urgent request is at the top.
 */
export default function QsQueuePage() {
  const list = useQuery({
    queryKey: ['mrs', 'qs-queue'],
    queryFn: () => get<{ rows: MrDto[] }>('/mrs?queue=qs'),
  });

  const rows = list.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="QS queue"
        subtitle="MRs come here straight from site. Clear any new items, then split each line into from-store and for-PO. Sorted by required date."
      />
      {list.isLoading ? <div className="text-mut">Loading…</div> : <MrTable rows={rows} />}
    </>
  );
}
