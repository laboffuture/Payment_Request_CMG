'use client';

import { useQuery } from '@tanstack/react-query';
import type { PoDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader } from '@mm/components/ui';
import { PoTable } from '@mm/features/po/PoTable';

/**
 * QS's own PO queue: orders the Procurement Manager has approved, waiting for
 * QS to confirm they carry what QS asked for on the MR lines.
 */
export default function PoValidationPage() {
  const list = useQuery({
    queryKey: ['pos', 'QS_VALIDATION'],
    queryFn: () => get<{ rows: PoDto[] }>('/pos?status=QS_VALIDATION'),
  });

  const rows = list.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="PO validation"
        subtitle="Approved by the Procurement Manager and now with you. Open one to compare what you approved on each MR line against what the PO actually orders, then validate it — or send it back saying what is missing."
      />
      {list.isLoading ? <div className="text-mut">Loading…</div> : <PoTable rows={rows} />}
    </>
  );
}
