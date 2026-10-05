'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MAX_VENDOR_DOC_BYTES, MSG, type PoDto } from '@cm/shared';
import { get, upload } from '@mm/lib/api';
import { Btn } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { money, today } from '@mm/lib/format';

/**
 * Prototype: docForm(poId) and A.uploadDoc (the second definition) — the PO is
 * chosen from a dropdown, so the modal works from the PO page and from the
 * vendor's documents page alike.
 */
export function VendorDocUpload({
  poId,
  onClose,
}: {
  poId?: string;
  onClose: () => void;
}) {
  const toast = useToast();

  const pos = useQuery({
    queryKey: ['vendor-pos'],
    queryFn: () => get<{ rows: PoDto[] }>('/pos'),
  });

  const [form, setForm] = useState({
    poId: poId ?? '',
    docType: 'INVOICE' as 'INVOICE' | 'DO',
    docNo: '',
    docDate: today(),
    amount: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const send = useAction(
    () => {
      const body = new FormData();
      body.append('poId', form.poId);
      body.append('docType', form.docType);
      body.append('docNo', form.docNo);
      body.append('docDate', form.docDate);
      body.append('amount', form.amount || '0');
      body.append('file', file!);
      return upload('/vendor/docs', body);
    },
    {
      success: 'Uploaded — procurement has been notified',
      invalidate: [['docs'], ['po'], ['pos'], ['vendor-docs']],
      onDone: onClose,
    },
  );

  const submit = () => {
    // The same checks the API makes, so the answer is instant (§8).
    if (!form.poId) return toast(MSG.docChoosePo);
    if (!form.docNo.trim()) return toast(MSG.docNoRequired);
    if (!file) return toast(MSG.docFileRequired);
    if (file.size > MAX_VENDOR_DOC_BYTES) return toast(MSG.docTooLarge);
    if (form.docType === 'INVOICE' && !(Number(form.amount) > 0)) {
      return toast(MSG.docAmountRequired);
    }
    send.mutate();
  };

  const options = (pos.data?.rows ?? []).filter((p) =>
    ['APPROVED', 'PARTIAL', 'RECEIVED'].includes(p.status),
  );

  return (
    <Modal
      title="Upload invoice / delivery order"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={send.isPending} onClick={submit}>
            Upload
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 desk:grid-cols-2">
        <label className="field">
          Against PO *
          <select
            value={form.poId}
            onChange={(e) => setForm({ ...form, poId: e.target.value })}
          >
            <option value="">Choose the PO</option>
            {options.map((po) => (
              <option key={po.id} value={po.id}>
                {po.displayNo} · {money(po.total)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Document *
          <select
            value={form.docType}
            onChange={(e) =>
              setForm({ ...form, docType: e.target.value as 'INVOICE' | 'DO' })
            }
          >
            <option value="INVOICE">Tax invoice</option>
            <option value="DO">Delivery order (DO)</option>
          </select>
        </label>

        <label className="field">
          Document no. *
          <input
            value={form.docNo}
            onChange={(e) => setForm({ ...form, docNo: e.target.value })}
          />
        </label>

        <label className="field">
          Date
          <input
            type="date"
            value={form.docDate}
            onChange={(e) => setForm({ ...form, docDate: e.target.value })}
          />
        </label>

        <label className="field">
          Amount incl. tax (invoice)
          <input
            type="number"
            min={0}
            step="any"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </label>
      </div>

      <label className="field">
        File (PDF / image, max 1 MB) *
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
    </Modal>
  );
}
