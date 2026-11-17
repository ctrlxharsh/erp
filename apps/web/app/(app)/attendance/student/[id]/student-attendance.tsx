"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { type Status, StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";

const pad = (n: number) => String(n).padStart(2, "0");
const badge: Record<string, Status> = {
  present: "approved",
  absent: "rejected",
  leave: "pending",
  late: "late",
};

export function StudentAttendance({ studentId }: { studentId: string }) {
  const t = useTranslations("attendance");
  const trpc = useTRPC();
  const home = useQuery(trpc.home.summary.queryOptions());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const last = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const from = `${cursor.year}-${pad(cursor.month + 1)}-01`;
  const to = `${cursor.year}-${pad(cursor.month + 1)}-${pad(last)}`;
  const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
    new Date(cursor.year, cursor.month, 1),
  );
  const step = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  // "me" is a student opening their own record; their id comes from the Today summary.
  const resolvedId = studentId === "me" ? (home.data?.me?.id ?? "") : studentId;
  const query = useQuery({
    ...trpc.attendance.forStudent.queryOptions({ studentId: resolvedId, from, to }),
    enabled: Boolean(resolvedId),
  });

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Link href="/attendance" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <PageHeader title={t("myAttendance")} />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label={t("previous")} onClick={() => step(-1)}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <h2 className="min-w-40 text-center font-semibold" aria-live="polite">
          {label}
        </h2>
        <Button variant="outline" size="icon" aria-label={t("next")} onClick={() => step(1)}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : query.data ? (
        <>
          <p className="text-lg font-semibold">
            {query.data.percent === null
              ? t("noRecords")
              : t("percent", { percent: query.data.percent })}
          </p>
          <ul className="flex flex-col gap-1">
            {query.data.records.map((r) => (
              <li
                key={r.date}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  {new Intl.DateTimeFormat("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${r.date}T00:00:00Z`))}
                </span>
                <StatusBadge status={badge[r.status] ?? "pending"} label={t(r.status)} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
