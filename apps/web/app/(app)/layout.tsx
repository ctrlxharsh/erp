import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

// Placeholder identity until auth (PR 0.3) and school setup (PR 0.7) supply the real ones.
const school = { name: "Sample School" };

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell school={school} userName="Sample User">
      {children}
    </AppShell>
  );
}
