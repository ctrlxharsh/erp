import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerApi } from "@/lib/trpc/server";

// Platform screens are for Super Admin and Platform Support only. The API enforces this too;
// this just avoids showing a broken page to everyone else.
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const me = await (await getServerApi()).session.me();
  if (!me.platformRole) notFound();
  return children;
}
