"use client";

import { createSubjectInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";

type Values = z.input<typeof createSubjectInputSchema>;

export function SubjectsPanel() {
  const t = useTranslations("setup");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setup = useQuery(trpc.setup.get.queryOptions());
  const create = useMutation(trpc.setup.createSubject.mutationOptions());
  const remove = useMutation(trpc.setup.deleteSubject.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(createSubjectInputSchema), mode: "onBlur" });

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.setup.get.queryKey() });
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("uploadFailed"));

  if (setup.isPending) return <Skeleton className="h-40 w-full" />;
  const subjects = setup.data?.subjects ?? [];

  return (
    <div className="flex flex-col gap-4">
      {subjects.length === 0 ? <p className="text-muted-foreground">{t("noSubjects")}</p> : null}
      <ul className="flex flex-col gap-2">
        {subjects.map((subject) => (
          <li
            key={subject.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-2"
          >
            <span className="font-medium">{subject.name}</span>
            <ConfirmButton
              label={t("deleteItem")}
              question={t("deleteNamed", { name: subject.name })}
              detail={t("cannotUndo")}
              confirmLabel={t("confirm")}
              cancelLabel={t("cancel")}
              busy={remove.isPending}
              onConfirm={async () => {
                try {
                  await remove.mutateAsync({ id: subject.id });
                  await refresh();
                  toast.success(t("deleted"));
                } catch (error) {
                  fail(error);
                }
              }}
            />
          </li>
        ))}
      </ul>
      <form
        onSubmit={handleSubmit(async (values) => {
          try {
            await create.mutateAsync(values);
            reset();
            await refresh();
            toast.success(t("added"));
          } catch (error) {
            fail(error);
          }
        })}
        noValidate
        className="flex max-w-md flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject-name">{t("subjectName")}</Label>
          <Input
            id="subject-name"
            aria-invalid={errors.name ? true : undefined}
            {...register("name")}
          />
          {errors.name ? <p className="text-sm text-danger">{errors.name.message}</p> : null}
        </div>
        <Button type="submit" className="self-start" loading={create.isPending}>
          {t("addSubject")}
        </Button>
      </form>
    </div>
  );
}
