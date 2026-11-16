"use client";

import { addGuardianInputSchema } from "@erp/contracts";
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
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

const guardianFormSchema = addGuardianInputSchema.shape.guardian;
type GuardianValues = z.input<typeof guardianFormSchema>;

export function StudentDetail({ studentId }: { studentId: string }) {
  const t = useTranslations("people");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const query = useQuery(trpc.people.students.get.queryOptions({ id: studentId }));
  const addGuardian = useMutation(trpc.people.students.addGuardian.mutationOptions());
  const removeGuardian = useMutation(trpc.people.students.removeGuardian.mutationOptions());
  const setStatus = useMutation(trpc.people.students.setStatus.mutationOptions());
  const invite = useMutation(trpc.people.invite.mutationOptions());
  const [showForm, setShowForm] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GuardianValues>({ resolver: zodResolver(guardianFormSchema), mode: "onBlur" });

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.people.students.get.queryKey({ id: studentId }),
    });
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("importFailed"));

  if (query.isPending) return <Skeleton className="h-48 w-full max-w-xl" />;
  if (query.isError || !query.data) return <p role="alert">{query.error?.message}</p>;
  const student = query.data;
  const manage = can("people.manage");

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Link href="/people/students" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-primary">{student.fullName}</h1>
        <StatusBadge
          status={student.status === "active" ? "approved" : "draft"}
          label={student.status === "active" ? t("active") : t("left")}
        />
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("admissionNo")}</dt>
            <dd>{student.admissionNo}</dd>
            <dt className="text-muted-foreground">{t("classSection")}</dt>
            <dd>
              {student.className ? `${student.className} ${student.sectionName}` : t("noSection")}
            </dd>
            <dt className="text-muted-foreground">{t("dob")}</dt>
            <dd>{student.dateOfBirth ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("gender")}</dt>
            <dd>{student.gender ? t(student.gender) : "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("guardians")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {student.guardians.length === 0 ? (
            <p className="text-muted-foreground">{t("noGuardians")}</p>
          ) : null}
          {student.guardians.map((guardian) => (
            <div
              key={guardian.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {guardian.fullName}
                  {guardian.relation ? ` (${guardian.relation})` : ""}
                </p>
                <p className="text-muted-foreground">{guardian.email ?? "—"}</p>
                <p className="text-muted-foreground">{guardian.phone ?? "—"}</p>
                <p className="mt-1">{guardian.hasLogin ? t("hasLogin") : t("noLogin")}</p>
              </div>
              {manage ? (
                <div className="flex flex-wrap gap-2">
                  {!guardian.hasLogin ? (
                    <Button
                      variant="outline"
                      loading={invite.isPending}
                      disabled={!guardian.email}
                      title={guardian.email ? undefined : t("inviteNeedsEmail")}
                      onClick={async () => {
                        try {
                          const result = await invite.mutateAsync({
                            kind: "guardian",
                            id: guardian.id,
                          });
                          toast.success(result.emailSent ? t("inviteSent") : t("inviteLinked"));
                          await refresh();
                        } catch (error) {
                          fail(error);
                        }
                      }}
                    >
                      {t("invite")}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await removeGuardian.mutateAsync({ studentId, guardianId: guardian.id });
                      await refresh();
                    }}
                  >
                    {t("removeGuardian")}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {manage ? (
            showForm ? (
              <form
                noValidate
                className="flex flex-col gap-3 rounded-md border border-border p-3"
                onSubmit={handleSubmit(async (guardian) => {
                  try {
                    await addGuardian.mutateAsync({ studentId, guardian });
                    reset();
                    setShowForm(false);
                    await refresh();
                  } catch (error) {
                    fail(error);
                  }
                })}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gname">{t("guardianName")}</Label>
                  <Input id="gname" {...register("fullName")} />
                  {errors.fullName ? (
                    <p className="text-sm text-danger">{errors.fullName.message}</p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gemail">{t("guardianEmail")}</Label>
                    <Input id="gemail" type="email" {...register("email")} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gphone">{t("guardianPhone")}</Label>
                    <Input id="gphone" type="tel" {...register("phone")} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="grel">{t("relation")}</Label>
                  <Input id="grel" {...register("relation")} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={addGuardian.isPending}>
                    {t("addGuardian")}
                  </Button>
                  <Button variant="outline" onClick={() => setShowForm(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" className="self-start" onClick={() => setShowForm(true)}>
                {t("addGuardian")}
              </Button>
            )
          ) : null}
        </CardContent>
      </Card>

      {manage ? (
        student.status === "active" ? (
          <ConfirmButton
            label={t("markLeft")}
            question={t("leftTitle", { name: student.fullName })}
            detail={t("leftBody")}
            confirmLabel={t("confirm")}
            cancelLabel={t("cancel")}
            busy={setStatus.isPending}
            onConfirm={async () => {
              await setStatus.mutateAsync({ id: studentId, status: "left" });
              await refresh();
            }}
          />
        ) : (
          <Button
            variant="outline"
            className="self-start"
            onClick={async () => {
              await setStatus.mutateAsync({ id: studentId, status: "active" });
              await refresh();
            }}
          >
            {t("reinstate")}
          </Button>
        )
      ) : null}
    </div>
  );
}
