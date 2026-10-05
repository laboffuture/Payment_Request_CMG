'use client';

import { useParams } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import type { PoDetailDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PoWizard } from '@mm/features/po/PoWizard';

/** Prototype: A.poEdit — a draft or rejected PO reopens in the wizard. */
export default function EditPoPage() {
  const { id } = useParams<{ id: string }>();
  const po = useQuery({
    queryKey: ['po', id],
    queryFn: () => get<PoDetailDto>(`/pos/${id}`),
  });

  if (po.isLoading || !po.data) return <div className="text-mut">Loading…</div>;
  return <PoWizard existing={po.data} />;
}
