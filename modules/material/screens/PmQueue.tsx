'use client';

import { useQuery } from '@tanstack/react-query';
import { firstApproverProjectsOfRole, skipsQs, type MrDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader } from '@mm/components/ui';
import { MrTable } from '@mm/features/mr/MrTable';
import { useSession } from '@mm/lib/session';

/**
 * The Project Manager's queue — every MR waiting for the first approval,
 * sorted by required date so the most urgent request is at the top.
 * It mirrors the QS queue, one step earlier in the chain.
 */
export default function PmQueuePage() {
  const { me } = useSession();
  const depts = firstApproverProjectsOfRole(me.role);
  const deptText = depts
    .map((d) => `${d.project[0]!.toUpperCase()}${d.project.slice(1)} (${d.code})`)
    .join(' and ');
  const list = useQuery({
    queryKey: ['mrs', 'pm-queue'],
    queryFn: () => get<{ rows: MrDto[] }>('/mrs?queue=pm'),
  });

  const rows = list.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="MR approvals"
        subtitle={
          depts.length
            ? `${deptText} requests come here for your approval. Check the quantity, the measurement and the unit on each line — change what needs changing, then pass it on: ${depts
                .map((d) => `${d.code} ${skipsQs(d.code) ? 'goes straight to procurement' : 'to QS'}`)
                .join(', ')}.`
            : 'Requests come here straight from site. Check the quantity, the measurement and the unit on each line — change what needs changing, then pass it to QS.'
        }
      />
      {list.isLoading ? <div className="text-mut">Loading…</div> : <MrTable rows={rows} />}
    </>
  );
}
