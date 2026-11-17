"use client";

import { inviteSchoolAdminInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";

const inviteFormSchema = inviteSchoolAdminInputSchema.omit({ schoolId: true });
type InviteValues = z.input<typeof inviteFormSchema>;

export function SchoolDetail({ schoolId }: { schoolId: string }) {
  const t = useTranslations("platform");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  // The list endpoint is the one place schools are read; search by id is not needed for one row.
  const list = useQuery(
    trpc.platform.listSchools.queryOptions({
      page: 1,
      pageSize: 50,
      search: "",
      sort: "createdAt",
      direction: "desc",
    }),
  );
  const school = list.data?.items.find((item) => item.id === schoolId);

  const setStatus = useMutation(trpc.platform.setSchoolStatus.mutationOptions());
  const invite = useMutation(trpc.platform.inviteSchoolAdmin.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteFormSchema), mode: "onBlur" });

  if (list.isPending) return <Skeleton className="h-40 w-full max-w-xl" />;
  if (!school) return <p>{t("backToSchools")}</p>;

  const suspended = school.status === "suspended";

  async function changeStatus() {
    const next = suspended ? "active" : "suspended";
    await setStatus.mutateAsync({ schoolId, status: next });
    await queryClient.invalidateQueries({ queryKey: trpc.platform.listSchools.queryKey() });
    toast.success(next === "suspended" ? t("suspended") : t("restored"));
    setConfirming(false);
  }

  async function onInvite(values: InviteValues) {
    try {
      const result = await invite.mutateAsync({ ...values, schoolId });
      toast.success(result.emailSent ? t("inviteSent") : t("inviteLinked"));
      reset();
      await queryClient.invalidateQueries({ queryKey: trpc.platform.listSchools.queryKey() });
    } catch {
      toast.error(t("inviteFailed"));
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Link href="/platform/schools" className="text-sm text-primary underline">
        {t("backToSchools")}
      </Link>
      <PageHeader title={school.name} />

      <Card>
        <CardHeader>
          <CardTitle>{t("inviteTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("inviteBody")}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onInvite)} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-name">{t("adminName")}</Label>
              <Input
                id="admin-name"
                aria-invalid={errors.name ? true : undefined}
                {...register("name")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-email">{t("adminEmail")}</Label>
              <Input
                id="admin-email"
                type="email"
                aria-invalid={errors.email ? true : undefined}
                {...register("email")}
              />
            </div>
            <Button type="submit" loading={invite.isPending}>
              {t("sendInvite")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {school.status === "active" || school.status === "grace" || suspended ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {confirming ? (
              <>
                <p className="font-medium">
                  {t(suspended ? "restoreTitle" : "suspendTitle", { name: school.name })}
                </p>
                <p className="text-muted-foreground">
                  {t(suspended ? "restoreBody" : "suspendBody")}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant={suspended ? "primary" : "danger"}
                    loading={setStatus.isPending}
                    onClick={changeStatus}
                  >
                    {t("confirm")}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirming(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant={suspended ? "outline" : "danger"}
                className="self-start"
                onClick={() => setConfirming(true)}
              >
                {t(suspended ? "restore" : "suspend")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
