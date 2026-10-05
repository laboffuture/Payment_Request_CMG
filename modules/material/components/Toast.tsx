'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * One message at a time, in the payment application's .toast.
 * role="status" so a screen reader announces it.
 */
const ToastContext = createContext<(message: string) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 3600);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div className="toast" role="status" aria-live="polite">
          <CheckCircle2 />
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
