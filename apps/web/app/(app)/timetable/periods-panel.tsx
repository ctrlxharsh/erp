"use client";

import { savePeriodInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/lib/trpc/client";

type Values = z.input<typeof savePeriodInputSchema>;

export function PeriodsPanel({
  periods,
  onChanged,
}: {
  periods: { id: string; name: string; startTime: string; endTime: string }[];
  onChanged: () => unknown;
}) {
  const t = useTranslations("timetable");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const save = useMutation(trpc.timetable.savePeriod.mutationOptions());
  const remove = useMutation(trpc.timetable.deletePeriod.mutationOptions());
  const [editingId, setEditingId] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(savePeriodInputSchema),
    mode: "onBlur",
    defaultValues: { name: "", startTime: "", endTime: "" },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.timetable.periods.queryKey() });
    await onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("periodsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {periods.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">{p.name}</span> · {p.startTime}–{p.endTime}
              </span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(p.id);
                    reset({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime });
                  }}
                >
                  {t("edit")}
                </Button>
                <ConfirmButton
                  label={t("delete")}
                  question={t("deleteNamed", { name: p.name })}
                  detail={t("cannotUndo")}
                  confirmLabel={t("confirm")}
                  cancelLabel={t("cancel")}
                  onConfirm={async () => {
                    try {
                      await remove.mutateAsync({ id: p.id });
                      await refresh();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("cancel"));
                    }
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
        <form
          noValidate
          className="grid max-w-lg grid-cols-1 items-end gap-2 sm:grid-cols-3"
          onSubmit={handleSubmit(async (values) => {
            try {
              await save.mutateAsync({ ...values, id: editingId ?? undefined });
              reset({ name: "", startTime: "", endTime: "" });
              setEditingId(null);
              await refresh();
              toast.success(t("periodSaved"));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("cancel"));
            }
          })}
        >
          <div className="col-span-3 flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="p-name">{t("periodName")}</Label>
            <Input
              id="p-name"
              aria-invalid={errors.name ? true : undefined}
              {...register("name")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-start">{t("startTime")}</Label>
            <Input id="p-start" type="time" {...register("startTime")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-end">{t("endTime")}</Label>
            <Input id="p-end" type="time" {...register("endTime")} />
          </div>
          {errors.name || errors.startTime || errors.endTime ? (
            <p className="col-span-3 text-sm text-danger">
              {errors.name?.message ?? errors.startTime?.message ?? errors.endTime?.message}
            </p>
          ) : null}
          <Button type="submit" className="col-span-3 sm:col-span-1" loading={save.isPending}>
            {editingId ? t("savePeriod") : t("addPeriod")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
