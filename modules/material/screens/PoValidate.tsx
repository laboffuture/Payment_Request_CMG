'use client';

import { useQuery } from '@tanstack/react-query';
import type { PoDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader } from '@mm/components/ui';
import { PoTable } from '@mm/features/po/PoTable';
import { useSession } from '@mm/lib/session';

/**
 * QS's own PO queue: orders the Procurement Manager has approved, waiting for
 * QS to confirm they carry what QS asked for on the MR lines. The IT Manager
 * has the same queue for TRG-IT POs, which skip QS.
 */
export default function PoValidationPage() {
  const { me } = useSession();
  const status = me.role === 'IT' ? 'IT_VALIDATION' : 'QS_VALIDATION';
  const list = useQuery({
    queryKey: ['pos', status],
    queryFn: () => get<{ rows: PoDto[] }>(`/pos?status=${status}`),
  });

  const rows = list.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="PO validation"
        subtitle="Approved by the Procurement Manager and now with you. Open one to compare what was approved on each MR line against what the PO actually orders, then validate it — or send it back saying what is missing."
      />
      {list.isLoading ? <div className="text-mut">Loading…</div> : <PoTable rows={rows} />}
    </>
  );
}
