'use client';

import { Fragment, type ReactNode } from 'react';
import { EmptyState } from './ui';

/**
 * The one table component, drawn as the payment register table (a panel with
 * the .t table inside). Below 861 px each row stacks, naming its values.
 *
 * Every cell carries its column label, so the mobile card view names the values
 * without a second markup path to keep in step.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** right-align numbers */
  align?: 'left' | 'right';
  className?: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyText: string;
  /** an optional group heading row before a group of rows */
  groupBy?: (row: T) => string | null;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyText,
  groupBy,
  rowClassName,
}: Props<T>) {
  if (!rows.length) return <EmptyState text={emptyText} />;

  let lastGroup: string | null = null;

  return (
    <div className="card mm-table">
      <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const group = groupBy?.(row) ?? null;
            const showGroup = group !== null && group !== lastGroup;
            if (showGroup) lastGroup = group;

            return (
              <Fragment key={rowKey(row)}>
                {showGroup ? (
                  <tr>
                    <td className="grp" colSpan={columns.length}>
                      {group}
                    </td>
                  </tr>
                ) : null}
                <tr
                  className={`${onRowClick ? 'click' : ''} ${rowClassName?.(row) ?? ''}`}
                  onClick={
                    onRowClick
                      ? (e) => {
                          // Let a button or input inside the row do its own job.
                          const target = e.target as HTMLElement;
                          if (target.closest('button, input, select, a, label')) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      data-label={c.header}
                      className={`${c.align === 'right' ? 'desk:text-right' : ''} ${
                        c.className ?? ''
                      }`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
