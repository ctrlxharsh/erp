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
  const active = me.schools.find((school) => school.id === me.activeSchoolId);
  // Permissions and logo of the active school (platform accounts have no school).
  let permissions: string[] = [];
  let logoSrc: string | undefined;
  if (active) {
    const [current, branding] = await Promise.all([api.school.current(), api.school.branding()]);
    permissions = current.permissions;
    if (branding.logoFileId) {
      logoSrc = (
        await api.files.downloadUrl({ fileId: branding.logoFileId }).catch(() => undefined)
      )?.url;
    }
  }
  return (
    <TRPCReactProvider>
      <AppShell
        school={{ name: active?.name ?? "Pixel Schoolware", logoSrc }}
        userName={me.user.name}
        isPlatform={me.platformRole !== null}
        permissions={permissions}
      >
        {children}
      </AppShell>
    </TRPCReactProvider>
  );
}
