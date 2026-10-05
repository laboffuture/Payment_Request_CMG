'use client';

import { Suspense, useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import type { MrDto } from '@cm/shared';
import { downloadFile, get } from '@mm/lib/api';
import { Btn, PageHeader, Tabs } from '@mm/components/ui';
import { MrTable } from '@mm/features/mr/MrTable';
import { useSession } from '@mm/lib/session';
import { useReference } from '@mm/lib/reference';

/**
 * Prototype: VIEWS.mrs — status tabs, project filter, "PDF — all N shown"
 * and the CSV export.
 */
const TABS = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PM_PENDING', label: 'With PM' },
  { value: 'QS_PENDING', label: 'With QS' },
  { value: 'SENT_BACK', label: 'Sent back' },
  { value: 'APPROVED', label: 'In progress' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

export default function MrsPage() {
  return (
    <Suspense>
      <Mrs />
    </Suspense>
  );
}

function Mrs() {
  const { me } = useSession();
  const router = useRouter();
  const reference = useReference();
  const [status, setStatus] = useState<string>('');
  const [projectId, setProjectId] = useState('');

  // Only a site engineer has drafts of their own.
  const tabs = TABS.filter((t) => t.value !== 'DRAFT' || me.role === 'SITE');

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (projectId) params.set('projectId', projectId);

  const list = useQuery({
    queryKey: ['mrs', status, projectId],
    queryFn: () => get<{ rows: MrDto[]; total: number }>(`/mrs?${params}`),
  });

  const rows = list.data?.rows ?? [];
  const ids = rows.map((r) => r.id).join(',');

  return (
    <>
      <PageHeader
        title={me.role === 'SITE' ? 'My material requests' : 'All material requests'}
        subtitle={`${rows.length} shown`}
        actions={
          <>
            <select
              aria-label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {reference.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>

            {me.role === 'SITE' ? (
              <Btn variant="primary" onClick={() => router.push('/mrs/new')}>
                + New MR
              </Btn>
            ) : null}

            {rows.length ? (
              <>
                <Btn onClick={() => router.push(`/mrs/print?ids=${ids}`)}>
                  PDF — all {rows.length} shown
                </Btn>
                <Btn onClick={() => downloadFile(`/mrs/export.csv?ids=${ids}`)}>
                  Excel (CSV)
                </Btn>
              </>
            ) : null}
          </>
        }
      />

      <Tabs tabs={tabs} active={status} onChange={setStatus} />

      {list.isLoading ? <div className="text-mut">Loading…</div> : <MrTable rows={rows} />}
    </>
  );
}
