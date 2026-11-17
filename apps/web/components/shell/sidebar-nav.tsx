"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ToneIcon } from "@/components/ui/tone-icon";
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
    <nav aria-label={t("main")} className="flex flex-col gap-0.5 p-3">
      {navItems
        .filter(
          (item) =>
            (!item.platformOnly || isPlatform) &&
            (!item.permission || permissions.includes(item.permission)),
        )
        .map(({ href, labelKey, icon, tone }) => {
          const section = href.startsWith("/setup") ? "/setup" : href;
          const active = href === "/" ? pathname === "/" : pathname.startsWith(section);
          return (
            <Link
              key={labelKey}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-2 text-sm text-foreground",
                active ? "bg-tone-navy font-bold" : "font-medium hover:bg-muted",
              )}
            >
              <ToneIcon icon={icon} tone={tone} size="sm" />
              {t(labelKey)}
            </Link>
          );
        })}
    </nav>
  );
}
