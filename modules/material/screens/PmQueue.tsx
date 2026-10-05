'use client';

import { useQuery } from '@tanstack/react-query';
import type { MrDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader } from '@mm/components/ui';
import { MrTable } from '@mm/features/mr/MrTable';

/**
 * The Project Manager's queue — every MR waiting for the first approval,
 * sorted by required date so the most urgent request is at the top.
 * It mirrors the QS queue, one step earlier in the chain.
 */
export default function PmQueuePage() {
  const list = useQuery({
    queryKey: ['mrs', 'pm-queue'],
    queryFn: () => get<{ rows: MrDto[] }>('/mrs?queue=pm'),
  });

  const rows = list.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="MR approvals"
        subtitle="Requests come here straight from site. Check the quantity, the measurement and the unit on each line — change what needs changing, then pass it to QS."
      />
      {list.isLoading ? <div className="text-mut">Loading…</div> : <MrTable rows={rows} />}
    </>
  );
}
