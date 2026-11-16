"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Status, StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";

export const noticeBadge: Record<string, Status> = {
  draft: "draft",
  pending_approval: "pending",
  published: "published",
  rejected: "rejected",
};
type Tab = "published" | "mine" | "approvals";

export function NoticesList() {
  const t = useTranslations("notices");
  const trpc = useTRPC();
  const { can } = usePermissions();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "published");
  const query = useQuery(trpc.notices.list.queryOptions({ tab }));
  const tabs: { key: Tab; label: string }[] = [
    { key: "published", label: t("tabPublished") },
    ...(can("notice.write") ? [{ key: "mine" as const, label: t("tabMine") }] : []),
    ...(can("notice.approve") ? [{ key: "approvals" as const, label: t("tabApprovals") }] : []),
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
        {can("notice.write") ? (
          <Button asChild>
            <Link href="/notices/new">{t("write")}</Link>
          </Button>
        ) : null}
      </div>
      {tabs.length > 1 ? (
        <div role="tablist" aria-label={t("title")} className="flex gap-1 border-b border-border">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "min-h-10 border-b-2 px-3 text-sm font-medium",
                tab === item.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {query.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {query.data?.length === 0 ? (
        <p className="text-muted-foreground">
          {tab === "approvals" ? t("emptyApprovals") : t("empty")}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {query.data?.map((notice) => (
          <li key={notice.id}>
            <Link
              href={`/notices/${notice.id}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-4 py-3 hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="font-medium">{notice.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{notice.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {notice.refLabel ? `${notice.refLabel} · ` : ""}
                  {notice.authorName ? t("by", { name: notice.authorName }) : ""}
                </p>
              </div>
              <StatusBadge
                status={noticeBadge[notice.status] ?? "draft"}
                label={notice.status === "rejected" ? t("rejectedStatus") : t(notice.status)}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
