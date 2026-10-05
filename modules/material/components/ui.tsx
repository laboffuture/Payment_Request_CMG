'use client';

import type { ChipSpec, ChipTone } from '@cm/shared';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { dueText, fmtDateTime } from '@mm/lib/format';

/**
 * The component set every Material Management screen is built from, drawn with
 * the payment application's own pieces: .primary buttons, .panel cards, the
 * .intro page heading, .badge chips, metric tiles and settings tabs. Same props
 * as before, so the screens themselves did not change.
 */

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type BtnVariant = 'default' | 'primary' | 'danger' | 'dark' | 'link';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  small?: boolean;
}

export function Btn({
  variant = 'default',
  small = false,
  className = '',
  type = 'button',
  ...rest
}: BtnProps) {
  const cls = ['mm-btn', variant === 'default' ? '' : variant, small ? 'small' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={cls} {...rest} />;
}

// ---------------------------------------------------------------------------
// Card, Tile, EmptyState
// ---------------------------------------------------------------------------

export const Card = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => <div className={`card ${className}`}>{children}</div>;

export const Stack = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => <div className={`flex flex-col gap-3 ${className}`}>{children}</div>;

export const Row = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-wrap items-center gap-[10px] ${className}`}>
    {children}
  </div>
);

export const Grid = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`grid gap-[10px] ${className}`}
    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(var(--mm-tile, 180px), 1fr))' }}
  >
    {children}
  </div>
);

/** A dashboard figure, drawn as the payment metric card. */
export function Tile({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number | string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <b>{value}</b>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="mm-tile">
      {content}
    </button>
  ) : (
    <div className="mm-tile">{content}</div>
  );
}

export const EmptyState = ({ text }: { text: string }) => (
  <div className="card" style={{ padding: 0 }}>
    <p className="queue-empty">{text}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Chip and Tag - the payment .badge, in the status tone
// ---------------------------------------------------------------------------

const toneStyle = (tone: ChipTone) => ({
  background: `var(--${tone}s)`,
  color: `var(--${tone})`,
});

export const Chip = ({ spec }: { spec: ChipSpec }) => (
  <span className="chip" style={toneStyle(spec.tone)}>
    {spec.label}
  </span>
);

export const Tag = ({ label, tone }: { label: string; tone: ChipTone }) => (
  <span className="tag" style={toneStyle(tone)}>
    {label}
  </span>
);

// ---------------------------------------------------------------------------
// Page header - the payment .intro
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="intro" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div>
        <small>MATERIAL MANAGEMENT</small>
        <h2>{title}</h2>
        {subtitle ? <div className="mm-sub">{subtitle}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2 noprint" style={{ alignItems: 'center' }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs - the payment settings tabs
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mm-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === active}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticky action bar - long forms keep their buttons in reach
// ---------------------------------------------------------------------------

export const StickyActionBar = ({ children }: { children: ReactNode }) => (
  <div
    className="sticky bottom-0 bg-white border border-line rounded-card px-[14px] py-3 mt-[14px]
               flex flex-wrap justify-between items-center gap-[10px] noprint"
    style={{ boxShadow: '0 -4px 16px rgba(11,29,58,.06)', zIndex: 5 }}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Progress bar and stepper
// ---------------------------------------------------------------------------

export const ProgressBar = ({
  percent,
  done = false,
}: {
  percent: number;
  done?: boolean;
}) => (
  <div className="flex h-[6px] rounded min-w-[70px] overflow-hidden bg-grys">
    <div
      style={{
        width: `${Math.max(0, Math.min(100, percent))}%`,
        background: done ? 'var(--grn)' : '#c9a227',
      }}
    />
  </div>
);

/** The steps of the PO wizard. */
export function Stepper({
  steps,
  current,
  onStep,
}: {
  steps: readonly string[];
  current: number;
  onStep?: (step: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {steps.map((label, i) => {
        const n = i + 1;
        const on = current === n;
        const done = current > n;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onStep?.(n)}
            className={`flex items-center gap-2 border rounded-full pl-[4px] pr-4 py-[4px] min-h-[36px] text-[11.5px]
              ${on ? 'border-ac text-ac font-bold bg-white' : 'border-line text-sub bg-white'}`}
          >
            <span
              className={`w-[26px] h-[26px] rounded-full inline-flex items-center justify-center font-bold
                ${on ? 'bg-ac text-white' : done ? 'bg-grn text-white' : 'bg-grys'}`}
            >
              {done ? '✓' : n}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Due countdown
// ---------------------------------------------------------------------------

export function DueCountdown({ due }: { due?: string | null }) {
  if (!due) return null;
  const { text, tone } = dueText(due);
  const colour =
    tone === 'late' ? 'text-red' : tone === 'soon' ? 'text-amb' : 'text-grn';
  return <span className={`font-semibold ${colour}`}>{text}</span>;
}

// ---------------------------------------------------------------------------
// Trail - the audit log on MR / PO / RFQ detail (hidden from vendors)
// ---------------------------------------------------------------------------

export function Trail({
  rows,
}: {
  rows: { id: string; at: string; action: string; userName: string; note: string }[];
}) {
  if (!rows.length) return null;
  return (
    <>
      <h2 className="noprint">Trail</h2>
      <div className="card flex flex-col gap-[6px] text-sm text-sub noprint">
        {rows.map((row) => (
          <div key={row.id} className="flex gap-[10px]">
            <b className="min-w-[130px]">{fmtDateTime(row.at)}</b>
            <span>
              {row.action} — {row.userName}
              {row.note ? ` · ${row.note}` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
