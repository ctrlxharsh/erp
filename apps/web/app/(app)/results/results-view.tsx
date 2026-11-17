"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";
import { ReviewPanel } from "./review-panel";

/** Principal: review and publish. Students and parents: published results, report cards, admit cards. */
export function ResultsView() {
  const t = useTranslations("results");
  const trpc = useTRPC();
  const { can, ready } = usePermissions();
  const home = useQuery(trpc.home.summary.queryOptions());
  const children = home.data?.children ?? [];
  const ownId = home.data?.me?.id ?? null;
  const [childId, setChildId] = useState("");
  const studentId = children.length > 0 ? childId || children[0]?.id || "" : (ownId ?? "");
  const family = Boolean(studentId);

  const mine = useQuery({
    ...trpc.results.mine.queryOptions({ studentId }),
    enabled: family && can("results.view_own"),
  });

  if (!ready || home.isPending) return <Skeleton className="h-40 w-full max-w-2xl" />;
  if (can("marks.approve") && !family) return <ReviewPanel />;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={t("title")} />
      {children.length > 1 ? (
        <div className="max-w-xs">
          <Select
            aria-label={t("viewing")}
            value={studentId}
            onChange={(e) => setChildId(e.target.value)}
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {mine.isPending && family ? <Skeleton className="h-24 w-full" /> : null}
      {mine.data?.length === 0 ? <p className="text-muted-foreground">{t("noResults")}</p> : null}
      <ul className="flex flex-col gap-2">
        {mine.data?.map((exam) => (
          <li
            key={exam.examId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
          >
            <div>
              <p className="font-medium">{exam.examName}</p>
              <p className="text-sm text-muted-foreground">
                {t("pendingSubjects", {
                  published: exam.publishedSubjects,
                  scheduled: exam.scheduledSubjects,
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a
                  href={`/api/admit-cards/${exam.examId}/${studentId}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("admitCard")}
                </a>
              </Button>
              {exam.publishedSubjects > 0 ? (
                <Button asChild>
                  <a
                    href={`/api/report-cards/${exam.examId}/${studentId}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("reportCard")}
                  </a>
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
