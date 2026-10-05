'use client';

import { Suspense, useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  REPORT_ROUTE,
  REPORT_TABS,
  type ReportResponse,
  type ReportRow,
  type ReportTab,
} from '@cm/shared';
import { downloadFile, get } from '@mm/lib/api';
import { Btn, EmptyState, Grid, PageHeader, Tabs, Tile } from '@mm/components/ui';
import { useReference } from '@mm/lib/reference';

/**
 * Reports & MIS.
 * Prototype origin: VIEWS.reports, REPORTS, reportData(tab, pj) — thirteen
 * tabs, a project filter, CSV export, and rows that click through to the
 * record they describe.
 */
export default function ReportsPage() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const router = useRouter();
  const reference = useReference();
  const [tab, setTab] = useState<ReportTab>('lines');
  const [projectId, setProjectId] = useState('');

  const suffix = projectId ? `?project=${projectId}` : '';

  const report = useQuery({
    queryKey: ['report', tab, projectId],
    queryFn: () => get<ReportResponse>(`/reports/${tab}${suffix}`),
  });

  const data = report.data;

  const openRow = (row: ReportRow) => {
    if (!row._id || !row._v) return;
    const route = REPORT_ROUTE[row._v];
    if (route) router.push(route(row._id));
  };

  return (
    <>
      <PageHeader
        title="Reports & MIS"
        subtitle={REPORT_TABS.find((t) => t.value === tab)?.label}
        actions={
          <>
            <select
              aria-label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {reference.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
            <Btn onClick={() => downloadFile(`/reports/${tab}.csv${suffix}`)}>
              Export CSV
            </Btn>
            <Btn onClick={() => window.print()}>Print</Btn>
          </>
        }
      />

      <Tabs
        tabs={REPORT_TABS.map((t) => ({ value: t.value as string, label: t.label }))}
        active={tab}
        onChange={(value) => setTab(value as ReportTab)}
      />

      {data?.kpis?.length ? (
        <Grid className="mb-[14px]">
          {data.kpis.map((kpi) => (
            <Tile key={kpi.label} label={kpi.label} value={kpi.value} />
          ))}
        </Grid>
      ) : null}

      {report.isLoading ? <div className="text-mut">Loading…</div> : null}

      {!report.isLoading && !data?.rows.length ? <EmptyState text="No data" /> : null}

      {data?.rows.length ? (
        <div className="overflow-x-auto">
          <table className="t">
            <thead>
              <tr>
                {data.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr
                  key={`${row._id ?? 'row'}-${index}`}
                  className={row._id ? 'click' : ''}
                  onClick={() => openRow(row)}
                >
                  {data.columns.map((column) => (
                    <td key={column} data-label={column}>
                      {String(row[column] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
