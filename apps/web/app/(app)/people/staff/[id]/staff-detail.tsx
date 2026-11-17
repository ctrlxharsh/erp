"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

export function StaffDetail({ staffId }: { staffId: string }) {
  const t = useTranslations("people");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const query = useQuery(trpc.people.staff.get.queryOptions({ id: staffId }));
  const setup = useQuery(trpc.setup.get.queryOptions());
  const assign = useMutation(trpc.people.staff.assign.mutationOptions());
  const unassign = useMutation(trpc.people.staff.unassign.mutationOptions());
  const invite = useMutation(trpc.people.invite.mutationOptions());
  const setStatus = useMutation(trpc.people.staff.setStatus.mutationOptions());
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.people.staff.get.queryKey({ id: staffId }) });
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("importFailed"));

  if (query.isPending) return <Skeleton className="h-48 w-full max-w-xl" />;
  if (query.isError || !query.data) return <p role="alert">{query.error?.message}</p>;
  const person = query.data;
  const manage = can("people.manage");

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Link href="/people/staff" className="text-sm text-primary underline">
        {t("backToStaff")}
      </Link>
      <PageHeader
        title={person.fullName}
        actions={
          <StatusBadge
            status={person.status === "active" ? "approved" : "draft"}
            label={person.status === "active" ? t("active") : t("left")}
          />
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("kind")}</dt>
            <dd>{person.kind === "teacher" ? t("teacher") : t("nonTeaching")}</dd>
            <dt className="text-muted-foreground">{t("email")}</dt>
            <dd>{person.email ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("phone")}</dt>
            <dd>{person.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("status")}</dt>
            <dd>{person.hasLogin ? t("hasLogin") : t("noLogin")}</dd>
          </dl>
          {manage && !person.hasLogin ? (
            <Button
              variant="outline"
              className="self-start"
              loading={invite.isPending}
              disabled={!person.email}
              title={person.email ? undefined : t("inviteNeedsEmail")}
              onClick={async () => {
                try {
                  const result = await invite.mutateAsync({ kind: "staff", id: staffId });
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
        </CardContent>
      </Card>

      {person.kind === "teacher" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("assignments")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {person.assignments.length === 0 ? (
              <p className="text-muted-foreground">{t("noAssignments")}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {person.assignments.map((a) => {
                const section = `${a.className} ${a.sectionName}`;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      {a.subjectName
                        ? t("teachesIn", { subject: a.subjectName, section })
                        : t("classTeacherOf", { section })}
                    </span>
                    {manage ? (
                      <ConfirmButton
                        label={t("unassign")}
                        question={t("unassign")}
                        confirmLabel={t("confirm")}
                        cancelLabel={t("cancel")}
                        onConfirm={async () => {
                          await unassign.mutateAsync({ id: a.id });
                          await refresh();
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {manage ? (
              <form
                className="flex flex-col gap-3 rounded-md border border-border p-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await assign.mutateAsync({ staffId, sectionId, subjectId: subjectId || null });
                    setSubjectId("");
                    await refresh();
                    toast.success(t("assigned"));
                  } catch (error) {
                    fail(error);
                  }
                }}
              >
                <p className="font-medium">{t("assignTitle")}</p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="a-section">{t("classSection")}</Label>
                  <Select
                    id="a-section"
                    required
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    <option value="">{t("chooseSection")}</option>
                    {setup.data?.classes.flatMap((c) =>
                      c.sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {c.name} {s.name}
                        </option>
                      )),
                    )}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="a-subject">{t("subjectOptional")}</Label>
                  <Select
                    id="a-subject"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">—</option>
                    {setup.data?.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="submit"
                  className="self-start"
                  loading={assign.isPending}
                  disabled={!sectionId}
                >
                  {t("assign")}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {manage && person.status === "active" ? (
        <ConfirmButton
          label={t("markLeft")}
          question={t("leftTitle", { name: person.fullName })}
          detail={t("leftBody")}
          confirmLabel={t("confirm")}
          cancelLabel={t("cancel")}
          busy={setStatus.isPending}
          onConfirm={async () => {
            await setStatus.mutateAsync({ id: staffId, status: "left" });
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}
