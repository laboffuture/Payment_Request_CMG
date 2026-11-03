'use client';

import { useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { del } from '@mm/lib/api';
import { Modal } from '@mm/components/Modal';
import { Btn } from '@mm/components/ui';
import { useAction } from '@mm/lib/hooks';

/**
 * Delete an MR outright, in any status, after confirming. Shown to the administrator
 * (Administrator and Material Admin) on the MR page and on every row of the MR lists.
 */
export function AdminDeleteMr({
  id,
  no,
  small = false,
  leaveTo,
}: {
  id: string;
  no: string;
  small?: boolean;
  /** where to go once deleted - the MR page leaves for the list; a list row stays put */
  leaveTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useAction(() => del<{ no: string }>(`/admin/mrs/${id}`), {
    success: (r) => `${r.no || 'MR'} deleted`,
    invalidate: [['mrs'], ['mr', id], ['counts'], ['pool']],
    onDone: () => {
      setOpen(false);
      if (leaveTo) router.push(leaveTo);
    },
  });

  return (
    // keeps clicks in the confirm box from opening the MR row behind it
    <span onClick={(e) => e.stopPropagation()}>
      <Btn small={small} onClick={() => setOpen(true)}>
        <span className="text-[#b42318]">{small ? 'Delete' : 'Delete MR'}</span>
      </Btn>
      {open ? (
        <Modal
          title={`Delete ${no || 'this MR'}?`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Btn onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={remove.isPending}
                onClick={() => remove.mutate(undefined)}
              >
                {remove.isPending ? 'Deleting…' : 'Delete MR'}
              </Btn>
            </>
          }
        >
          <p>
            The MR, its lines, attachments, notifications and unsent emails are removed
            for everyone. This cannot be undone.
          </p>
          <p className="text-mut text-sm">
            An MR still on a live PO (not cancelled or rejected), an open enquiry or a stock
            issue cannot be deleted until those are cancelled or revised.
          </p>
        </Modal>
      ) : null}
    </span>
  );
}
