'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import { BRAND_LOGO_URL, MR_ST, chipFor, type MrPrintDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { Btn, EmptyState, PageHeader } from '@mm/components/ui';
import { fmtDate, fmtDateTime, qty } from '@mm/lib/format';

/**
 * The paper material requisition form.
 * Prototype origin: VIEWS.mrprint / mrDoc(m) — logo, company legal name, the
 * job block, at least fifteen ruled rows, struck-through rejected lines and
 * three signature blocks. One MR per printed page.
 */
export default function MrPrintPage() {
  return (
    <Suspense>
      <MrPrint />
    </Suspense>
  );
}

function MrPrint() {
  const params = useSearchParams();
  const router = useRouter();
  const ids = params.get('ids') ?? '';

  const docs = useQuery({
    queryKey: ['mr-print', ids],
    queryFn: () => get<MrPrintDto[]>(`/mrs/print?ids=${ids}`),
    enabled: !!ids,
  });

  const list = docs.data ?? [];

  return (
    <>
      <div className="noprint">
        <PageHeader
          title={`MR form${list.length > 1 ? `s (${list.length})` : ''}`}
          subtitle="Use Print / Save as PDF. Each MR prints on its own page."
          actions={
            <>
              <Btn onClick={() => router.back()}>← Back</Btn>
              <Btn variant="primary" onClick={() => window.print()}>
                Print / Save PDF
              </Btn>
            </>
          }
        />
      </div>

      {docs.isLoading ? <div className="text-mut">Loading…</div> : null}
      {!docs.isLoading && !list.length ? <EmptyState text="No MRs selected" /> : null}

      {list.map((doc) => (
        <MrDocument key={doc.mr.id} doc={doc} />
      ))}
    </>
  );
}

function MrDocument({ doc }: { doc: MrPrintDto }) {
  const { mr, lines, company } = doc;
  const approved = mr.status === 'APPROVED' || mr.status === 'CLOSED';
  // The paper form always has at least fifteen ruled rows.
  const rowCount = Math.max(15, lines.length);

  return (
    <div className="bg-white border border-line rounded-card p-7 max-w-[900px] mb-5 mr-doc print:border-0 print:p-0">
      <div className="flex justify-between items-center border-b-[3px] border-ink pb-[10px] gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={company?.logoUrl || BRAND_LOGO_URL}
            alt="Chandramari Group"
            className="max-h-16 max-w-[200px] object-contain"
          />
          <b className="text-[22px] tracking-[.04em]">MATERIAL REQUISITION FORM</b>
        </div>
        <div className="grid gap-1 text-right text-[13px]">
          <b>{company?.legalName || company?.name}</b>
          {mr.status !== 'DRAFT' ? (
            <span>Status: {chipFor(MR_ST, mr.status).label}</span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-[6px] my-3 text-sm">
        <Field label="No." value={mr.no || 'Draft'} mono />
        <Field label="Date" value={fmtDate(mr.submittedAt ?? mr.createdAt)} />
        <Field label="Job No." value={mr.projectCode} />
        <Field label="Job Name" value={mr.projectName.split(' · ').slice(1).join(' · ')} />
      </div>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <Th width="44px">S.No.</Th>
            <Th width="90px">B.O.Q Ref</Th>
            <Th>Description of Materials</Th>
            <Th width="130px">Measurement</Th>
            <Th width="90px" right>
              Qty.
            </Th>
            <Th width="64px">Unit</Th>
            <Th width="100px">Req. Date</Th>
            {approved ? (
              <>
                <Th width="74px" right>
                  QS store
                </Th>
                <Th width="74px" right>
                  QS PO
                </Th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, i) => {
            const line = lines[i];
            if (!line) {
              return (
                <tr key={`blank-${i}`}>
                  <Td>{i + 1}</Td>
                  <Td />
                  <Td />
                  <Td />
                  <Td />
                  <Td />
                  <Td />
                  {approved ? (
                    <>
                      <Td />
                      <Td />
                    </>
                  ) : null}
                </tr>
              );
            }

            const rejected = line.lineStatus === 'REJECTED';
            return (
              <tr
                key={line.id}
                style={rejected ? { textDecoration: 'line-through', color: '#8a8a8a' } : {}}
              >
                <Td>{i + 1}</Td>
                <Td>{line.boqRef}</Td>
                <Td>
                  <b>{line.name}</b>
                  {line.newStatus === 'PENDING' ? ' (new item)' : ''}
                  {line.description ? (
                    <div style={{ whiteSpace: 'pre-line' }}>{line.description}</div>
                  ) : null}
                  {line.remarks ? (
                    <div style={{ color: '#5B6068' }}>{line.remarks}</div>
                  ) : null}
                </Td>
                <Td>{line.measurement}</Td>
                <Td right>
                  {qty(line.qty)}
                  {line.changed ? (
                    <div style={{ color: '#5B6068', fontSize: '11px' }}>
                      asked {qty(line.requestedQty)}
                    </div>
                  ) : null}
                </Td>
                <Td>{line.unit}</Td>
                <Td>{fmtDate(mr.requiredDate)}</Td>
                {approved ? (
                  <>
                    <Td right>{rejected ? '' : qty(line.storeQty ?? 0)}</Td>
                    <Td right>{rejected ? '' : qty(line.poQty ?? 0)}</Td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border border-t-0 border-[#D5D1C8] p-2 min-h-[40px] text-[13px]">
        <b>Remarks:</b> {mr.remarks}
        {mr.lastComment && approved ? (
          <>
            {' '}
            · <b>QS:</b> {mr.lastComment}
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-6 mt-7">
        <Signature
          title="Requested by"
          name={doc.requestedByName}
          at={mr.submittedAt ?? mr.createdAt}
        />
        <Signature
          title="Project Manager"
          name={mr.pmByName}
          at={mr.pmAt}
          note={mr.pmAt ? 'Checked & passed to QS' : ''}
        />
        <Signature
          title="Quantity Surveyor"
          name={doc.qsName}
          at={doc.qsAt}
          note={approved ? 'Approved in system' : doc.qsAt ? 'Checked & split' : ''}
        />
      </div>
    </div>
  );
}

const Field = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="flex gap-2 border-b border-dotted border-[#9a968d] py-1">
    <span className="text-mut min-w-[74px]">{label}</span>
    <b className={mono ? 'font-mono' : ''}>{value}</b>
  </div>
);

const Th = ({
  children,
  width,
  right,
}: {
  children?: React.ReactNode;
  width?: string;
  right?: boolean;
}) => (
  <th
    style={{ width }}
    className={`border border-[#D5D1C8] px-2 py-[6px] bg-bg ${right ? 'text-right' : 'text-left'}`}
  >
    {children}
  </th>
);

const Td = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <td
    className={`border border-[#D5D1C8] px-2 py-[6px] ${right ? 'text-right' : 'text-left'}`}
    style={{ height: children ? undefined : 24 }}
  >
    {children}
  </td>
);

function Signature({
  title,
  name,
  at,
  note,
}: {
  title: string;
  name?: string | null;
  at?: string | null;
  note?: string;
}) {
  return (
    <div>
      <div className="min-h-[52px] border-b border-ink flex flex-col justify-end text-xs">
        {name ? (
          <>
            <b>{name}</b>
            <span>{fmtDateTime(at)}</span>
            {note ? <span>{note}</span> : null}
          </>
        ) : (
          <>&nbsp;</>
        )}
      </div>
      <div className="text-[13px] font-semibold mt-1">{title}</div>
    </div>
  );
}
