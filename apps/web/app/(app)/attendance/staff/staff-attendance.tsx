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
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { StatusPicker } from "../status-picker";

const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function StaffAttendance() {
  const t = useTranslations("attendance");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const sheet = useQuery(trpc.attendance.staffSheet.queryOptions({ date }));
  const save = useMutation(trpc.attendance.saveStaff.mutationOptions());

  useEffect(() => {
    if (sheet.data)
      setMarks(Object.fromEntries(sheet.data.staff.map((s) => [s.id, s.status ?? "present"])));
  }, [sheet.data]);

  const data = sheet.data;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/attendance" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold text-primary">{t("staffTitle")}</h1>
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="sa-date">{t("date")}</Label>
        <Input
          id="sa-date"
          type="date"
          max={todayIso()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {sheet.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {data?.holiday ? (
        <p role="status" className="rounded-md bg-warning p-3 text-sm text-warning-foreground">
          {t("holidayNote", { title: data.holiday })}
        </p>
      ) : null}
      {data ? (
        <>
          <ul className="flex flex-col gap-2">
            {data.staff.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <span>
                  <span className="font-medium">{member.fullName}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {member.kind === "teacher" ? t("teacher") : t("nonTeaching")}
                  </span>
                </span>
                <StatusPicker
                  name={`staff-${member.id}`}
                  legend={member.fullName}
                  value={data.canEdit ? (marks[member.id] ?? "present") : member.status}
                  disabled={!data.canEdit}
                  onChange={(status) => setMarks((m) => ({ ...m, [member.id]: status }))}
                />
              </li>
            ))}
          </ul>
          {data.canEdit && data.staff.length > 0 ? (
            <Button
              className="self-start"
              loading={save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({
                    date,
                    entries: data.staff.map((s) => ({
                      staffId: s.id,
                      status: marks[s.id] ?? "present",
                    })),
                  });
                  await queryClient.invalidateQueries({
                    queryKey: trpc.attendance.staffSheet.queryKey(),
                  });
                  toast.success(t("saved"));
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("viewOnly"));
                }
              }}
            >
              {t("saveStaff")}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
