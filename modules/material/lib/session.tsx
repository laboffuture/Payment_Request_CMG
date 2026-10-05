'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Counts, Me } from '@cm/shared';
import { get, post } from './api';

/**
 * Who is signed in, and the badge counts.
 * Prototype origin: me(), counts(role) and the 30-second `sync()` poll.
 */

interface SessionValue {
  me: Me;
  counts: Counts;
  refreshCounts: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession used outside the signed-in layout');
  return value;
}

export const meQuery = () => ({
  queryKey: ['me'] as const,
  queryFn: () => get<Me>('/me'),
  staleTime: 5 * 60_000,
  retry: false,
});

export const countsQuery = () => ({
  queryKey: ['counts'] as const,
  queryFn: () => get<Counts>('/me/counts'),
  staleTime: 30_000,
});

export function SessionProvider({
  me,
  children,
}: {
  me: Me;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const counts = useQuery(countsQuery());

  const value: SessionValue = {
    me,
    counts: counts.data ?? {},
    refreshCounts: () => void queryClient.invalidateQueries({ queryKey: ['counts'] }),
    // One sign-in for the whole application: signing out ends that session.
    signOut: async () => {
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
      queryClient.clear();
      window.location.href = '/';
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
