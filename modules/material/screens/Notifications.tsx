'use client';

import { useRouter } from '@mm/lib/nav';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveDeepLink, type NotificationDto } from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { Btn, EmptyState, PageHeader } from '@mm/components/ui';
import { fmtDateTime } from '@mm/lib/format';

/**
 * Prototype: VIEWS.notifs — newest 100, unread highlighted, click marks read
 * and follows the link, plus "Mark all read".
 */
export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<NotificationDto[]>('/notifications'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['counts'] });
  };

  const readAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: invalidate,
  });

  const open = async (row: NotificationDto) => {
    if (!row.read) {
      await post(`/notifications/${row.id}/read`).catch(() => undefined);
      invalidate();
    }
    const route = row.link ? resolveDeepLink(row.link) : null;
    if (route) router.push(route);
  };

  const rows = list.data ?? [];
  const unread = rows.filter((r) => !r.read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread`}
        actions={
          rows.length ? (
            <Btn disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>
              Mark all read
            </Btn>
          ) : null
        }
      />

      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState text="No notifications yet" />
      ) : (
        <div className="card p-0 overflow-hidden">
          {rows.map((row) => (
            <button
              key={row.id}
              onClick={() => void open(row)}
              className={`flex gap-[10px] px-[14px] py-3 border-b border-line2 text-left w-full
                          ${row.read ? 'bg-white' : 'bg-[#F3F8F7]'}`}
            >
              <span className="flex-1">
                <b className={row.read ? '' : 'text-ac'}>{row.title}</b>
                {row.body ? (
                  <>
                    <br />
                    <span className="text-mut text-sm whitespace-pre-line">{row.body}</span>
                  </>
                ) : null}
              </span>
              <span className="text-mut text-sm whitespace-nowrap">
                {fmtDateTime(row.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
