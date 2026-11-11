'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Paperclip, Plus } from 'lucide-react';
import {
  BOQ_ACCEPT,
  MAX_BOQ_BYTES,
  MAX_BOQ_FILES,
  MAX_PO_FILES_PER_KIND,
  PO_FILE_KINDS,
  type BoqFileDto,
  type PoFileKind,
} from '@cm/shared';
import { del, upload } from '@mm/lib/api';
import { Btn, Card, Tag } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { useAttachmentViewer } from '@mm/features/mr/MrAttachments';

/**
 * Attachments on a purchase order, in two tiles: the vendors' quotations and the
 * comparison of them. Each tile has its own + to add as many files as are needed.
 *
 * Optional throughout. In the wizard the files are only chosen - the PO does not exist
 * until it is saved - and they are sent the moment it is. On the PO page they can be
 * opened by everybody who works the PO, added to by procurement, and taken off again
 * until the PO is approved.
 */

const fileSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const TOO_LARGE = 'is larger than 5 MB — compress it and try again';
const TOO_MANY = `Attach at most ${MAX_BOQ_FILES} files to a PO`;

/** Keeps the files that can go, and says why about the ones that cannot. */
export function acceptPoFiles(
  chosen: FileList | File[] | null,
  taken: { name: string; size: number }[],
  room: number,
  toast: (message: string) => void,
  tooMany: string = TOO_MANY,
): File[] {
  if (!chosen?.length) return [];
  if (room <= 0) {
    toast(tooMany);
    return [];
  }
  const accepted: File[] = [];
  for (const file of Array.from(chosen)) {
    if (file.size > MAX_BOQ_BYTES) {
      toast(`${file.name} ${TOO_LARGE}`);
      continue;
    }
    // The same file chosen twice is a slip, not an intention.
    const already = [...taken, ...accepted].some((f) => f.name === file.name && f.size === file.size);
    if (!already) accepted.push(file);
  }
  if (accepted.length > room) toast(tooMany);
  return accepted.slice(0, room);
}

/** Sends chosen files to a saved PO, into one tile - in turns of ten, the most one upload takes. */
export async function uploadPoFiles(poId: string, files: File[], kind: PoFileKind): Promise<BoqFileDto[]> {
  let all: BoqFileDto[] = [];
  for (let i = 0; i < files.length; i += MAX_BOQ_FILES) {
    const body = new FormData();
    body.append('kind', kind);
    for (const file of files.slice(i, i + MAX_BOQ_FILES)) body.append('files', file);
    all = await upload<BoqFileDto[]>(`/pos/${poId}/files`, body);
  }
  return all;
}

export const KIND_TILE: Record<PoFileKind, { title: string; one: string; many: string; empty: string; hint: string }> = {
  QUOTATION: {
    title: 'Quotations',
    one: 'quotation',
    many: 'quotations',
    empty: 'No quotations yet. Press + to add one.',
    hint: "Each vendor's quotation for this order.",
  },
  COMPARISON: {
    title: 'Comparison',
    one: 'comparison file',
    many: 'comparison files',
    empty: 'No comparison yet. Press + to add one.',
    hint: 'The comparison of the quotations - the sheet that shows why this vendor.',
  },
};

/** Files from before the tiles have no kind and read as quotations. */
export const kindOf = (file: { kind?: string }): PoFileKind =>
  file.kind === 'COMPARISON' ? 'COMPARISON' : 'QUOTATION';

export const tooManyOf = (kind: PoFileKind) =>
  `Attach at most ${MAX_PO_FILES_PER_KIND} ${KIND_TILE[kind].many} to a PO`;

export function DropZone({
  full,
  onPick,
  compact = false,
}: {
  full: boolean;
  onPick: (files: FileList | null) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
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
      className={`flex flex-col items-center gap-2 text-center rounded-card border-[1.5px] border-dashed px-4 ${
        compact ? 'py-4' : 'py-6'
      } ${over ? 'border-ac bg-[#F2F6FC]' : 'border-line bg-grys'} ${full ? 'opacity-60' : ''}`}
    >
      <Btn disabled={full} onClick={() => input.current?.click()}>
        <Paperclip className="w-[14px] h-[14px]" aria-hidden /> Choose files
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
  );
}

export function FileRow({
  name,
  size,
  note,
  onOpen,
  opening,
  onRemove,
  removing,
}: {
  name: string;
  size: number;
  note?: string;
  onOpen?: () => void;
  opening?: boolean;
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-[14px] py-[10px] border-b border-line2 last:border-b-0 bg-white">
      <span className="min-w-0">
        {onOpen ? (
          <button
            type="button"
            className="font-semibold break-all text-left text-ac underline"
            disabled={opening}
            onClick={onOpen}
          >
            {opening ? 'Opening…' : name}
          </button>
        ) : (
          <span className="font-semibold break-all">{name}</span>
        )}
        <div className="text-mut text-xs">
          {fileSize(size)}
          {note ? ` · ${note}` : ''}
        </div>
      </span>
      {onRemove ? (
        <Btn small variant="danger" disabled={removing} onClick={onRemove}>
          Remove
        </Btn>
      ) : null}
    </div>
  );
}

/**
 * One tile: a title, a count, a + that opens the file picker, and the files under it.
 * Files can also be dropped anywhere on the tile.
 */
export function FileTile({
  kind,
  count,
  canAdd,
  onPick,
  busy = false,
  children,
}: {
  kind: PoFileKind;
  count: number;
  canAdd: boolean;
  onPick: (files: FileList | null) => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const tile = KIND_TILE[kind];
  const full = count >= MAX_PO_FILES_PER_KIND;
  const open = canAdd && !full && !busy;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (open) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (open) onPick(e.dataTransfer.files);
      }}
      className={`flex flex-col rounded-xl border-[1.5px] p-3 min-w-0 ${
        over ? 'border-ac border-dashed bg-[#F2F6FC]' : 'border-line bg-grys'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="m-0 text-[15px] font-semibold">{tile.title}</h3>
          {count ? <Tag label={String(count)} tone="ac" /> : null}
        </div>
        {canAdd ? (
          <button
            type="button"
            className="mm-btn small"
            disabled={!open}
            aria-label={`Add ${tile.one}`}
            title={full ? tooManyOf(kind) : `Add ${tile.one}`}
            onClick={() => input.current?.click()}
          >
            <Plus className="w-[14px] h-[14px]" aria-hidden /> Add
          </button>
        ) : null}
      </div>
      <p className="text-mut text-xs mt-0 mb-2">{tile.hint}</p>
      {count ? (
        <div className="flex flex-col border border-line rounded-xl overflow-hidden">{children}</div>
      ) : (
        <button
          type="button"
          disabled={!open}
          onClick={() => input.current?.click()}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-line bg-white py-5 text-mut text-sm disabled:cursor-default"
        >
          {canAdd ? (
            <>
              <Plus className="w-5 h-5" aria-hidden />
              {tile.empty}
            </>
          ) : (
            `No ${tile.many} attached.`
          )}
        </button>
      )}
      {busy ? <p className="text-mut text-sm mb-0 mt-2">Uploading…</p> : null}
      {canAdd ? (
        <p className="text-mut text-xs mb-0 mt-2">
          PDF, photo or spreadsheet · up to 5 MB each · drop files here or press +
        </p>
      ) : null}
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
  );
}

export type PendingPoFile = { file: File; kind: PoFileKind };

/**
 * The wizard's attachment tiles. `attached` is what an existing PO already carries;
 * `pending` is what was chosen in this sitting and goes up when the PO is saved.
 */
export function PoFilePicker({
  poId,
  pending,
  attached,
  onPick,
  onDropPending,
  onDropAttached,
  busy = false,
  canDetach = true,
}: {
  poId?: string;
  pending: PendingPoFile[];
  attached: BoqFileDto[];
  onPick: (kind: PoFileKind, files: FileList | null) => void;
  onDropPending: (index: number) => void;
  onDropAttached: (fileId: string) => void;
  busy?: boolean;
  canDetach?: boolean;
}) {
  const { open, busy: opening, viewer } = useAttachmentViewer(poId ?? '', `/pos/${poId}/files`);
  const count = pending.length + attached.length;

  return (
    <Card className="mt-[10px]">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 style={{ margin: 0 }}>Attachments</h2>
        <span className="text-mut text-sm">optional</span>
        {count ? <Tag label={`${count} FILE${count > 1 ? 'S' : ''}`} tone="ac" /> : null}
      </div>
      <p className="text-mut text-sm mt-0 mb-3">
        The Procurement Manager, QS and management see the same files. A vendor login does not.
      </p>
      <div className="po-file-tiles">
        {PO_FILE_KINDS.map((kind) => {
          const mineAttached = attached.filter((f) => kindOf(f) === kind);
          const minePending = pending.map((p, index) => ({ ...p, index })).filter((p) => p.kind === kind);
          return (
            <FileTile
              key={kind}
              kind={kind}
              count={mineAttached.length + minePending.length}
              canAdd
              onPick={(files) => onPick(kind, files)}
            >
              {mineAttached.map((file) => (
                <FileRow
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  note="attached"
                  onOpen={poId ? () => void open(file) : undefined}
                  opening={opening === file.id}
                  onRemove={canDetach ? () => onDropAttached(file.id) : undefined}
                  removing={busy}
                />
              ))}
              {minePending.map(({ file, index }) => (
                <FileRow
                  key={`${file.name}-${file.size}-${index}`}
                  name={file.name}
                  size={file.size}
                  note="will be attached when you save"
                  onRemove={() => onDropPending(index)}
                />
              ))}
            </FileTile>
          );
        })}
      </div>
      {viewer}
    </Card>
  );
}

/** The files on a saved PO, on its page: open, add with each tile's +, and - until approval - remove. */
export function PoFiles({
  poId,
  files,
  canAttach,
  canDetach,
}: {
  poId: string;
  files: BoqFileDto[];
  canAttach: boolean;
  canDetach: boolean;
}) {
  const toast = useToast();
  const { open, busy: opening, viewer } = useAttachmentViewer(poId, `/pos/${poId}/files`);
  const [adding, setAdding] = useState<PoFileKind | ''>('');

  const add = useAction(
    async ({ chosen, kind }: { chosen: File[]; kind: PoFileKind }) => {
      await uploadPoFiles(poId, chosen, kind);
      return { count: chosen.length, kind };
    },
    {
      success: ({ count, kind }) => `${count} ${count > 1 ? KIND_TILE[kind].many : KIND_TILE[kind].one} attached`,
      invalidate: [['po', poId], ['pos']],
      onDone: () => setAdding(''),
    },
  );
  const remove = useAction(
    (fileId: string) => del<BoqFileDto[]>(`/pos/${poId}/files/${encodeURIComponent(fileId)}`),
    { success: 'File removed', invalidate: [['po', poId], ['pos']] },
  );

  // Nothing attached and nothing this reader could add: no empty box on the page.
  if (!files.length && !canAttach) return null;

  const pick = (kind: PoFileKind, chosen: FileList | null) => {
    const mine = files.filter((f) => kindOf(f) === kind);
    const accepted = acceptPoFiles(chosen, mine, MAX_PO_FILES_PER_KIND - mine.length, toast, tooManyOf(kind));
    if (accepted.length) {
      setAdding(kind);
      add.mutate({ chosen: accepted, kind });
    }
  };

  return (
    <Card className="mb-3 noprint">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h2 style={{ margin: 0 }}>Attachments</h2>
        {files.length ? (
          <Tag label={`${files.length} FILE${files.length > 1 ? 'S' : ''}`} tone="ac" />
        ) : null}
      </div>
      <div className="po-file-tiles">
        {PO_FILE_KINDS.map((kind) => {
          const mine = files.filter((f) => kindOf(f) === kind);
          return (
            <FileTile
              key={kind}
              kind={kind}
              count={mine.length}
              canAdd={canAttach}
              busy={add.isPending && adding === kind}
              onPick={(chosen) => pick(kind, chosen)}
            >
              {mine.map((file) => (
                <FileRow
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  onOpen={() => void open(file)}
                  opening={opening === file.id}
                  onRemove={canDetach ? () => remove.mutate(file.id) : undefined}
                  removing={remove.isPending}
                />
              ))}
            </FileTile>
          );
        })}
      </div>
      {viewer}
    </Card>
  );
}
