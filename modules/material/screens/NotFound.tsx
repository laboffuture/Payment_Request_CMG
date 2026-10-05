'use client';

import Link from '@mm/lib/link';
import { usePathname, useRouter } from '@mm/lib/nav';
import { PHASES, plannedFor } from '@mm/lib/roadmap';
import { Btn, Card, PageHeader, Stack, Tag } from '@mm/components/ui';

/**
 * Catches any route inside the signed-in shell that has no page yet.
 *
 * The app is delivered in six phases, so some sidebar links point at pages that
 * are still to come. Landing on a bare 404 makes a half-built app look broken;
 * this says which page it will be and which phase brings it — inside the normal
 * layout, so the sidebar and the back button still work.
 *
 * A real page at the same path takes precedence over this catch-all, so this
 * file needs no maintenance as the phases land.
 */
export default function NotBuiltYetPage() {
  const pathname = usePathname();
  const router = useRouter();
  const planned = plannedFor(pathname);

  if (!planned) {
    return (
      <>
        <PageHeader
          title="Page not found"
          subtitle={<span className="font-mono">{pathname}</span>}
        />
        <Card>
          <Stack>
            <p className="m-0">
              There is no page at this address. If you followed a link from
              inside the app, that is a bug worth reporting.
            </p>
            <div>
              <Btn variant="primary" onClick={() => router.push('/')}>
                Go to Home
              </Btn>
            </div>
          </Stack>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={planned.title}
        subtitle={<span className="font-mono">{pathname}</span>}
        actions={<Tag label={`PHASE ${planned.phase}`} tone="amb" />}
      />

      <Card>
        <Stack>
          <div className="warn">
            Not built yet — this page arrives in{' '}
            <b>
              Phase {planned.phase}: {PHASES[planned.phase]}
            </b>
            .
          </div>

          <p className="m-0 text-sub">{planned.summary}</p>

          <div className="border-t border-line2 pt-3 text-mut text-sm">
            <b className="text-ink">Working today (Phase 1):</b> sign-in and
            roles, the item master, inventory with its ledger, the one-time
            inventory import, users and vendor portal logins, projects, company
            &amp; PO print, categories, notification settings and the email
            outbox.
          </div>

          <div className="flex flex-wrap gap-[10px]">
            <Btn variant="primary" onClick={() => router.push('/')}>
              Go to Home
            </Btn>
            <Link href="/inventory" className="contents">
              <Btn>Inventory</Btn>
            </Link>
            <Link href="/admin/items" className="contents">
              <Btn>Item master</Btn>
            </Link>
          </div>
        </Stack>
      </Card>
    </>
  );
}
