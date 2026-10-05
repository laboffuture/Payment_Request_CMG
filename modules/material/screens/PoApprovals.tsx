'use client';

import { useQuery } from '@tanstack/react-query';
import type { PoDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { PageHeader } from '@mm/components/ui';
import { PoTable } from '@mm/features/po/PoTable';
import { useSession } from '@mm/lib/session';

/**
 * Prototype: VIEWS.poapprove, now serving two stages of the same chain.
 *
 * A Procurement Manager sees the POs waiting on them (never their own — §3);
 * management sees the ones QS has already validated, which is the last gate
 * before the vendor is told.
 */
export default function PoApprovalsPage() {
  const { me } = useSession();
  const isMgmt = me.role === 'MGMT';
  const status = isMgmt ? 'MGMT_APPROVAL' : 'PENDING_APPROVAL';

  const list = useQuery({
    queryKey: ['pos', status],
    queryFn: () => get<{ rows: PoDto[] }>(`/pos?status=${status}`),
  });

  const rows = list.data?.rows ?? [];
  const others = rows.filter((p) => p.createdBy !== me.id);
  const mine = isMgmt ? [] : rows.filter((p) => p.createdBy === me.id);

  return (
    <>
      <PageHeader
        title="PO approvals"
        subtitle={
          isMgmt
            ? 'Validated by QS and waiting for your final word. Approving releases the PO to the vendor; rejecting stops it and tells everyone who handled it.'
            : 'New and revised POs. Approving sends the PO to QS to validate against the MR lines, and then to management. You cannot approve a PO you raised.'
        }
      />

      {list.isLoading ? <div className="text-mut">Loading…</div> : <PoTable rows={others} />}

      {mine.length ? (
        <>
          <h2>Raised by you — waiting for another manager</h2>
          <PoTable rows={mine} />
        </>
      ) : null}
    </>
  );
}
