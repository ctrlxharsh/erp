"use client";

import { createSchoolInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { useTRPC } from "@/lib/trpc/client";

type Values = z.input<typeof createSchoolInputSchema>;

export function CreateSchoolForm() {
  const t = useTranslations("platform");
  const router = useRouter();
  const trpc = useTRPC();
  const create = useMutation(trpc.platform.createSchool.mutationOptions());
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(createSchoolInputSchema), mode: "onBlur" });

  async function onSubmit(values: Values) {
    try {
      const school = await create.mutateAsync(values);
      toast.success(t("created"));
      router.push(`/platform/schools/${school.id}`);
    } catch (error) {
      setError("name", {
        message: error instanceof Error ? error.message : t("schoolNameInvalid"),
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4">
      <PageHeader title={t("newSchool")} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("schoolName")}</Label>
        <Input
          id="name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name")}
        />
        {errors.name ? (
          <p id="name-error" className="text-sm text-danger">
            {t("schoolNameInvalid")}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={create.isPending}>
          {t("createSchool")}
        </Button>
        <Button variant="outline" onClick={() => router.push("/platform/schools")}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
