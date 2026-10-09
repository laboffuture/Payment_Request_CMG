'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProcHoldDto } from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Tag } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
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

  const answer = useAction(
    () => post(`/pool/holds/${hold.mrLineId}/answer`, { decision, remark: remark.trim() }),
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
            disabled={answer.isPending || !remark.trim()}
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
    </Modal>
  );
}
