"use client";

import { saveExamSubjectInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

type FormInput = z.input<typeof saveExamSubjectInputSchema>;
type FormOutput = z.output<typeof saveExamSubjectInputSchema>;
const dateText = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

export function ExamSchedule({ examId }: { examId: string }) {
  const t = useTranslations("exams");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const schedule = useQuery(trpc.exams.schedule.queryOptions({ examId }));
  const setup = useQuery(trpc.setup.get.queryOptions());
  const save = useMutation(trpc.exams.saveSubject.mutationOptions());
  const remove = useMutation(trpc.exams.removeSubject.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(saveExamSubjectInputSchema),
    mode: "onBlur",
    defaultValues: { examId, classId: "", subjectId: "", date: "", startTime: "", maxMarks: 100 },
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.exams.schedule.queryKey({ examId }) });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/exams" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <PageHeader title={t("schedule")} />
      {schedule.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {schedule.data?.length === 0 ? (
        <p className="text-muted-foreground">{t("noSchedule")}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {schedule.data?.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {row.className} · {row.subjectName}
              </p>
              <p className="text-sm text-muted-foreground">
                {dateText(row.date)}
                {row.startTime ? ` · ${row.startTime}` : ""} · {t("maxMarks")}: {row.maxMarks}
              </p>
            </div>
            {can("exams.manage") ? (
              <ConfirmButton
                label={t("remove")}
                question={t("removeNamed", { name: `${row.className} ${row.subjectName}` })}
                confirmLabel={t("confirm")}
                cancelLabel={t("cancel")}
                onConfirm={async () => {
                  try {
                    await remove.mutateAsync({ id: row.id });
                    await refresh();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("cancel"));
                  }
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {can("exams.manage") ? (
        <form
          noValidate
          className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2 rounded-md border border-border p-4"
          onSubmit={handleSubmit(async (values) => {
            try {
              await save.mutateAsync(values);
              reset({ ...values, subjectId: "", date: "" });
              await refresh();
              toast.success(t("saved"));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("cancel"));
            }
          })}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="es-class">{t("class")}</Label>
            <Select id="es-class" {...register("classId")}>
              <option value="">{t("pick")}</option>
              {setup.data?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {errors.classId ? (
              <p className="text-sm text-danger">{errors.classId.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="es-subject">{t("subject")}</Label>
            <Select id="es-subject" {...register("subjectId")}>
              <option value="">{t("pick")}</option>
              {setup.data?.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {errors.subjectId ? (
              <p className="text-sm text-danger">{errors.subjectId.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="es-date">{t("date")}</Label>
            <Input id="es-date" type="date" {...register("date")} />
            {errors.date ? <p className="text-sm text-danger">{errors.date.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="es-time">{t("time")}</Label>
            <Input id="es-time" type="time" {...register("startTime")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="es-max">{t("maxMarks")}</Label>
            <Input
              id="es-max"
              type="number"
              min={1}
              max={1000}
              {...register("maxMarks", { valueAsNumber: true })}
            />
            {errors.maxMarks ? (
              <p className="text-sm text-danger">{errors.maxMarks.message}</p>
            ) : null}
          </div>
          <Button type="submit" className="col-span-2 self-start" loading={save.isPending}>
            {t("addSubject")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
