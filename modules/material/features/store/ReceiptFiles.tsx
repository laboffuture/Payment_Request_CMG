'use client';

import { MAX_BOQ_FILES } from '@cm/shared';
import { Tag } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';
import { DropZone, FileRow, acceptPoFiles } from '@mm/features/po/PoAttachments';

/**
 * The papers that go with a receipt: the delivery note, a photo of the goods.
 *
 * At site they are required - there is no storekeeper to vouch for the delivery, so the
 * note or a photo is the proof it came. In the main store they are welcome but optional.
 * The files are only chosen here; they travel with the receipt when it is submitted.
 */
export function ReceiptFiles({
  files,
  onChange,
  required,
  label = 'Delivery note / photo',
}: {
  files: File[];
  onChange: (next: File[]) => void;
  required: boolean;
  label?: string;
}) {
  const toast = useToast();
  const pick = (chosen: FileList | null) => {
    const accepted = acceptPoFiles(chosen, files, MAX_BOQ_FILES - files.length, toast);
    if (accepted.length) onChange([...files, ...accepted]);
  };

  return (
    <div className="field">
      <span className="flex items-center gap-2 flex-wrap">
        {label} {required ? '*' : <span className="text-mut font-normal">(optional)</span>}
        {files.length ? (
          <Tag label={`${files.length} FILE${files.length > 1 ? 'S' : ''}`} tone="ac" />
        ) : required ? (
          <Tag label="REQUIRED" tone="amb" />
        ) : null}
      </span>
      <DropZone compact full={files.length >= MAX_BOQ_FILES} onPick={pick} />
      {files.length ? (
        <div className="flex flex-col border border-line rounded-xl overflow-hidden mt-2">
          {files.map((file, index) => (
            <FileRow
              key={`${file.name}-${file.size}-${index}`}
              name={file.name}
              size={file.size}
              note="goes with this receipt"
              onRemove={() => onChange(files.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
