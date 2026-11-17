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
  { href: "/setup/grades", key: "tabGrades" },
] as const;

export function SetupTabs() {
  const t = useTranslations("setup");
  const pathname = usePathname();
  return (
    <nav aria-label={t("title")} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium",
              active
                ? "border-primary font-semibold text-primary"
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
