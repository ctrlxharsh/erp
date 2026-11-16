"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/setup/profile", key: "tabProfile" },
  { href: "/setup/sessions", key: "tabSessions" },
  { href: "/setup/classes", key: "tabClasses" },
  { href: "/setup/subjects", key: "tabSubjects" },
] as const;

export function SetupTabs() {
  const t = useTranslations("setup");
  const pathname = usePathname();
  return (
    <nav aria-label={t("title")} className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "min-h-10 border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
