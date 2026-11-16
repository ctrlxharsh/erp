import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { getServerApi } from "@/lib/trpc/server";

// Every signed-in page depends on the visitor's session cookie.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const api = await getServerApi();
  const me = await api.session.me().catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") redirect("/auth/sign-in");
    throw error;
  });
  // Until the school logo upload ships (PR 0.7) the shell shows initials on a navy tile.
  const active = me.schools.find((school) => school.id === me.activeSchoolId);
  return (
    <TRPCReactProvider>
      <AppShell
        school={{ name: active?.name ?? "ERP" }}
        userName={me.user.name}
        isPlatform={me.platformRole !== null}
      >
        {children}
      </AppShell>
    </TRPCReactProvider>
  );
}
