"use client";

import type { AttendanceStatus } from "@erp/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";
import { StatusPicker } from "./status-picker";

const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function AttendanceView() {
  const t = useTranslations("attendance");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const home = useQuery(trpc.home.summary.queryOptions());
  const isFamily = (home.data?.children.length ?? 0) > 0 || Boolean(home.data?.me);

  const sections = useQuery({
    ...trpc.attendance.sections.queryOptions(),
    enabled: !isFamily && home.isSuccess,
  });
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  useEffect(() => {
    if (!sectionId && sections.data?.length) {
      setSectionId(
        (sections.data.find((s) => s.isClassTeacher) ?? sections.data[0])?.sectionId ?? "",
      );
    }
  }, [sections.data, sectionId]);

  const sheet = useQuery({
    ...trpc.attendance.sheet.queryOptions({ sectionId, date }),
    enabled: Boolean(sectionId) && Boolean(date),
  });
  const save = useMutation(trpc.attendance.save.mutationOptions());

  // Start from what is saved; students with no mark yet default to Present (CONSTITUTION §9.4).
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.id, s.status ?? "present"])));
    setReason("");
  }, [sheet.data]);

  if (home.isPending) return <Skeleton className="h-40 w-full max-w-2xl" />;

  if (isFamily) {
    const people = [
      ...(home.data?.children ?? []),
      ...(home.data?.me
        ? [{ id: "", fullName: home.data.me.fullName, label: home.data.me.label }]
        : []),
    ];
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
        <ul className="flex flex-col gap-2">
          {home.data?.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/attendance/student/${child.id}`}
                className="flex min-h-12 flex-col rounded-md border border-border px-4 py-2 hover:bg-muted"
              >
                <span className="font-medium">{child.fullName}</span>
                {child.label ? (
                  <span className="text-sm text-muted-foreground">{child.label}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        {home.data?.me && people.length > 0 && !home.data.children.length ? (
          <MyOwnAttendance />
        ) : null}
      </div>
    );
  }

  const data = sheet.data;
  const editable = data?.access === "teacher" || data?.access === "correction";

  async function onSave() {
    if (!data) return;
    try {
      const result = await save.mutateAsync({
        sectionId,
        date,
        entries: data.students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? "present" })),
        reason: data.access === "correction" ? reason : undefined,
      });
      toast.success(
        result.absentNotified > 0 ? t("savedAlerts", { count: result.absentNotified }) : t("saved"),
      );
      await queryClient.invalidateQueries({ queryKey: trpc.attendance.sheet.queryKey() });
      await queryClient.invalidateQueries({ queryKey: trpc.attendance.sections.queryKey() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("viewOnly"));
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
        {can("staff_attendance.view") ? (
          <Button asChild variant="outline">
            <Link href="/attendance/staff">{t("staffTitle")}</Link>
          </Button>
        ) : null}
      </div>

      {sections.isSuccess && sections.data.length === 0 ? (
        <p className="text-muted-foreground">{t("noSections")}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-col gap-1.5">
          <Label htmlFor="att-section">{t("chooseSection")}</Label>
          <Select id="att-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.data?.map((s) => (
              <option key={s.sectionId} value={s.sectionId}>
                {s.label}
                {s.isClassTeacher ? ` · ${t("classTeacherBadge")}` : ""}
                {s.markedToday ? ` · ${t("markedToday")}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="att-date">{t("date")}</Label>
          <Input
            id="att-date"
            type="date"
            max={todayIso()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {sheet.isPending && sectionId ? <Skeleton className="h-48 w-full" /> : null}

      {data ? (
        <>
          {data.holiday ? (
            <p role="status" className="rounded-md bg-warning p-3 text-sm text-warning-foreground">
              {t("holidayNote", { title: data.holiday })}
            </p>
          ) : null}
          {!editable && data.note && !data.holiday ? (
            <p role="status" className="rounded-md bg-muted p-3 text-sm">
              {data.note}
            </p>
          ) : null}
          {data.access === "correction" ? (
            <p role="status" className="rounded-md bg-muted p-3 text-sm">
              {t("reasonHint")}
            </p>
          ) : null}

          {data.students.length === 0 ? (
            <p className="text-muted-foreground">{t("noStudents")}</p>
          ) : (
            <>
              {editable ? (
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() =>
                    setMarks(
                      Object.fromEntries(data.students.map((s) => [s.id, "present" as const])),
                    )
                  }
                >
                  {t("markAllPresent")}
                </Button>
              ) : null}
              <ul className="flex flex-col gap-2">
                {data.students.map((student, index) => (
                  <li
                    key={student.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <span className="font-medium">
                      <span className="mr-2 text-muted-foreground">
                        {student.rollNo ?? index + 1}.
                      </span>
                      {student.fullName}
                    </span>
                    <StatusPicker
                      name={`status-${student.id}`}
                      legend={student.fullName}
                      value={editable ? (marks[student.id] ?? "present") : (student.status ?? null)}
                      disabled={!editable}
                      onChange={(status) => setMarks((m) => ({ ...m, [student.id]: status }))}
                    />
                  </li>
                ))}
              </ul>
              {data.access === "correction" ? (
                <div className="flex max-w-md flex-col gap-1.5">
                  <Label htmlFor="att-reason">{t("reason")}</Label>
                  <Input
                    id="att-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-invalid={reason.length > 0 && reason.trim().length < 5}
                  />
                </div>
              ) : null}
              {editable ? (
                <Button
                  className="self-start"
                  loading={save.isPending}
                  disabled={data.access === "correction" && reason.trim().length < 5}
                  onClick={onSave}
                >
                  {t("save")}
                </Button>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function MyOwnAttendance() {
  const t = useTranslations("attendance");
  return (
    <p className="text-muted-foreground">
      <Link href="/attendance/student/me" className="text-primary underline">
        {t("myAttendance")}
      </Link>
    </p>
  );
}
