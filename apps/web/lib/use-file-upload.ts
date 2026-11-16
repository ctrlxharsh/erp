"use client";

import type { FilePurpose } from "@erp/domain";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

/**
 * Browser side of the upload pipeline: ask for a link, send the file straight to storage, then
 * ask the server to check and convert it. Returns the finished file's id.
 */
export function useFileUpload(purpose: FilePurpose) {
  const trpc = useTRPC();
  const request = useMutation(trpc.files.requestUpload.mutationOptions());
  const finalize = useMutation(trpc.files.finalize.mutationOptions());
  const [busy, setBusy] = useState(false);

  async function upload(file: File): Promise<string> {
    setBusy(true);
    try {
      const { fileId, upload: target } = await request.mutateAsync({
        purpose,
        contentType: file.type as "image/jpeg",
        sizeBytes: file.size,
      });
      let response: Response;
      if (target.method === "POST") {
        const form = new FormData();
        for (const [name, value] of Object.entries(target.fields)) form.append(name, value);
        form.append("file", file);
        response = await fetch(target.url, { method: "POST", body: form });
      } else {
        response = await fetch(target.url, { method: "PUT", headers: target.headers, body: file });
      }
      if (!response.ok) throw new Error("upload failed");
      await finalize.mutateAsync({ fileId });
      return fileId;
    } finally {
      setBusy(false);
    }
  }
  return { upload, busy };
}
