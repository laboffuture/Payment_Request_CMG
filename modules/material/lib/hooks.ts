'use client';

import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { ApiError } from './api';
import { useToast } from '@mm/components/Toast';

/**
 * A mutation that shows the API's own message on failure.
 *
 * Every validation message comes from `packages/shared/messages.ts`, so the
 * toast the user sees is the exact wording the prototype used — there is no
 * second copy of it in the UI to drift.
 */
export function useAction<TData, TVars>(
  fn: (vars: TVars) => Promise<TData>,
  options: {
    success?: string | ((data: TData) => string);
    /** query keys to refetch afterwards; ['*'] refetches everything */
    invalidate?: string[][];
    onDone?: (data: TData) => void;
  } = {},
) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const config: UseMutationOptions<TData, unknown, TVars> = {
    mutationFn: fn,
    onSuccess: (data) => {
      for (const key of options.invalidate ?? []) {
        if (key[0] === '*') void queryClient.invalidateQueries();
        else void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ['counts'] });

      const message =
        typeof options.success === 'function'
          ? options.success(data)
          : options.success;
      if (message) toast(message);

      options.onDone?.(data);
    },
    onError: (err) => {
      toast(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Something went wrong',
      );
    },
  };

  return useMutation(config);
}
