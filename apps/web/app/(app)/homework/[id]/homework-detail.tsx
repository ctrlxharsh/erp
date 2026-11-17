"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { useOpenFile } from "@/lib/use-open-file";

type Progress = "pending" | "submitted" | "late";

export function HomeworkDetail({ homeworkId }: { homeworkId: string }) {
  const t = useTranslations("homework");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openFile = useOpenFile();
  const query = useQuery(trpc.classwork.homework.roster.queryOptions({ homeworkId }));
  const save = useMutation(trpc.classwork.homework.setStatus.mutationOptions());
  const [rows, setRows] = useState<Record<string, { status: Progress; marks: string }>>({});

  useEffect(() => {
    if (query.data)
      setRows(
        Object.fromEntries(
          query.data.students.map((s) => [
            s.id,
            { status: s.status, marks: s.marks === null ? "" : String(s.marks) },
          ]),
        ),
      );
  }, [query.data]);

  if (query.isPending) return <Skeleton className="h-40 w-full max-w-2xl" />;
  if (query.isError || !query.data) return <p role="alert">{query.error?.message}</p>;
  const { homework, canManage, students } = query.data;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/homework" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <PageHeader title={homework.title} />
      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            {homework.subjectName} · {homework.sectionLabel} ·{" "}
            {t("due", { date: homework.dueDate })}
          </p>
          <p className="text-muted-foreground">{t("teacher", { name: homework.teacherName })}</p>
          {homework.isGraded ? <p>{t("graded1", { max: homework.maxMarks ?? 0 })}</p> : null}
          {homework.details ? <p className="whitespace-pre-wrap">{homework.details}</p> : null}
          {homework.attachmentIds.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {homework.attachmentIds.map((id, index) => (
                <Button key={id} variant="outline" onClick={() => openFile(id)}>
                  {t("download")} {index + 1}
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {students.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("statusTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {students.map((student) => (
                <li
                  key={student.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="font-medium">{student.fullName}</span>
                  <span className="flex items-center gap-2">
                    <Select
                      aria-label={`${student.fullName}: ${t("statusTitle")}`}
                      className="w-32"
                      disabled={!canManage}
                      value={rows[student.id]?.status ?? "pending"}
                      onChange={(e) =>
                        setRows((r) => ({
                          ...r,
                          [student.id]: {
                            status: e.target.value as Progress,
                            marks: r[student.id]?.marks ?? "",
                          },
                        }))
                      }
                    >
                      {(["pending", "submitted", "late"] as const).map((p) => (
                        <option key={p} value={p}>
                          {t(p)}
                        </option>
                      ))}
                    </Select>
                    {homework.isGraded ? (
                      <Input
                        type="number"
                        min={0}
                        max={homework.maxMarks ?? undefined}
                        step="0.5"
                        className="w-24"
                        aria-label={`${student.fullName}: ${t("marks", { max: homework.maxMarks ?? 0 })}`}
                        placeholder={`/${homework.maxMarks}`}
                        disabled={!canManage}
                        value={rows[student.id]?.marks ?? ""}
                        onChange={(e) =>
                          setRows((r) => ({
                            ...r,
                            [student.id]: {
                              status: r[student.id]?.status ?? "pending",
                              marks: e.target.value,
                            },
                          }))
                        }
                      />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {canManage ? (
              <Button
                className="self-start"
                loading={save.isPending}
                onClick={async () => {
                  try {
                    await save.mutateAsync({
                      homeworkId,
                      entries: students.map((s) => ({
                        studentId: s.id,
                        status: rows[s.id]?.status ?? "pending",
                        marks:
                          homework.isGraded &&
                          rows[s.id]?.marks !== "" &&
                          rows[s.id]?.marks !== undefined
                            ? Number(rows[s.id]?.marks)
                            : null,
                      })),
                    });
                    await queryClient.invalidateQueries({
                      queryKey: trpc.classwork.homework.roster.queryKey({ homeworkId }),
                    });
                    toast.success(t("saved"));
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("fileFailed"));
                  }
                }}
              >
                {t("saveStatus")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
