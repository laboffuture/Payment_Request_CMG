'use client';

import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { BOQ_ACCEPT, MAX_BOQ_BYTES, MAX_BOQ_FILES, type BoqFileDto } from '@cm/shared';
import { del, upload } from '@mm/lib/api';
import { Btn, Card, Tag } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';
import { useAttachmentViewer } from '@mm/features/mr/MrAttachments';

/**
 * Attachments on a purchase order: the vendor's quotation, a mail, a drawing.
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
): File[] {
  if (!chosen?.length) return [];
  if (room <= 0) {
    toast(TOO_MANY);
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
  if (accepted.length > room) toast(TOO_MANY);
  return accepted.slice(0, room);
}

/** Sends chosen files to a saved PO. */
export function uploadPoFiles(poId: string, files: File[]): Promise<BoqFileDto[]> {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  return upload<BoqFileDto[]>(`/pos/${poId}/files`, body);
}

function DropZone({
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

function FileRow({
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
 * The wizard's attachment box. `attached` is what an existing PO already carries;
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
  pending: File[];
  attached: BoqFileDto[];
  onPick: (files: FileList | null) => void;
  onDropPending: (index: number) => void;
  onDropAttached: (fileId: string) => void;
  busy?: boolean;
  canDetach?: boolean;
}) {
  const { open, busy: opening, viewer } = useAttachmentViewer(poId ?? '', `/pos/${poId}/files`);
  const count = pending.length + attached.length;
  const full = count >= MAX_BOQ_FILES;

  return (
    <Card className="mt-[10px]">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 style={{ margin: 0 }}>Attachments</h2>
        <span className="text-mut text-sm">optional</span>
        {count ? <Tag label={`${count} FILE${count > 1 ? 'S' : ''}`} tone="ac" /> : null}
      </div>
      <p className="text-mut text-sm mt-0 mb-3">
        The vendor&apos;s quotation, a mail, a drawing — anything the approvers should see with this
        PO. The Procurement Manager, QS and management get the same files. A vendor login does not.
      </p>

      <DropZone full={full} onPick={onPick} />

      {count ? (
        <div className="flex flex-col border border-line rounded-xl overflow-hidden mt-3">
          {attached.map((file) => (
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
          {pending.map((file, index) => (
            <FileRow
              key={`${file.name}-${file.size}-${index}`}
              name={file.name}
              size={file.size}
              note="will be attached when you save"
              onRemove={() => onDropPending(index)}
            />
          ))}
        </div>
      ) : null}
      {viewer}
    </Card>
  );
}

/** The files on a saved PO, on its page: open, add, and - until approval - remove. */
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

  const add = useAction((chosen: File[]) => uploadPoFiles(poId, chosen), {
    success: (all) => `${all.length} file${all.length > 1 ? 's' : ''} attached`,
    invalidate: [['po', poId], ['pos']],
  });
  const remove = useAction(
    (fileId: string) => del<BoqFileDto[]>(`/pos/${poId}/files/${encodeURIComponent(fileId)}`),
    { success: 'File removed', invalidate: [['po', poId], ['pos']] },
  );

  // Nothing attached and nothing this reader could add: no empty box on the page.
  if (!files.length && !canAttach) return null;

  const pick = (chosen: FileList | null) => {
    const accepted = acceptPoFiles(chosen, files, MAX_BOQ_FILES - files.length, toast);
    if (accepted.length) add.mutate(accepted);
  };

  return (
    <Card className="mb-3 noprint">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 style={{ margin: 0 }}>Attachments</h2>
        {files.length ? (
          <Tag label={`${files.length} FILE${files.length > 1 ? 'S' : ''}`} tone="ac" />
        ) : null}
      </div>

      {files.length ? (
        <div className="flex flex-col border border-line rounded-xl overflow-hidden">
          {files.map((file) => (
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
        </div>
      ) : (
        <p className="text-mut text-sm m-0">Nothing attached to this PO yet.</p>
      )}

      {canAttach ? (
        <div className="mt-3">
          <DropZone compact full={files.length >= MAX_BOQ_FILES || add.isPending} onPick={pick} />
          {add.isPending ? <p className="text-mut text-sm mb-0">Uploading…</p> : null}
        </div>
      ) : null}
      {viewer}
    </Card>
  );
}
