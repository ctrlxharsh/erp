"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

/** What the signed-in person may do in their school. Buttons only; the API checks every call. */
export function usePermissions() {
  const trpc = useTRPC();
  const query = useQuery(trpc.school.current.queryOptions());
  const granted = new Set<string>(query.data?.permissions ?? []);
  return { can: (permission: string) => granted.has(permission), ready: query.isSuccess };
}
