"use client";

import { updateProfileInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { SchoolLogo } from "@/components/shell/school-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { useFileUpload } from "@/lib/use-file-upload";

type Values = z.input<typeof updateProfileInputSchema>;

export function ProfileForm() {
  const t = useTranslations("setup");
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setup = useQuery(trpc.setup.get.queryOptions());
  const save = useMutation(trpc.setup.updateProfile.mutationOptions());
  const { upload, busy: uploading } = useFileUpload("school_logo");
  const [logoFileId, setLogoFileId] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(updateProfileInputSchema), mode: "onBlur" });

  const profile = setup.data?.profile;
  useEffect(() => {
    if (!profile) return;
    reset({
      name: profile.name,
      address: profile.address ?? "",
      affiliationNo: profile.affiliationNo ?? "",
      phone: profile.phone ?? "",
      logoFileId: profile.logoFileId,
    });
    setLogoFileId(profile.logoFileId);
  }, [profile, reset]);

  if (setup.isPending) return <Skeleton className="h-64 w-full" />;

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    try {
      setLogoFileId(await upload(file));
      setLogoPreview(URL.createObjectURL(file));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "upload failed"
          ? error.message
          : t("uploadFailed"),
      );
    }
  }

  async function onSubmit(values: Values) {
    try {
      await save.mutateAsync({ ...values, logoFileId });
      await queryClient.invalidateQueries({ queryKey: trpc.setup.get.queryKey() });
      toast.success(t("saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("uploadFailed"));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" aria-invalid={errors.name ? true : undefined} {...register("name")} />
        {errors.name ? <p className="text-sm text-danger">{errors.name.message}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">{t("address")}</Label>
        <Input id="address" {...register("address")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="affiliationNo">{t("affiliationNo")}</Label>
        <Input id="affiliationNo" {...register("affiliationNo")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input id="phone" type="tel" {...register("phone")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="logo">{t("logo")}</Label>
        <div className="flex items-center gap-3">
          {logoPreview ? (
            // biome-ignore lint/performance/noImgElement: a local blob preview cannot use next/image
            <img
              src={logoPreview}
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-md object-contain"
            />
          ) : (
            <SchoolLogo name={profile?.name ?? ""} size={48} />
          )}
          <input
            ref={fileInput}
            id="logo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => chooseLogo(event.target.files?.[0])}
          />
          <Button variant="outline" loading={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? t("uploading") : t("chooseLogo")}
          </Button>
          {logoFileId ? (
            <Button
              variant="ghost"
              onClick={() => {
                setLogoFileId(null);
                setLogoPreview(null);
              }}
            >
              {t("removeLogo")}
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{t("logoHint")}</p>
      </div>
      <Button type="submit" className="self-start" loading={save.isPending}>
        {t("saveProfile")}
      </Button>
    </form>
  );
}
