'use client';

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { BoqFileDto } from '@cm/shared';
import { get } from '@mm/lib/api';
import { useToast } from '@mm/components/Toast';
import FilePreview from '@/app/FilePreview';

/**
 * Opens what the site engineer attached to an MR - drawings, photos, the BOQ - inside
 * the page.
 *
 * A file link is only good for a few minutes, so a link drawn when the page loaded has
 * usually gone stale by the time somebody clicks it. Here a fresh link is asked for at
 * the moment of the click and the file is read with the signed-in session, which also
 * works in the installed app where a new browser tab would not be signed in.
 */
export function useAttachmentViewer(mrId: string) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');

  const open = async (wanted: { id: string; name: string }) => {
    setBusy(wanted.id);
    try {
      const fresh = await get<BoqFileDto[]>(`/mrs/${mrId}/boq`);
      const link = fresh.find((f) => f.id === wanted.id);
      if (!link) throw new Error('That file is no longer attached to the MR');
      const res = await fetch(link.url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('The file could not be opened — please try again');
      const blob = await res.blob();
      setFile(new File([blob], wanted.name, { type: blob.type }));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The file could not be opened');
    } finally {
      setBusy('');
    }
  };

  const viewer = file ? <FilePreview file={file} onClose={() => setFile(null)} /> : null;
  return { open, busy, viewer };
}

/** The attached files as buttons, each opening in the viewer. */
export function AttachmentLinks({ mrId, files }: { mrId: string; files: BoqFileDto[] }) {
  const { open, busy, viewer } = useAttachmentViewer(mrId);
  return (
    <>
      <div className="flex flex-col gap-1 items-start">
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            className="font-semibold break-all text-left text-ac underline"
            disabled={busy === file.id}
            onClick={() => void open(file)}
          >
            {busy === file.id ? 'Opening…' : file.name}
          </button>
        ))}
      </div>
      {viewer}
    </>
  );
}

/**
 * A paperclip with the number of files, for a table row. The list of files is fetched
 * when it is clicked; with one file it opens straight away.
 */
export function AttachmentButton({ mrId, count }: { mrId: string; count: number }) {
  const toast = useToast();
  const { open, busy, viewer } = useAttachmentViewer(mrId);
  const [files, setFiles] = useState<BoqFileDto[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!count) return null;

  const click = async () => {
    if (files) return setFiles(null);
    setLoading(true);
    try {
      const list = await get<BoqFileDto[]>(`/mrs/${mrId}/boq`);
      if (list.length === 1) await open(list[0]!);
      else setFiles(list);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The files could not be listed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-ac font-semibold whitespace-nowrap"
        title="Open what the site engineer attached"
        aria-label={`${count} file(s) attached — open`}
        disabled={loading || !!busy}
        onClick={() => void click()}
      >
        <Paperclip className="w-[14px] h-[14px]" />
        {loading || busy ? 'Opening…' : `${count} file${count > 1 ? 's' : ''}`}
      </button>
      {files
        ? files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              className="text-xs underline text-ac text-left break-all"
              onClick={() => void open(f)}
            >
              {i + 1}. {f.name}
            </button>
          ))
        : null}
      {viewer}
    </span>
  );
}
