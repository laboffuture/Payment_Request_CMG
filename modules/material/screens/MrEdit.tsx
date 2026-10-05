'use client';

import { useParams } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import type { MrDetailDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { MrForm } from '@mm/features/mr/MrForm';

/** Prototype: VIEWS.mredit — the same form, loaded with the saved MR. */
export default function EditMrPage() {
  const { id } = useParams<{ id: string }>();
  const mr = useQuery({
    queryKey: ['mr', id],
    queryFn: () => get<MrDetailDto>(`/mrs/${id}`),
  });

  if (mr.isLoading || !mr.data) return <div className="text-mut">Loading…</div>;
  return <MrForm existing={mr.data} />;
}
