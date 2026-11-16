"use client";

import { saveCalendarEventInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

type FormInput = z.input<typeof saveCalendarEventInputSchema>;
type FormOutput = z.output<typeof saveCalendarEventInputSchema>;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

export function CalendarView() {
  const t = useTranslations("calendar");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const last = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const range = {
    from: iso(cursor.year, cursor.month, 1),
    to: iso(cursor.year, cursor.month, last),
  };
  const query = useQuery(trpc.calendar.list.queryOptions(range));
  const save = useMutation(trpc.calendar.save.mutationOptions());
  const remove = useMutation(trpc.calendar.delete.mutationOptions());
  const manage = can("calendar.manage");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(saveCalendarEventInputSchema),
    mode: "onBlur",
    defaultValues: { startDate: "", endDate: "", title: "", type: "event", audience: "all" },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.calendar.list.queryKey() });
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
    new Date(cursor.year, cursor.month, 1),
  );
  const step = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  function startEdit(event?: {
    id: string;
    startDate: string;
    endDate: string;
    title: string;
    type: FormOutput["type"];
    audience: FormOutput["audience"];
  }) {
    reset(
      event ?? {
        startDate: range.from,
        endDate: range.from,
        title: "",
        type: "event",
        audience: "all",
      },
    );
    setEditing(event?.id ?? "new");
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
        {manage ? (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/calendar/import">{t("import")}</Link>
            </Button>
            <Button onClick={() => startEdit()}>{t("addEvent")}</Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label={t("previous")} onClick={() => step(-1)}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <h2 className="min-w-40 text-center font-semibold" aria-live="polite">
          {monthLabel}
        </h2>
        <Button variant="outline" size="icon" aria-label={t("next")} onClick={() => step(1)}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {editing ? (
        <form
          noValidate
          className="flex max-w-md flex-col gap-3 rounded-md border border-border p-4"
          onSubmit={handleSubmit(async (values) => {
            try {
              await save.mutateAsync({ ...values, id: editing === "new" ? undefined : editing });
              setEditing(null);
              await refresh();
              toast.success(t("saved"));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("cancel"));
            }
          })}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ev-title">{t("eventTitle")}</Label>
            <Input
              id="ev-title"
              aria-invalid={errors.title ? true : undefined}
              {...register("title")}
            />
            {errors.title ? <p className="text-sm text-danger">{errors.title.message}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-start">{t("start")}</Label>
              <Input id="ev-start" type="date" {...register("startDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-end">{t("end")}</Label>
              <Input id="ev-end" type="date" {...register("endDate")} />
              {errors.endDate ? (
                <p className="text-sm text-danger">{errors.endDate.message}</p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-type">{t("type")}</Label>
              <Select id="ev-type" {...register("type")}>
                {(["holiday", "event", "exam", "ptm", "other"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(v)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-aud">{t("audience")}</Label>
              <Select id="ev-aud" {...register("audience")}>
                {(["all", "teachers", "students_parents"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(v)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending}>
              {t("save")}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : query.data?.length ? (
        <ul className="flex flex-col gap-2">
          {query.data.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-3"
            >
              <div>
                <p className="font-medium">{event.title}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(event.startDate)}
                  {event.endDate !== event.startDate ? ` – ${formatDate(event.endDate)}` : ""} ·{" "}
                  {t(event.type)}
                  {manage ? ` · ${t(event.audience)}` : ""}
                </p>
              </div>
              {manage ? (
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => startEdit(event)}>
                    {t("edit")}
                  </Button>
                  <ConfirmButton
                    label={t("delete")}
                    question={t("deleteNamed", { name: event.title })}
                    detail={t("cannotUndo")}
                    confirmLabel={t("confirm")}
                    cancelLabel={t("cancel")}
                    onConfirm={async () => {
                      await remove.mutateAsync({ id: event.id });
                      await refresh();
                      toast.success(t("deleted"));
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("empty")}</p>
      )}
    </div>
  );
}
