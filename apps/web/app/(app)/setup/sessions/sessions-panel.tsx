"use client";

import { createSessionInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";

type Values = z.input<typeof createSessionInputSchema>;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

export function SessionsPanel() {
  const t = useTranslations("setup");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setup = useQuery(trpc.setup.get.queryOptions());
  const create = useMutation(trpc.setup.createSession.mutationOptions());
  const activate = useMutation(trpc.setup.activateSession.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(createSessionInputSchema), mode: "onBlur" });

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.setup.get.queryKey() });

  async function onSubmit(values: Values) {
    try {
      await create.mutateAsync(values);
      reset();
      await refresh();
      toast.success(t("sessionAdded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("uploadFailed"));
    }
  }

  if (setup.isPending) return <Skeleton className="h-40 w-full" />;
  const sessions = setup.data?.sessions ?? [];

  return (
    <div className="flex flex-col gap-4">
      {sessions.length === 0 ? <p className="text-muted-foreground">{t("noSessions")}</p> : null}
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <li key={session.id}>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="mr-auto">
                  <p className="font-medium">{session.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(session.startDate)} – {formatDate(session.endDate)}
                  </p>
                </div>
                {session.isActive ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    {t("active")}
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    loading={activate.isPending}
                    onClick={async () => {
                      await activate.mutateAsync({ id: session.id });
                      await refresh();
                      toast.success(t("activated"));
                    }}
                  >
                    {t("makeActive")}
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-name">{t("sessionName")}</Label>
          <Input
            id="session-name"
            placeholder="2026-27"
            aria-invalid={errors.name ? true : undefined}
            {...register("name")}
          />
          {errors.name ? <p className="text-sm text-danger">{errors.name.message}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-date">{t("startDate")}</Label>
            <Input
              id="start-date"
              type="date"
              aria-invalid={errors.startDate ? true : undefined}
              {...register("startDate")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-date">{t("endDate")}</Label>
            <Input
              id="end-date"
              type="date"
              aria-invalid={errors.endDate ? true : undefined}
              {...register("endDate")}
            />
          </div>
        </div>
        {errors.startDate || errors.endDate ? (
          <p className="text-sm text-danger">
            {errors.endDate?.message ?? errors.startDate?.message}
          </p>
        ) : null}
        <Button type="submit" className="self-start" loading={create.isPending}>
          {t("addSession")}
        </Button>
      </form>
    </div>
  );
}
