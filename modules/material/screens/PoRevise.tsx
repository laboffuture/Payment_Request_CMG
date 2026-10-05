'use client';

import { useParams } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import type { PoDetailDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PoWizard } from '@mm/features/po/PoWizard';

/** Prototype: A.poRevise — rev + 1, vendor locked, reason required. */
export default function RevisePoPage() {
  const { id } = useParams<{ id: string }>();
  const po = useQuery({
    queryKey: ['po', id],
    queryFn: () => get<PoDetailDto>(`/pos/${id}`),
  });

  if (po.isLoading || !po.data) return <div className="text-mut">Loading…</div>;
  return <PoWizard existing={po.data} revise />;
}
