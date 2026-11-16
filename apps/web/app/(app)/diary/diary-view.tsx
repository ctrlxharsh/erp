"use client";

import { saveDiaryInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

type FormInput = z.input<typeof saveDiaryInputSchema>;
type FormOutput = z.output<typeof saveDiaryInputSchema>;

const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dateText = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

export function DiaryView() {
  const t = useTranslations("diary");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const home = useQuery(trpc.home.summary.queryOptions());
  const setup = useQuery({ ...trpc.setup.get.queryOptions(), enabled: can("people.view") });
  const assignments = useQuery({
    ...trpc.classwork.myAssignments.queryOptions(),
    enabled: can("diary.manage"),
  });
  const save = useMutation(trpc.classwork.diary.save.mutationOptions());

  const ownSection = home.data?.me?.sectionId ?? home.data?.children[0]?.sectionId ?? null;
  const [picked, setPicked] = useState("");
  const [pair, setPair] = useState("");
  const sectionId = picked || ownSection || assignments.data?.[0]?.sectionId || "";
  const today = todayIso();
  const list = useQuery({
    ...trpc.classwork.diary.list.queryOptions({ sectionId, from: shift(today, -13), to: today }),
    enabled: Boolean(sectionId),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(saveDiaryInputSchema),
    mode: "onBlur",
    defaultValues: { sectionId: "", subjectId: "", date: today, topic: "", notes: "" },
  });

  const sectionOptions = can("people.view")
    ? (setup.data?.classes.flatMap((c) =>
        c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` })),
      ) ?? [])
    : [
        ...new Map(
          (assignments.data ?? []).map((a) => [a.sectionId, { id: a.sectionId, label: a.label }]),
        ).values(),
      ];

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>

      {sectionOptions.length > 1 ? (
        <div className="max-w-xs">
          <Select
            aria-label={t("chooseClass")}
            value={sectionId}
            onChange={(e) => setPicked(e.target.value)}
          >
            {sectionOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {can("diary.manage") ? (
        assignments.isSuccess && assignments.data.length === 0 ? (
          <p className="text-muted-foreground">{t("noAssignments")}</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("add")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                className="flex max-w-md flex-col gap-3"
                onSubmit={handleSubmit(async (values) => {
                  try {
                    await save.mutateAsync(values);
                    reset({ ...values, topic: "", notes: "" });
                    await queryClient.invalidateQueries({
                      queryKey: trpc.classwork.diary.list.queryKey(),
                    });
                    toast.success(t("saved"));
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("save"));
                  }
                })}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="d-pair">{t("pick")}</Label>
                  <Select
                    id="d-pair"
                    value={pair}
                    onChange={(e) => {
                      setPair(e.target.value);
                      const [s = "", sub = ""] = e.target.value.split("|");
                      setValue("sectionId", s, { shouldValidate: true });
                      setValue("subjectId", sub, { shouldValidate: true });
                      if (s) setPicked(s);
                    }}
                  >
                    <option value="">{t("pick")}</option>
                    {assignments.data?.map((a) => (
                      <option
                        key={`${a.sectionId}|${a.subjectId}`}
                        value={`${a.sectionId}|${a.subjectId}`}
                      >
                        {a.label} · {a.subjectName}
                      </option>
                    ))}
                  </Select>
                  {errors.sectionId ? (
                    <p className="text-sm text-danger">{errors.sectionId.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="d-date">{t("date")}</Label>
                  <Input id="d-date" type="date" max={today} {...register("date")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="d-topic">{t("topic")}</Label>
                  <Input
                    id="d-topic"
                    aria-invalid={errors.topic ? true : undefined}
                    {...register("topic")}
                  />
                  {errors.topic ? (
                    <p className="text-sm text-danger">{errors.topic.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="d-notes">{t("notes")}</Label>
                  <textarea
                    id="d-notes"
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    {...register("notes")}
                  />
                </div>
                <Button type="submit" className="self-start" loading={save.isPending}>
                  {t("save")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )
      ) : null}

      <h2 className="font-semibold text-primary">{t("last14")}</h2>
      {list.isPending && sectionId ? <Skeleton className="h-32 w-full" /> : null}
      {list.data?.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((entry) => (
          <li key={entry.id} className="rounded-md border border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {dateText(entry.date)} ·{" "}
              {t("by", { subject: entry.subjectName, teacher: entry.teacherName })}
            </p>
            <p className="font-medium">{entry.topic}</p>
            {entry.notes ? <p className="whitespace-pre-wrap text-sm">{entry.notes}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
