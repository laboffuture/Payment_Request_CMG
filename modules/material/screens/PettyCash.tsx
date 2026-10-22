'use client';

import { useQuery } from '@tanstack/react-query';
import type { MrDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader } from '@mm/components/ui';
import { MrTable } from '@mm/features/mr/MrTable';
import { useSession } from '@mm/lib/session';

/**
 * Project petty cash - no PO is raised. Procurement sees the requests QS approved,
 * waiting for their review; a site engineer sees their own, approved and waiting for
 * the GRN. Each opens on the request page, where the review or the GRN is done.
 */
export default function PettyCashPage() {
  const { me } = useSession();
  const site = me.role === 'SITE';
  const list = useQuery({
    queryKey: ['mrs', 'petty'],
    queryFn: () => get<{ rows: MrDto[] }>('/mrs?queue=petty'),
  });

  return (
    <>
      <PageHeader
        title={site ? 'Petty cash GRN' : 'Petty cash review'}
        subtitle={
          site
            ? 'Your project petty cash requests approved by procurement. Buy the items, then open the request and post the GRN with the bill.'
            : 'Project petty cash requests approved by QS. No PO is raised — open one to approve it, send it back to QS or reject it.'
        }
      />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <MrTable rows={list.data?.rows ?? []} />
      )}
    </>
  );
}
