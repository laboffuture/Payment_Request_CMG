'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VendorDocDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { Btn, PageHeader } from '@mm/components/ui';
import { DocsTable } from '@mm/features/docs/DocsTable';
import { VendorDocUpload } from '@mm/features/vendor/VendorDocUpload';

/** Prototype: VIEWS.vdocs — what this vendor has uploaded, and its status. */
export default function VendorDocsPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const list = useQuery({
    queryKey: ['vendor-docs'],
    queryFn: () => get<VendorDocDto[]>('/docs?status='),
  });

  return (
    <>
      <PageHeader
        title="My invoices & delivery orders"
        subtitle="Status shows when Chandramari procurement has checked each document."
        actions={
          <Btn variant="primary" onClick={() => setUploadOpen(true)}>
            + Upload
          </Btn>
        }
      />
      {list.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DocsTable rows={list.data ?? []} canCheck={false} />
      )}

      {uploadOpen ? <VendorDocUpload onClose={() => setUploadOpen(false)} /> : null}
    </>
  );
}
