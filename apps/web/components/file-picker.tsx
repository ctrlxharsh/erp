"use client";

import type { FilePurpose } from "@erp/domain";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/lib/use-file-upload";

export interface PickedFile {
  id: string;
  name: string;
}

/** Lets someone attach files. Each one goes straight to storage and is checked by the server. */
export function FilePicker({
  purpose,
  value,
  onChange,
  max = 1,
  label,
  busyLabel,
  failedMessage,
  removeLabel,
}: {
  purpose: FilePurpose;
  value: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  max?: number;
  label: string;
  busyLabel: string;
  failedMessage: string;
  removeLabel: string;
}) {
  const { upload, busy } = useFileUpload(purpose);
  const input = useRef<HTMLInputElement>(null);
  const [, setTick] = useState(0);
  const t = useTranslations("homework");

  async function choose(files: FileList | null) {
    if (!files) return;
    let next = [...value];
    for (const file of Array.from(files)) {
      if (next.length >= max) break;
      try {
        next = [...next, { id: await upload(file), name: file.name }];
        onChange(next);
        setTick((n) => n + 1);
      } catch (error) {
        toast.error(
          error instanceof Error && error.message !== "upload failed"
            ? error.message
            : failedMessage,
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-sm">
        {value.map((file) => (
          <li
            key={file.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
          >
            <span className="truncate">{file.name}</span>
            <Button variant="ghost" onClick={() => onChange(value.filter((f) => f.id !== file.id))}>
              {removeLabel}
            </Button>
          </li>
        ))}
      </ul>
      {value.length < max ? (
        <>
          <input
            ref={input}
            type="file"
            multiple={max > 1}
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={label}
            onChange={(e) => {
              void choose(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            className="self-start"
            loading={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? busyLabel : label}
          </Button>
        </>
      ) : null}
      <span className="sr-only">{t("files")}</span>
    </div>
  );
}
