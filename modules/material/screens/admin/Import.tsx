'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IMPORT_COLS,
  MSG,
  type ImportJobStatus,
  type ImportPreview,
} from '@cm/shared';
import { downloadFile, get, post, upload } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, PageHeader, ProgressBar, Stack, StickyActionBar, Tag } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useReference } from '@mm/lib/reference';
import { money, qty } from '@mm/lib/format';

/**
 * Prototype: VIEWS.import, A.tplCsv, impPreview(), A.impRun.
 *
 * Download the template, fill it offline, upload, check the preview, import.
 * The write runs as a background job, so a long file shows a progress bar
 * instead of a spinning tab.
 */
type ImportRow = ImportPreview['ok'][number];

export default function ImportPage() {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const reference = useReference();
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const uploadCsv = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return upload<ImportPreview>('/admin/import/preview', body);
    },
    onSuccess: setPreview,
    onError: (err) => toast(err instanceof Error ? err.message : MSG.importEmpty),
  });

  const run = useMutation({
    mutationFn: () => post<{ jobId: string }>('/admin/import/run', { token: preview!.token }),
    onSuccess: (res) => {
      setJobId(res.jobId);
      setProgress(0);
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not start the import'),
  });

  // Poll the job until it finishes, then land on the inventory page.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const status = await get<ImportJobStatus>(`/admin/import/${jobId}/status`);
        if (cancelled) return;
        setProgress(status.progress ?? 0);

        if (status.state === 'completed') {
          toast(MSG.importDone(status.newItems ?? 0, status.withStock ?? 0));
          setJobId(null);
          setPreview(null);
          void queryClient.invalidateQueries({ queryKey: ['inventory'] });
          void queryClient.invalidateQueries({ queryKey: ['admin', 'items'] });
          router.push('/inventory');
          return;
        }
        if (status.state === 'failed') {
          toast(status.error ?? 'The import failed');
          setJobId(null);
          return;
        }
      } catch {
        // keep polling — a dropped request is not a failed import
      }
      if (!cancelled) setTimeout(tick, 1000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [jobId, queryClient, router, toast]);

  const columns: Column<ImportRow>[] = [
    { key: 'row', header: 'Row', render: (r) => r.row },
    {
      key: 'code',
      header: 'Code',
      render: (r) => <span className="font-mono">{r.code || 'new'}</span>,
    },
    {
      key: 'name',
      header: 'Item',
      render: (r) => (
        <span className="flex items-center gap-2">
          {r.name}
          {r.existing ? <Tag label="EXISTS" tone="ac" /> : null}
        </span>
      ),
    },
    { key: 'unit', header: 'Unit', render: (r) => r.unit },
    { key: 'cat', header: 'Category', render: (r) => r.cat },
    { key: 'sub', header: 'Sub', render: (r) => r.sub || '—' },
    { key: 'qty', header: 'Opening qty', align: 'right', render: (r) => qty(r.qty) },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      render: (r) => (r.rate ? money(r.rate) : '—'),
    },
  ];

  return (
    <>
      <PageHeader
        title="Import inventory (one time)"
        subtitle="Load the item list with opening stock, category-wise. Items that already have opening stock are skipped, so it can't be loaded twice."
      />

      <Card>
        <Stack>
          <b>1. Download the template</b>
          <div className="text-mut text-sm">
            Columns: {IMPORT_COLS.join(' · ')}. Category must be one of:{' '}
            {reference.categories.map((c) => c.name).join(', ') || '(add some under Categories)'}.
            Leave Item Code blank to get a new code.
          </div>
          <div>
            <Btn onClick={() => downloadFile('/admin/import/template.csv')}>
              Download CSV template
            </Btn>
          </div>

          <b>2. Upload the filled file (CSV)</b>
          <div className="text-mut text-sm">In Excel: File → Save As → CSV UTF-8.</div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            disabled={uploadCsv.isPending || !!jobId}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadCsv.mutate(file);
              if (fileInput.current) fileInput.current.value = '';
            }}
          />
        </Stack>
      </Card>

      {jobId ? (
        <Card className="mt-4">
          <Stack>
            <b>Importing…</b>
            <ProgressBar percent={progress} />
            <span className="text-mut text-sm">{progress}% complete</span>
          </Stack>
        </Card>
      ) : null}

      {preview && !jobId ? (
        <>
          <h2>
            Preview — {preview.ok.length} ready, {preview.bad.length} with errors,{' '}
            {preview.skip.length} skipped
          </h2>

          {preview.bad.length ? (
            <div className="errb mb-[10px]">
              {preview.bad.slice(0, 20).map((b) => (
                <div key={b.row}>
                  Row {b.row}: {b.err}
                </div>
              ))}
            </div>
          ) : null}

          {preview.skip.length ? (
            <div className="warn mb-[10px]">
              {preview.skip.slice(0, 20).map((b) => (
                <div key={b.row}>
                  Row {b.row}: {b.err}
                </div>
              ))}
            </div>
          ) : null}

          <DataTable
            columns={columns}
            rows={preview.ok.slice(0, 200)}
            rowKey={(r) => String(r.row)}
            emptyText="Nothing in this file is ready to import"
          />

          <StickyActionBar>
            <Btn onClick={() => setPreview(null)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!preview.ok.length || run.isPending}
              onClick={() => run.mutate()}
            >
              Import {preview.ok.length} row(s)
            </Btn>
          </StickyActionBar>
        </>
      ) : null}
    </>
  );
}
