'use client';

import { useRef, useState } from 'react';
import { useRouter } from '@mm/lib/nav';
import { useQuery } from '@tanstack/react-query';
import {
  BOQ_ACCEPT,
  MAX_BOQ_BYTES,
  MAX_BOQ_FILES,
  MSG,
  UNIT_NAMES,
  UNITS,
  type BoqFileDto,
  type ItemDto,
  type MrDetailDto,
  type Unit,
} from '@cm/shared';
import { get, post, put, del, newIdempotencyKey, upload } from '@mm/lib/api';
import { Btn, Card, PageHeader, Stack, StickyActionBar, Tag } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { useReference } from '@mm/lib/reference';
import { today } from '@mm/lib/format';

/**
 * The material request form — mobile first, because site engineers fill it in
 * on a phone (§9).
 * Prototype origin: mrForm(), lineCard(), pickerHtml(), itemList(), A.saveMR.
 */

interface FormLine {
  id?: string;
  itemId: string | null;
  itemCode?: string;
  name: string;
  unit: string;
  category: string;
  newItemName: string;
  newUnit: Unit;
  newCategory: string;
  newSpec: string;
  qty: string;
  /** what is wanted, in the engineer's words — required to submit */
  description: string;
  /** free text: "2400 × 1200 × 12.5 mm", "M20", "6 m lengths" … */
  measurement: string;
  boqRef: string;
  remarks: string;
  rejected?: boolean;
}

/** A line starts with the item's own unit; the engineer may override it. */
const blankLine = (over: Partial<FormLine>): FormLine => ({
  itemId: null,
  name: '',
  unit: 'Nos',
  category: '',
  newItemName: '',
  newUnit: 'Nos',
  newCategory: '',
  newSpec: '',
  qty: '',
  description: '',
  measurement: '',
  boqRef: '',
  remarks: '',
  ...over,
});

export function MrForm({ existing }: { existing?: MrDetailDto }) {
  const router = useRouter();
  const toast = useToast();
  const reference = useReference();

  const [projectId, setProjectId] = useState(existing?.projectId ?? '');
  const [requiredDate, setRequiredDate] = useState(existing?.requiredDate ?? '');
  const [remarks, setRemarks] = useState(existing?.remarks ?? '');
  const [lines, setLines] = useState<FormLine[]>(
    existing?.lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      itemCode: l.itemCode ?? undefined,
      name: l.name,
      unit: l.unit,
      category: l.category,
      newItemName: l.newItemName,
      newUnit: (l.newUnit || 'Nos') as Unit,
      newCategory: l.newCategory,
      newSpec: l.newSpec,
      qty: String(l.qty ?? ''),
      description: l.description ?? '',
      measurement: l.measurement ?? '',
      boqRef: l.boqRef,
      remarks: l.remarks,
      rejected: l.lineStatus === 'REJECTED',
    })) ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // The bill of quantities is optional — the MR is raised with or without it.
  // `pending` are files chosen but not yet sent; `attached` are already stored.
  const [pending, setPending] = useState<File[]>([]);
  const [attached, setAttached] = useState<BoqFileDto[]>(existing?.boqFiles ?? []);

  const payload = (submit: boolean) => ({
    projectId,
    requiredDate,
    remarks,
    submit,
    rv: existing?.rv,
    lines: lines
      .filter((l) => !l.rejected)
      .map((l) => ({
        id: l.id,
        itemId: l.itemId,
        newItemName: l.itemId ? '' : l.newItemName,
        newUnit: l.itemId ? undefined : l.newUnit,
        newCategory: l.itemId ? '' : l.newCategory,
        newSpec: l.itemId ? '' : l.newSpec,
        qty: Number(l.qty) || 0,
        description: l.description,
        measurement: l.measurement,
        unit: (l.itemId ? l.unit : l.newUnit) as Unit,
        boqRef: l.boqRef,
        remarks: l.remarks,
      })),
  });

  const sendBoq = async (mrId: string) => {
    if (!pending.length) return;
    const body = new FormData();
    for (const file of pending) body.append('files', file);
    setAttached(await upload<BoqFileDto[]>(`/mrs/${mrId}/boq`, body));
    setPending([]);
  };

  const save = useAction(
    async (submit: boolean) => {
      const write = (body: unknown, id?: string) =>
        id
          ? put<{ id: string; no: string }>(`/mrs/${id}`, body)
          : post<{ id: string; no: string }>('/mrs', body, newIdempotencyKey());

      // A BOQ needs an MR to belong to, and the MR stops being editable the
      // moment it reaches the PM — so save it first, attach, then submit.
      if (pending.length && submit) {
        const draft = await write(payload(false), existing?.id);
        await sendBoq(draft.id);
        return write({ ...payload(true), rv: undefined }, draft.id);
      }

      const mr = await write(payload(submit), existing?.id);
      await sendBoq(mr.id);
      return mr;
    },
    {
      invalidate: [['mrs'], ['pool']],
      onDone: (mr) => {
        toast(mr.no ? `${mr.no} sent to the Project Manager` : 'Draft saved');
        router.push(`/mrs/${mr.id}`);
      },
    },
  );

  const dropAttached = useAction(
    (fileId: string) =>
      del<BoqFileDto[]>(
        `/mrs/${existing!.id}/boq/${encodeURIComponent(fileId)}`,
      ),
    {
      success: 'File removed',
      invalidate: [['mr', existing?.id ?? '']],
      onDone: (files) => setAttached(files),
    },
  );

  /** Adds newly chosen files to the queue, rejecting the ones that cannot go. */
  const pickBoq = (chosen: FileList | null) => {
    if (!chosen?.length) return;

    const room = MAX_BOQ_FILES - attached.length - pending.length;
    if (room <= 0) return toast(MSG.boqTooMany(MAX_BOQ_FILES));

    const accepted: File[] = [];
    for (const file of Array.from(chosen)) {
      if (file.size > MAX_BOQ_BYTES) {
        toast(`${file.name}: ${MSG.boqTooLarge}`);
        continue;
      }
      // Choosing the same file twice is a slip, not an intention.
      const already = [...pending, ...accepted].some(
        (f) => f.name === file.name && f.size === file.size,
      );
      if (!already) accepted.push(file);
    }

    if (accepted.length > room) toast(MSG.boqTooMany(MAX_BOQ_FILES));
    setPending((rows) => [...rows, ...accepted.slice(0, room)]);
  };

  const dropPending = (index: number) =>
    setPending((rows) => rows.filter((_, i) => i !== index));

  const remove = useAction(() => del(`/mrs/${existing!.id}`), {
    success: 'Draft deleted',
    invalidate: [['mrs']],
    onDone: () => router.push('/mrs'),
  });

  const submit = (isSubmit: boolean) => {
    // Checked here for a fast answer; the API enforces the same rules (§8).
    if (!projectId) return toast(MSG.mrNoProject);
    if (isSubmit) {
      if (!requiredDate) return toast(MSG.mrNoDate);
      if (requiredDate < today()) return toast(MSG.mrDatePast);
      const active = lines.filter((l) => !l.rejected);
      if (!active.length) return toast(MSG.mrNoLines);
      if (active.some((l) => !(Number(l.qty) > 0))) return toast(MSG.mrQtyRequired);

      const undescribed = active.find((l) => !l.description.trim());
      if (undescribed) {
        return toast(
          MSG.mrDescriptionRequiredFor(
            undescribed.itemId ? undescribed.name : undescribed.newItemName,
          ),
        );
      }
    }
    save.mutate(isSubmit);
  };

  const setLine = (index: number, patch: Partial<FormLine>) =>
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const active = lines.filter((l) => !l.rejected);

  // One list ordered by code, the other by name, so each dropdown reads the
  // way the person scanning it expects.
  const byCode = [...reference.projects].sort((a, b) => a.code.localeCompare(b.code));
  const byName = [...reference.projects].sort((a, b) => a.name.localeCompare(b.name));
  const chosenProject = reference.projects.find((p) => p.id === projectId) ?? null;

  return (
    <div className="max-w-[620px]">
      <PageHeader
        title={existing ? `Edit ${existing.no || 'draft'}` : 'New material request'}
        subtitle="One project and one required date per MR. On submit it goes to the Project Manager, and then to QS."
      />

      {existing?.status === 'SENT_BACK' && existing.lastComment ? (
        <div className="warn mb-3">
          <b>Sent back{existing.lastCommentRole ? ` by ${existing.lastCommentRole}` : ''}:</b>{' '}
          {existing.lastComment}
        </div>
      ) : null}

      <Card>
        <Stack>
          {/* The same project, chosen by whichever the engineer knows — the
              two lists are the same projects and stay in step. */}
          <div className="flex gap-[10px] flex-wrap">
            <label className="field basis-[180px] grow">
              Project code *
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select code</option>
                {byCode.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
            </label>

            <label className="field basis-[240px] grow-[2]">
              Project name *
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select name</option>
                {byName.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {chosenProject ? (
            <div className="text-mut text-sm">
              Raising for <b className="text-ink">{chosenProject.code}</b> ·{' '}
              {chosenProject.name}
            </div>
          ) : null}

          <label className="field">
            Required date * — applies to every item
            <input
              type="date"
              min={today()}
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
            />
          </label>

          <div className="text-mut text-sm">
            Items needed on another date go in a separate MR.
          </div>
        </Stack>
      </Card>

      <h2>Items ({active.length})</h2>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) =>
          line.rejected ? null : (
            <LineCard
              key={line.id ?? `new-${index}`}
              line={line}
              onChange={(patch) => setLine(index, patch)}
              onRemove={() => setLines((rows) => rows.filter((_, i) => i !== index))}
            />
          ),
        )}
        {!active.length ? <div className="text-mut">No items yet.</div> : null}
      </div>

      <Btn
        className="w-full my-3 border-[1.5px] border-ac text-ac"
        onClick={() => setPickerOpen(true)}
      >
        + Add item
      </Btn>

      <Card>
        <Stack>
          <label className="field">
            MR remarks
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>

          <BoqUpload
            pending={pending}
            attached={attached}
            onPick={pickBoq}
            onDropPending={dropPending}
            onDropAttached={(fileId) => dropAttached.mutate(fileId)}
            busy={dropAttached.isPending}
          />
        </Stack>
      </Card>

      <StickyActionBar>
        <div>
          {existing?.status === 'DRAFT' ? (
            <Btn variant="danger" onClick={() => remove.mutate()}>
              Delete draft
            </Btn>
          ) : null}
        </div>
        <div className="flex gap-[10px]">
          <Btn disabled={save.isPending} onClick={() => submit(false)}>
            Save draft
          </Btn>
          <Btn variant="primary" disabled={save.isPending} onClick={() => submit(true)}>
            Submit to PM
          </Btn>
        </div>
      </StickyActionBar>

      {pickerOpen ? (
        <ItemPicker
          usedItemIds={lines.filter((l) => l.itemId).map((l) => l.itemId!)}
          onClose={() => setPickerOpen(false)}
          onPick={(line) => {
            setLines((rows) => [...rows, line]);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The bill-of-quantities upload.
 *
 * A bare <input type="file"> is close to invisible and takes one file at a
 * time, so this is a drop area with a button people can actually see, a list of
 * everything chosen, and a Remove on each row — files waiting to be sent and
 * files already stored alike.
 */
function BoqUpload({
  pending,
  attached,
  onPick,
  onDropPending,
  onDropAttached,
  busy,
}: {
  pending: File[];
  attached: BoqFileDto[];
  onPick: (files: FileList | null) => void;
  onDropPending: (index: number) => void;
  onDropAttached: (fileId: string) => void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const count = pending.length + attached.length;
  const full = count >= MAX_BOQ_FILES;

  const choose = () => input.current?.click();

  return (
    <div className="field">
      <span className="flex items-center gap-2 flex-wrap">
        Bill of quantities (optional)
        {count ? <Tag label={`${count} FILE${count > 1 ? 'S' : ''}`} tone="ac" /> : null}
      </span>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!full) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!full) onPick(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-2 text-center rounded-card border-[1.5px] border-dashed px-4 py-6 ${
          over ? 'border-ac bg-[#F2F6FC]' : 'border-line bg-grys'
        } ${full ? 'opacity-60' : ''}`}
      >
        <Btn variant="primary" disabled={full} onClick={choose}>
          Choose files
        </Btn>
        <span className="text-mut text-sm">
          {full
            ? `That is the limit of ${MAX_BOQ_FILES} files`
            : 'or drag them here — you can pick several at once'}
        </span>
        <span className="text-mut text-xs">
          PDF, photo or spreadsheet · up to 5 MB each · up to {MAX_BOQ_FILES} files
        </span>

        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          accept={BOQ_ACCEPT}
          onChange={(e) => {
            onPick(e.target.files);
            // Let the same file be picked again after it is removed.
            e.target.value = '';
          }}
        />
      </div>

      {count ? (
        <div className="flex flex-col border border-line rounded-xl overflow-hidden mt-2">
          {attached.map((file) => (
            <BoqRow
              key={file.id}
              name={file.name}
              size={file.size}
              href={file.url}
              note="attached"
              busy={busy}
              onRemove={() => onDropAttached(file.id)}
            />
          ))}
          {pending.map((file, index) => (
            <BoqRow
              key={`${file.name}-${file.size}-${index}`}
              name={file.name}
              size={file.size}
              note="will be attached when you save"
              onRemove={() => onDropPending(index)}
            />
          ))}
        </div>
      ) : null}

      <span className="text-mut text-sm">
        The MR can be raised without a BOQ. Once submitted, the PM and QS see
        whatever you attach here.
      </span>
    </div>
  );
}

/** One file in the list, with the Remove that was missing before. */
function BoqRow({
  name,
  size,
  href,
  note,
  busy,
  onRemove,
}: {
  name: string;
  size: number;
  href?: string;
  note: string;
  busy?: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-[14px] py-[10px] border-b border-line2 last:border-b-0 bg-white">
      <span className="min-w-0">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="font-semibold">
            {name}
          </a>
        ) : (
          <span className="font-semibold break-all">{name}</span>
        )}
        <div className="text-mut text-xs">
          {fileSize(size)} · {note}
        </div>
      </span>
      <Btn small variant="danger" disabled={busy} onClick={onRemove}>
        Remove
      </Btn>
    </div>
  );
}

const fileSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Prototype: lineCard(l, i) — a card per line, not a table row. */
function LineCard({
  line,
  onChange,
  onRemove,
}: {
  line: FormLine;
  onChange: (patch: Partial<FormLine>) => void;
  onRemove: () => void;
}) {
  const isNew = !line.itemId;

  return (
    <div
      className={`bg-white border rounded-card p-[14px] flex flex-col gap-[10px] ${
        isNew ? 'border-[1.5px] border-dashed border-[#C98A3E]' : 'border-line'
      }`}
    >
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <div className="font-semibold">{isNew ? line.newItemName : line.name}</div>
          <div className="text-mut font-mono text-xs">
            {line.itemCode ? `${line.itemCode} · ${line.category} · ` : ''}
            Unit: {isNew ? line.newUnit : line.unit}
            {isNew && line.newCategory ? ` · ${line.newCategory}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-[10px]">
          {isNew ? <Tag label="NEW" tone="amb" /> : <Tag label="MASTER" tone="ac" />}
          <Btn small variant="danger" onClick={onRemove}>
            Remove
          </Btn>
        </div>
      </div>

      {/* Compulsory, and first — it is what everyone downstream reads. */}
      <label className="field">
        <span className="flex items-center gap-2">
          Description *
          {line.description.trim() ? null : (
            <Tag label="REQUIRED TO SUBMIT" tone="amb" />
          )}
        </span>
        <textarea
          rows={2}
          maxLength={400}
          placeholder="What exactly is needed — grade, finish, make, where it goes"
          className={line.description.trim() ? '' : 'border-[#C98A3E]'}
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </label>

      <div className="flex flex-wrap gap-[10px]">
        <label className="field basis-[130px] grow-0">
          Qty *
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            className="w-24 font-semibold"
            value={line.qty}
            onChange={(e) => onChange({ qty: e.target.value })}
          />
        </label>
        <label className="field basis-[110px] grow-0">
          Unit *
          <select
            value={isNew ? line.newUnit : line.unit}
            onChange={(e) =>
              onChange(
                isNew
                  ? { newUnit: e.target.value as Unit, unit: e.target.value }
                  : { unit: e.target.value },
              )
            }
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_NAMES[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="field flex-1 min-w-[180px]">
          Measurement
          <input
            maxLength={120}
            placeholder="2400 × 1200 × 12.5 mm"
            value={line.measurement}
            onChange={(e) => onChange({ measurement: e.target.value })}
          />
        </label>
        <label className="field basis-[110px] grow-0">
          B.O.Q Ref
          <input
            maxLength={30}
            value={line.boqRef}
            onChange={(e) => onChange({ boqRef: e.target.value })}
          />
        </label>
        <label className="field flex-1 min-w-[180px]">
          Remarks
          <input
            maxLength={250}
            placeholder="Area, drawing ref, spec"
            value={line.remarks}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        </label>
      </div>

      {isNew ? (
        <div className="warn">Not in item master — QS approves or maps it.</div>
      ) : null}
    </div>
  );
}

/** Prototype: pickerHtml() — choose from the list, or describe a new item. */
function ItemPicker({
  usedItemIds,
  onClose,
  onPick,
}: {
  usedItemIds: string[];
  onClose: () => void;
  onPick: (line: FormLine) => void;
}) {
  const toast = useToast();
  const reference = useReference();
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const [draft, setDraft] = useState({
    name: '',
    unit: 'Nos' as Unit,
    category: reference.categories[0]?.name ?? '',
    spec: '',
  });

  const params = new URLSearchParams({ limit: '50' });
  if (search) params.set('q', search);
  if (category) params.set('category', category);

  const items = useQuery({
    queryKey: ['items', search, category],
    queryFn: () => get<ItemDto[]>(`/items?${params}`),
    enabled: mode === 'list',
  });

  const addNew = () => {
    const name = draft.name.trim();
    if (!name || !draft.category) return toast(MSG.mrItemNameAndCategory);

    onPick(
      blankLine({
        name,
        unit: draft.unit,
        category: draft.category,
        newItemName: name + (draft.spec ? ` — ${draft.spec}` : ''),
        newUnit: draft.unit,
        newCategory: draft.category,
        newSpec: draft.spec,
      }),
    );
  };

  return (
    <Modal title="Add item" onClose={onClose}>
      <div className="grid grid-cols-2 bg-grys rounded-xl p-1 gap-1">
        {(['list', 'new'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`min-h-[40px] rounded-[9px] ${
              mode === value ? 'bg-white font-semibold shadow-sm' : ''
            }`}
          >
            {value === 'list' ? 'Choose from list' : 'Add new item'}
          </button>
        ))}
      </div>

      {mode === 'list' ? (
        <>
          <div className="flex gap-[10px] flex-wrap">
            <select
              aria-label="Category"
              className="basis-[150px]"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {reference.categories.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              className="flex-1"
              placeholder="Search code or name"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col border border-line rounded-xl overflow-hidden max-h-[340px] overflow-y-auto">
            {(items.data ?? []).map((item) => {
              const used = usedItemIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  disabled={used}
                  onClick={() =>
                    onPick(
                      blankLine({
                        itemId: item.id,
                        itemCode: item.code,
                        name: item.name,
                        unit: item.unit,
                        category: item.category,
                      }),
                    )
                  }
                  className="flex justify-between gap-2 min-h-[56px] px-[14px] py-2 border-b border-line2 bg-white text-left disabled:opacity-45"
                >
                  <span>
                    <span className="font-semibold">{item.name}</span>
                    <br />
                    <span className="text-mut font-mono text-xs">
                      {item.code} · {item.unit}
                      {item.brand ? ` · ${item.brand}` : ''}
                      {item.packing ? ` · ${item.packing}` : ''}
                      {used ? ' · already added' : ''}
                    </span>
                  </span>
                  <span className="text-mut">
                    {item.category}
                    {item.subCategory ? ` / ${item.subCategory}` : ''}
                  </span>
                </button>
              );
            })}
            {items.isLoading ? <div className="p-[14px] text-mut">Loading…</div> : null}
            {!items.isLoading && !(items.data ?? []).length ? (
              <div className="p-[14px] text-mut">No match</div>
            ) : null}
          </div>

          <div className="warn">
            Can&apos;t find it? Switch to <b>Add new item</b> — QS approves it.
          </div>
        </>
      ) : (
        <>
          <label className="field">
            Item name *
            <input
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div className="flex gap-[10px]">
            <label className="field flex-1">
              Unit *
              <select
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value as Unit })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                {UNIT_NAMES[u]}
              </option>
                ))}
              </select>
            </label>
            <label className="field flex-1">
              Category *
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {reference.categories.map((c) => (
                  <option key={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Spec / brand (optional)
            <input
              maxLength={120}
              value={draft.spec}
              onChange={(e) => setDraft({ ...draft, spec: e.target.value })}
            />
          </label>
          <Btn variant="primary" onClick={addNew}>
            Add to MR
          </Btn>
        </>
      )}
    </Modal>
  );
}
