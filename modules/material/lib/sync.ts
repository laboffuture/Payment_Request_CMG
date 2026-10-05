'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { get } from './api';

/**
 * §9 live refresh.
 * Prototype origin: sync() / applyChanges() — poll every 30 s while the tab is
 * visible, and on focus.
 *
 * When something changed we normally refetch. But if the user is typing, or a
 * modal is open, we do not pull the ground out from under them: the top bar
 * shows the "New updates — refresh" button instead, exactly as the prototype's
 * `updBtn` does.
 */
export function useLiveRefresh(): { updatesWaiting: boolean; applyUpdates: () => void } {
  const queryClient = useQueryClient();
  const lastStamp = useRef<number | null>(null);
  const [updatesWaiting, setUpdatesWaiting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const busy = (): boolean => {
      if (document.querySelector('[role="dialog"]')) return true;
      const active = document.activeElement;
      return (
        !!active &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) &&
        (active as HTMLInputElement).type !== 'checkbox'
      );
    };

    const check = async (): Promise<void> => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const { upd } = await get<{ upd: number }>('/sync/stamp');
        if (lastStamp.current === null) {
          lastStamp.current = upd;
          return;
        }
        if (upd === lastStamp.current) return;

        lastStamp.current = upd;
        if (busy()) setUpdatesWaiting(true);
        else await queryClient.invalidateQueries();
      } catch {
        // A failed poll is not worth telling anyone about; the next one retries.
      }
    };

    const interval = setInterval(check, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void check();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [queryClient]);

  return {
    updatesWaiting,
    applyUpdates: () => {
      setUpdatesWaiting(false);
      void queryClient.invalidateQueries();
    },
  };
}
