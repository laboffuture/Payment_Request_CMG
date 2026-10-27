'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import type { ProcHoldDto } from '@cm/shared';
import { get, postWithFiles } from '@mm/lib/api';
import { ReceiptFiles } from '@mm/features/store/ReceiptFiles';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Tag } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { ItemSearchSelect } from '@mm/components/ItemSearchSelect';
import { UnitOptions } from '@mm/components/UnitOptions';
import { useAction } from '@mm/lib/hooks';
import { useRouter } from '@mm/lib/nav';
import { fmtDate, fmtDateTime, qty } from '@mm/lib/format';

/**
 * Materials procurement sent back to QS from Consolidate MRs - a query, or a rejection.
 * QS answers them here; procurement sees the same list, read only, while it waits.
 */
export const holdsQuery = () => ({
  queryKey: ['pool-holds'],
  queryFn: () => get<ProcHoldDto[]>('/pool/holds'),
});

const KEYS = [['pool-holds'], ['pool'], ['mrs'], ['mr']];

export function ProcHolds({ canAnswer }: { canAnswer: boolean }) {
  const router = useRouter();
  const holds = useQuery(holdsQuery());
  const [answering, setAnswering] = useState<ProcHoldDto | null>(null);

  const rows = holds.data ?? [];
  if (!rows.length) return null;

  const columns: Column<ProcHoldDto>[] = [
    {
      key: 'kind',
      header: 'Procurement',
      render: (r) =>
        r.action === 'QUERY' ? <Tag label="QUERY" tone="amb" /> : <Tag label="REJECTED" tone="red" />,
    },
    {
      key: 'mr',
      header: 'MR no.',
      render: (r) => (
        <button
          className="text-ac underline font-semibold font-mono whitespace-nowrap"
          onClick={() => router.push(`/mrs/${r.mrId}`)}
        >
          {r.mrNo}
        </button>
      ),
    },
    { key: 'project', header: 'Project', render: (r) => r.projectCode },
    {
      key: 'item',
      header: 'Material',
      render: (r) => (
        <>
          <b>{r.itemName}</b>
          <div className="text-mut text-xs">
            {[r.itemCode, r.mrDescription].filter(Boolean).join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'qty',
      header: 'To buy',
      align: 'right',
      render: (r) => <span className="whitespace-nowrap">{`${qty(r.openQty)} ${r.unit}`}</span>,
    },
    { key: 'required', header: 'Required', render: (r) => fmtDate(r.requiredDate) },
    {
      key: 'remark',
      header: 'Remarks from procurement',
      render: (r) => (
        <>
          {r.remark}
          <HoldFiles files={r.files} />
          <div className="text-mut text-xs">
            {[r.byName, fmtDateTime(r.at)].filter(Boolean).join(' · ')}
          </div>
        </>
      ),
    },
    ...(canAnswer
      ? [
          {
            key: 'answer',
            header: 'Action',
            render: (r: ProcHoldDto) => (
              <Btn variant="primary" onClick={() => setAnswering(r)}>
                Answer
              </Btn>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="mb-4">
      <h3 className="font-semibold mb-1">
        {canAnswer ? 'Sent back by procurement' : 'With QS — waiting for an answer'} ({rows.length})
      </h3>
      <div className="text-mut text-sm mb-2">
        {canAnswer
          ? 'Procurement has a query on these materials, or rejected them. They are not bought until you answer.'
          : 'These are out of the list below until QS answers. They come back with QS’s remarks.'}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.mrLineId} emptyText="" />
      {answering ? <AnswerModal hold={answering} onClose={() => setAnswering(null)} /> : null}
    </div>
  );
}

function AnswerModal({ hold, onClose }: { hold: ProcHoldDto; onClose: () => void }) {
  const [decision, setDecision] = useState<'RETURN' | 'CANCEL'>('RETURN');
  const [remark, setRemark] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  // QS may correct the material as it goes back: the quantity always; the item, unit and
  // measurement only while none of it is on a PO or an enquiry.
  const start = {
    qty: String(hold.openQty),
    itemId: hold.itemId,
    unit: hold.unit,
    measurement: hold.measurement,
    description: hold.description,
  };
  const [material, setMaterial] = useState(start);
  const [swapTo, setSwapTo] = useState('');
  const change = (patch: Partial<typeof start>) => setMaterial((m) => ({ ...m, ...patch }));
  const edited = (Object.keys(start) as (keyof typeof start)[]).some((k) => material[k].trim() !== start[k].trim());
  const toBuy = Number(material.qty);

  const answer = useAction(
    () =>
      postWithFiles(
        `/pool/holds/${hold.mrLineId}/answer`,
        {
          decision,
          remark: remark.trim(),
          ...(decision === 'RETURN' && edited
            ? {
                edit: {
                  qty: toBuy,
                  itemId: material.itemId,
                  unit: material.unit,
                  measurement: material.measurement.trim(),
                  description: material.description.trim(),
                },
              }
            : {}),
        },
        files,
      ),
    {
      success: decision === 'CANCEL' ? 'Quantity cancelled' : 'Sent back to procurement',
      invalidate: KEYS,
      onDone: onClose,
    },
  );

  return (
    <Modal
      title={`${hold.action === 'QUERY' ? 'Query' : 'Rejection'} from procurement — ${hold.mrNo}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={
              answer.isPending ||
              !remark.trim() ||
              (decision === 'RETURN' && !(toBuy > 0))
            }
            onClick={() => answer.mutate(undefined)}
          >
            {answer.isPending
              ? 'Saving…'
              : decision === 'CANCEL'
                ? 'Cancel this quantity'
                : 'Send to procurement'}
          </Btn>
        </>
      }
    >
      <p>
        <b>{hold.itemName}</b> · {qty(hold.openQty)} {hold.unit} still to buy
      </p>
      <div className="warn">
        <b>{hold.byName || 'Procurement'}:</b> {hold.remark}
        <HoldFiles files={hold.files} />
      </div>

      <label className="flex items-start gap-2">
        <input
          type="radio"
          name="decision"
          checked={decision === 'RETURN'}
          onChange={() => setDecision('RETURN')}
        />
        <span>
          <b>Answer and send back to procurement</b>
          <br />
          <span className="text-mut text-sm">
            The material returns to Consolidate MRs with your remarks, to be bought.
          </span>
        </span>
      </label>
      {decision === 'RETURN' ? (
        <fieldset className="card flex flex-col gap-3">
          <legend className="font-semibold px-1">
            Material{edited ? ' — changed' : ''}{' '}
            <span className="text-mut text-xs font-normal">correct it here if needed</span>
          </legend>
          {hold.ordered ? (
            <div className="text-mut text-xs">
              Part of this material is already on a PO or an enquiry, so only the quantity still to
              buy can change.
            </div>
          ) : null}
          <div className="text-sm">
            Item: <b>{swapTo ? 'changed — see below' : `${hold.itemCode} · ${hold.itemName}`}</b>
          </div>
          {!hold.ordered ? (
            <ItemSearchSelect
              ariaLabel="Change to another item"
              placeholder="Change to another item — type its name or code"
              value={swapTo}
              onChange={(itemId, item) => {
                setSwapTo(itemId);
                change(item ? { itemId, unit: item.unit } : { itemId: start.itemId, unit: start.unit });
              }}
            />
          ) : null}
          <div className="grid gap-3 desk:grid-cols-3">
            <label className="field">
              Quantity to buy *
              <input
                type="number"
                min={0}
                step="any"
                value={material.qty}
                onChange={(e) => change({ qty: e.target.value })}
              />
            </label>
            <label className="field">
              Unit
              <select
                value={material.unit}
                disabled={hold.ordered}
                onChange={(e) => change({ unit: e.target.value })}
              >
                <UnitOptions current={material.unit} />
              </select>
            </label>
            <label className="field">
              Measurement
              <input
                maxLength={120}
                placeholder="2400 × 1200 × 12.5 mm"
                value={material.measurement}
                disabled={hold.ordered}
                onChange={(e) => change({ measurement: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            Description
            <textarea
              rows={2}
              maxLength={500}
              value={material.description}
              onChange={(e) => change({ description: e.target.value })}
            />
          </label>
        </fieldset>
      ) : null}

      <label className="flex items-start gap-2">
        <input
          type="radio"
          name="decision"
          checked={decision === 'CANCEL'}
          onChange={() => setDecision('CANCEL')}
        />
        <span>
          <b>Cancel this quantity — do not buy it</b>
          <br />
          <span className="text-mut text-sm">
            {qty(hold.openQty)} {hold.unit} comes off the MR and the site engineer is told.
            Anything already on a PO or an enquiry is not touched.
          </span>
        </span>
      </label>

      <label className="field">
        Remarks *
        <textarea
          rows={3}
          maxLength={500}
          placeholder={
            decision === 'CANCEL' ? 'Why this will not be bought' : 'Your answer to procurement'
          }
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </label>
      <ReceiptFiles
        files={files}
        onChange={setFiles}
        required={false}
        label="Attachments — photo, drawing, approval"
        note="goes to procurement with your answer"
      />
    </Modal>
  );
}

/** Files sent with a query or an answer - each opens in a new tab. */
export function HoldFiles({ files }: { files: ProcHoldDto['files'] | undefined }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-ac underline"
        >
          <Paperclip className="w-3 h-3" aria-hidden />
          {file.name}
        </a>
      ))}
    </div>
  );
}
