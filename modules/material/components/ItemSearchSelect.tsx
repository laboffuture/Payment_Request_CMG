'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ItemDto } from '@cm/shared';
import { get } from '@mm/lib/api';

/**
 * Choose an item from the item master by typing - part of the name or the code - and
 * picking from the suggestions underneath.
 *
 * It searches the whole master on the server as you type, rather than loading a fixed
 * list: a plain dropdown of the first couple of hundred items left most of the master
 * (nearly a thousand items) out of reach.
 */
export function ItemSearchSelect({
  value,
  onChange,
  placeholder = 'Type an item name or code',
  ariaLabel,
}: {
  /** the chosen item's id, '' for none */
  value: string;
  onChange: (itemId: string, item: ItemDto | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<ItemDto | null>(null);
  const listId = useRef(`items-${Math.random().toString(36).slice(2)}`).current;

  // Ask the server a moment after typing stops, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const results = useQuery({
    queryKey: ['items', 'search', query],
    queryFn: () =>
      get<ItemDto[]>(`/items?limit=30${query ? `&q=${encodeURIComponent(query)}` : ''}`),
    enabled: open,
  });
  const shown = results.data ?? [];

  // Cleared from outside (after a successful map, say): empty the box too.
  useEffect(() => {
    if (!value && chosen) {
      setChosen(null);
      setText('');
    }
  }, [value, chosen]);

  const pick = (item: ItemDto) => {
    setChosen(item);
    setText(`${item.code} · ${item.name} (${item.unit})`);
    setOpen(false);
    onChange(item.id, item);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full"
        placeholder={placeholder}
        value={text}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (chosen) {
            setChosen(null);
            onChange('', null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((a) => Math.max(0, Math.min(shown.length - 1, a + step)));
          } else if (e.key === 'Enter' && open && shown[active]) {
            e.preventDefault();
            pick(shown[active]!);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 30,
            marginTop: 4,
            maxHeight: 280,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid var(--mm-line)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(16,24,40,.14)',
          }}
        >
          {shown.map((item, i) => (
            <div
              key={item.id}
              role="option"
              aria-selected={i === active}
              ref={i === active ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              // mousedown, not click: the box must not lose focus before the pick lands.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--mm-ink)',
                background: i === active ? '#eef2f8' : undefined,
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div className="text-mut font-mono" style={{ fontSize: 11 }}>
                {item.code} · {item.unit} · {item.category}
                {item.brand ? ` · ${item.brand}` : ''}
              </div>
            </div>
          ))}
          {results.isFetching && !shown.length ? (
            <div style={{ padding: 10, fontSize: 12 }} className="text-mut">
              Searching…
            </div>
          ) : null}
          {!results.isFetching && !shown.length ? (
            <div style={{ padding: 10, fontSize: 12 }}>
              No item matches “{text.trim()}”. Try another word or the item code.
            </div>
          ) : null}
          {shown.length >= 30 ? (
            <div style={{ padding: '8px 10px', fontSize: 11 }} className="text-mut">
              Showing the first 30 — keep typing to narrow it down.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
