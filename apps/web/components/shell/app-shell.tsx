import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MobileNav } from "./mobile-nav";
import { SchoolLogo } from "./school-logo";
import { SidebarNav } from "./sidebar-nav";
import { NotificationsButton, UserMenu } from "./user-menu";

export interface ShellSchool {
  name: string;
  logoSrc?: string;
}

/**
 * Layout for every signed-in page: sidebar, top bar with the school's identity, footer.
 * School and user come from the session once auth and school setup land.
 */
export async function AppShell({
  school,
  userName,
  isPlatform = false,
  permissions = [],
  children,
}: {
  school: ShellSchool;
  userName: string;
  isPlatform?: boolean;
  permissions?: string[];
  children: ReactNode;
}) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-screen">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-3"
      >
        {t("nav.skip")}
      </a>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <SidebarNav isPlatform={isPlatform} permissions={permissions} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border px-4">
          <MobileNav isPlatform={isPlatform} permissions={permissions} />
          <SchoolLogo name={school.name} logoSrc={school.logoSrc} />
          <span className="truncate font-semibold text-primary">{school.name}</span>
          <div className="ml-auto flex items-center gap-1">
            <NotificationsButton />
            <UserMenu name={userName} />
          </div>
        </header>
        <main id="content" className="flex-1 p-4 md:p-6">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {t("app.poweredBy")}
        </footer>
      </div>
    </div>
  );
}
