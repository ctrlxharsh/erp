"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { type Status, StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";

export const resultBadge: Record<string, Status> = {
  draft: "draft",
  submitted: "pending",
  approved: "approved",
  rejected: "rejected",
  published: "published",
};

export function MarksList() {
  const t = useTranslations("marks");
  const trpc = useTRPC();
  const list = useQuery(trpc.marks.available.queryOptions());
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
      {list.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {list.data?.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((b) => (
          <li key={`${b.examId}-${b.sectionId}-${b.subjectId}`}>
            <Link
              href={`/marks/${b.examId}/${b.sectionId}/${b.subjectId}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-4 py-3 hover:bg-muted"
            >
              <div>
                <p className="font-medium">
                  {b.examName} · {b.subjectName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {b.sectionLabel} · {b.date}
                </p>
                {b.status === "rejected" && b.decisionComment ? (
                  <p className="text-sm text-danger">
                    {t("sentBack", { comment: b.decisionComment })}
                  </p>
                ) : null}
              </div>
              <StatusBadge status={resultBadge[b.status] ?? "draft"} label={t(b.status)} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
