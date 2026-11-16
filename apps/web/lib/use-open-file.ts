"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

/** Opens a stored file in a new tab using a short-lived link, issued after a permission check. */
export function useOpenFile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async function openFile(fileId: string) {
    try {
      const { url } = await queryClient.fetchQuery({
        ...trpc.files.downloadUrl.queryOptions({ fileId }),
        staleTime: 0,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("We could not open this file.");
    }
  };
}
