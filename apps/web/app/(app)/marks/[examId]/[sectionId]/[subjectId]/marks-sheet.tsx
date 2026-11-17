"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { resultBadge } from "../../../marks-list";

interface Row {
  marks: string;
  absent: boolean;
}

export function MarksSheet(key: { examId: string; sectionId: string; subjectId: string }) {
  const t = useTranslations("marks");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sheet = useQuery(trpc.marks.sheet.queryOptions(key));
  const save = useMutation(trpc.marks.save.mutationOptions());
  const submit = useMutation(trpc.marks.submit.mutationOptions());
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    if (sheet.data)
      setRows(
        Object.fromEntries(
          sheet.data.students.map((s) => [
            s.id,
            { marks: s.marks === null ? "" : String(s.marks), absent: s.absent },
          ]),
        ),
      );
  }, [sheet.data]);

  if (sheet.isPending) return <Skeleton className="h-48 w-full max-w-2xl" />;
  if (sheet.isError || !sheet.data) return <p role="alert">{sheet.error?.message}</p>;
  const { batch, canEdit, students } = sheet.data;

  const entries = () =>
    students.map((s) => {
      const row = rows[s.id] ?? { marks: "", absent: false };
      return {
        studentId: s.id,
        absent: row.absent,
        marks: row.absent || row.marks === "" ? null : Number(row.marks),
      };
    });
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.marks.sheet.queryKey(key) });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/marks" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <PageHeader
        title={
          <>
            {batch.examName} · {batch.subjectName}
          </>
        }
        description={
          <>
            {batch.sectionLabel} · {t("marksOutOf", { max: batch.maxMarks })}
          </>
        }
        actions={
          <StatusBadge status={resultBadge[batch.status] ?? "draft"} label={t(batch.status)} />
        }
      />
      {batch.status === "rejected" && batch.decisionComment ? (
        <p role="status" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {t("sentBack", { comment: batch.decisionComment })}
        </p>
      ) : null}
      {!canEdit ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {t("readOnly")}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {students.map((student) => {
          const row = rows[student.id] ?? { marks: "", absent: false };
          return (
            <li
              key={student.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="font-medium">{student.fullName}</span>
              <span className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={batch.maxMarks}
                  step="0.5"
                  className="w-24"
                  aria-label={`${student.fullName}: ${t("marksOutOf", { max: batch.maxMarks })}`}
                  disabled={!canEdit || row.absent}
                  value={row.absent ? "" : row.marks}
                  onChange={(e) =>
                    setRows((r) => ({ ...r, [student.id]: { ...row, marks: e.target.value } }))
                  }
                />
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={!canEdit}
                    checked={row.absent}
                    onChange={(e) =>
                      setRows((r) => ({
                        ...r,
                        [student.id]: { marks: "", absent: e.target.checked },
                      }))
                    }
                  />
                  {t("absent")}
                </label>
              </span>
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            loading={save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({ ...key, entries: entries() });
                await refresh();
                toast.success(t("saved"));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("save"));
              }
            }}
          >
            {t("save")}
          </Button>
          <Button
            loading={submit.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({ ...key, entries: entries() });
                await submit.mutateAsync(key);
                await refresh();
                toast.success(t("submittedOk"));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("submit"));
              }
            }}
          >
            {t("submit")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
