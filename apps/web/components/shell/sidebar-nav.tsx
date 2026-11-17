"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { navItems } from "./nav";

export function SidebarNav({
  onNavigate,
  isPlatform = false,
  permissions = [],
}: {
  onNavigate?: () => void;
  isPlatform?: boolean;
  permissions?: string[];
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("main")} className="flex flex-col gap-1 p-3">
      {navItems
        .filter(
          (item) =>
            (!item.platformOnly || isPlatform) &&
            (!item.permission || permissions.includes(item.permission)),
        )
        .map(({ href, labelKey, icon: Icon }) => {
          const section = href.startsWith("/setup") ? "/setup" : href;
          const active = href === "/" ? pathname === "/" : pathname.startsWith(section);
          return (
            <Link
              key={labelKey}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium",
                active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(labelKey)}
            </Link>
          );
        })}
    </nav>
  );
}
