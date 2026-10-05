'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A dialog, drawn as the payment application's .overlay and .modal: the header
 * with its title and close cross, the body, and the footer of buttons.
 * aria-modal, focus kept inside, Escape closes.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node
      ?.querySelector<HTMLElement>('.mm-modal-body input, .mm-modal-body select, .mm-modal-body textarea')
      ?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  return (
    <>
      <button type="button" className="overlay" aria-label="Close" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`modal mm-modal mm${wide ? ' wide' : ''}`}
      >
        <header>
          <div>
            <small>MATERIAL MANAGEMENT</small>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="mm-modal-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </>
  );
}
