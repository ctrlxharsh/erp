"use client";

import { saveNoticeInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

type FormInput = z.input<typeof saveNoticeInputSchema>;
type FormOutput = z.output<typeof saveNoticeInputSchema>;

/** Used to write a new notice, or to edit the author's own draft or sent-back notice. */
export function NoticeForm({ noticeId }: { noticeId?: string }) {
  const t = useTranslations("notices");
  const router = useRouter();
  const trpc = useTRPC();
  const { can } = usePermissions();
  const existing = useQuery({
    ...trpc.notices.get.queryOptions({ id: noticeId ?? "" }),
    enabled: Boolean(noticeId),
  });
  const save = useMutation(trpc.notices.save.mutationOptions());
  const submit = useMutation(trpc.notices.submit.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(saveNoticeInputSchema),
    mode: "onBlur",
    defaultValues: { title: "", body: "", audience: "all" },
  });

  useEffect(() => {
    if (existing.data)
      reset({
        title: existing.data.title,
        body: existing.data.body,
        audience: existing.data.audience,
      });
  }, [existing.data, reset]);

  async function persist(values: FormOutput, send: boolean) {
    try {
      const { id } = await save.mutateAsync({ ...values, id: noticeId });
      if (send) {
        const result = await submit.mutateAsync({ id });
        toast.success(result.status === "published" ? t("publishedNow") : t("sentForApproval"));
      } else {
        toast.success(t("draftSaved"));
      }
      router.push(`/notices/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("cancel"));
    }
  }

  const direct = can("notice.publish");
  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-4"
      onSubmit={handleSubmit((v) => persist(v, true))}
    >
      <Link href="/notices" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <PageHeader title={noticeId ? t("edit") : t("write")} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="n-title">{t("noticeTitle")}</Label>
        <Input id="n-title" aria-invalid={errors.title ? true : undefined} {...register("title")} />
        {errors.title ? <p className="text-sm text-danger">{errors.title.message}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="n-body">{t("body")}</Label>
        <textarea
          id="n-body"
          rows={8}
          aria-invalid={errors.body ? true : undefined}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          {...register("body")}
        />
        {errors.body ? <p className="text-sm text-danger">{errors.body.message}</p> : null}
      </div>
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="n-aud">{t("audience")}</Label>
        <Select id="n-aud" {...register("audience")}>
          {(["all", "teachers", "students_parents"] as const).map((a) => (
            <option key={a} value={a}>
              {t(a)}
            </option>
          ))}
        </Select>
      </div>
      {!direct ? <p className="text-sm text-muted-foreground">{t("approvalNeeded")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={save.isPending || submit.isPending}>
          {direct ? t("publishNow") : t("send")}
        </Button>
        <Button variant="outline" onClick={handleSubmit((v) => persist(v, false))}>
          {t("saveDraft")}
        </Button>
      </div>
    </form>
  );
}
