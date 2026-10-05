'use client';

import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  ROLE_NAMES,
  isBuyer,
  type Counts,
  type MrDto,
  type PoDto,
  type Role,
} from '@cm/shared';
import { get } from '@mm/lib/api';
import { Btn, Grid, PageHeader, Tile } from '@mm/components/ui';
import { MrTable } from '@mm/features/mr/MrTable';
import { useSession } from '@mm/lib/session';

/**
 * The home dashboard.
 * Prototype origin: VIEWS.home — role tiles that each link to the filtered
 * page, then the six most recent material requests.
 */
interface TileSpec {
  label: string;
  value: number;
  href: string;
}

export default function HomePage() {
  const { me, counts } = useSession();
  const router = useRouter();

  // A vendor's home is the enquiry list, so this only serves staff.
  const mrs = useQuery({
    queryKey: ['mrs', 'recent'],
    queryFn: () => get<{ rows: MrDto[] }>('/mrs?limit=6'),
    enabled: me.role !== 'VENDOR',
  });

  const pos = useQuery({
    queryKey: ['pos', 'home'],
    queryFn: () => get<{ rows: PoDto[] }>('/pos'),
    enabled: ['PROC', 'PROC_MGR', 'MGMT', 'QS', 'ADMIN'].includes(me.role),
  });

  const tiles = tilesFor(me.role, counts, mrs.data?.rows ?? [], pos.data?.rows ?? [], me.id);

  return (
    <>
      <PageHeader
        title={`Hello, ${me.name}`}
        subtitle={`${ROLE_NAMES[me.role]} · your queue`}
        actions={
          me.role === 'SITE' ? (
            <Btn variant="primary" onClick={() => router.push('/mrs/new')}>
              + New MR
            </Btn>
          ) : null
        }
      />

      <Grid>
        {tiles.map((tile) => (
          <Tile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            onClick={() => router.push(tile.href)}
          />
        ))}
      </Grid>

      {me.role !== 'VENDOR' ? (
        <>
          <h2>Recent material requests</h2>
          <MrTable rows={(mrs.data?.rows ?? []).slice(0, 6)} />
        </>
      ) : null}
    </>
  );
}

function tilesFor(
  role: Role,
  counts: Counts,
  mrs: MrDto[],
  pos: PoDto[],
  meId: string,
): TileSpec[] {
  const tiles: TileSpec[] = [];
  const countMrs = (...statuses: string[]) =>
    mrs.filter((m) => statuses.includes(m.status)).length;

  if (role === 'SITE') {
    tiles.push(
      { label: 'Drafts', value: countMrs('DRAFT'), href: '/mrs' },
      { label: 'Sent back to me', value: countMrs('SENT_BACK'), href: '/mrs' },
      {
        label: 'My MRs in progress',
        value: countMrs('PM_PENDING', 'QS_PENDING', 'APPROVED'),
        href: '/mrs',
      },
      {
        label: 'To receive / accept at site',
        value: counts.receive ?? 0,
        href: '/receive',
      },
    );
  }

  if (role === 'PM') {
    tiles.push(
      { label: 'MRs waiting for me', value: counts.pmQueue ?? 0, href: '/pm' },
      { label: 'Passed to QS', value: countMrs('QS_PENDING'), href: '/mrs' },
      { label: 'In progress', value: countMrs('APPROVED'), href: '/mrs' },
      { label: 'Rejected', value: countMrs('REJECTED'), href: '/mrs' },
    );
  }

  if (role === 'QS') {
    tiles.push(
      { label: 'MRs waiting for QS', value: counts.qsQueue ?? 0, href: '/qs' },
      {
        label: 'POs to validate',
        value: counts.poValidations ?? 0,
        href: '/pos/validate',
      },
      {
        label: 'New items to clear',
        value: mrs.reduce((sum, m) => sum + m.newItemCount, 0),
        href: '/qs',
      },
      { label: 'In progress', value: countMrs('APPROVED'), href: '/mrs' },
      { label: 'Closed', value: countMrs('CLOSED'), href: '/mrs' },
    );
  }

  if (role === 'PROC_MGR') {
    tiles.push({
      label: 'POs to approve',
      value: counts.poApprovals ?? 0,
      href: '/pos/approvals',
    });
  }

  if (isBuyer(role)) {
    tiles.push(
      { label: 'Lines to buy (pool)', value: counts.pool ?? 0, href: '/pool' },
      {
        label: 'Draft / rejected POs',
        value: pos.filter((p) => ['DRAFT', 'REJECTED'].includes(p.status)).length,
        href: '/pos',
      },
      { label: 'Invoices & DOs to check', value: counts.docs ?? 0, href: '/docs' },
    );
  }

  if (role === 'MGMT') {
    tiles.push(
      {
        label: 'POs waiting for me',
        value: counts.poMgmtApprovals ?? 0,
        href: '/pos/approvals',
      },
      {
        label: 'Earlier in the chain',
        value: pos.filter((p) =>
          ['PENDING_APPROVAL', 'QS_VALIDATION'].includes(p.status),
        ).length,
        href: '/pos',
      },
      {
        label: 'Open POs',
        value: pos.filter((p) => ['APPROVED', 'PARTIAL'].includes(p.status)).length,
        href: '/pos',
      },
      { label: 'Reports', value: 13, href: '/reports' },
    );
  }

  if (role === 'STORE') {
    tiles.push(
      { label: 'POs to receive (store)', value: counts.grn ?? 0, href: '/grn' },
      { label: 'MR lines to issue', value: counts.issue ?? 0, href: '/issue' },
      { label: 'Issue notes', value: 0, href: '/issues' },
    );
  }

  if (role === 'VENDOR') {
    tiles.push(
      { label: 'Enquiries waiting for you', value: counts.vendorRfqs ?? 0, href: '/vendor' },
      { label: 'My purchase orders', value: 0, href: '/vendor/pos' },
    );
  }

  if (role === 'ADMIN') {
    tiles.push(
      {
        label: 'POs in approval (view only)',
        value: pos.filter((p) =>
          ['PENDING_APPROVAL', 'QS_VALIDATION', 'MGMT_APPROVAL'].includes(p.status),
        ).length,
        href: '/pos',
      },
      { label: 'Users & logins', value: 0, href: '/admin/users' },
      { label: 'Vendors', value: 0, href: '/admin/vendors' },
      { label: 'Item master', value: 0, href: '/admin/items' },
      { label: 'Emails in outbox', value: 0, href: '/admin/email' },
    );
  }

  tiles.push({
    label: 'Unread notifications',
    value: counts.notifications ?? 0,
    href: '/notifications',
  });

  void meId;
  return tiles;
}
