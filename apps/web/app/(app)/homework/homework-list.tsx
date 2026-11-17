"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

const dueText = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
const badge = { pending: "pending", submitted: "approved", late: "late" } as const;

export function HomeworkList() {
  const t = useTranslations("homework");
  const trpc = useTRPC();
  const { can } = usePermissions();
  const home = useQuery(trpc.home.summary.queryOptions());
  const setup = useQuery({ ...trpc.setup.get.queryOptions(), enabled: can("people.view") });

  const children = home.data?.children ?? [];
  const ownId = home.data?.me?.id ?? null;
  const [childId, setChildId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const studentId = children.length > 0 ? childId || children[0]?.id : ownId;
  const isFamily = children.length > 0 || Boolean(ownId);

  const list = useQuery({
    ...trpc.classwork.homework.list.queryOptions(
      isFamily ? { studentId: studentId ?? undefined } : { sectionId: sectionId || undefined },
    ),
    enabled: home.isSuccess && (!isFamily || Boolean(studentId)),
  });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={t("title")}
        actions={
          can("homework.manage") ? (
            <Button asChild>
              <Link href="/homework/new">{t("new")}</Link>
            </Button>
          ) : null
        }
      />

      {children.length > 1 ? (
        <div className="max-w-xs">
          <Select
            aria-label={t("viewAs")}
            value={studentId ?? ""}
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
      {!isFamily && can("people.view") ? (
        <div className="max-w-xs">
          <Select
            aria-label={t("classSection")}
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">{t("allMine")}</option>
            {setup.data?.classes.flatMap((c) =>
              c.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {c.name} {s.name}
                </option>
              )),
            )}
          </Select>
        </div>
      ) : null}

      {list.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {list.data?.length === 0 ? (
        <p className="text-muted-foreground">
          {can("homework.manage") ? t("emptyTeacher") : t("empty")}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((hw) => (
          <li key={hw.id}>
            <Link
              href={`/homework/${hw.id}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-4 py-3 hover:bg-muted"
            >
              <div>
                <p className="font-medium">{hw.title}</p>
                <p className="text-sm text-muted-foreground">
                  {hw.subjectName} · {hw.sectionLabel} · {t("due", { date: dueText(hw.dueDate) })}
                </p>
              </div>
              {hw.status ? <StatusBadge status={badge[hw.status]} label={t(hw.status)} /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
