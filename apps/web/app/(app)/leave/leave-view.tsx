"use client";

import { applyLeaveInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { type Status, StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

type FormInput = z.input<typeof applyLeaveInputSchema>;
type FormOutput = z.output<typeof applyLeaveInputSchema>;
const badge: Record<string, Status> = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  cancelled: "draft",
};

export function LeaveView() {
  const { can } = usePermissions();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {can("leave.apply") ? <MyLeave /> : null}
      {can("leave.approve") ? <Requests /> : null}
    </div>
  );
}

function MyLeave() {
  const t = useTranslations("leave");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const types = useQuery(trpc.leave.types.queryOptions());
  const mine = useQuery(trpc.leave.mine.queryOptions());
  const submit = useMutation(trpc.leave.submit.mutationOptions());
  const cancel = useMutation(trpc.leave.cancel.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(applyLeaveInputSchema),
    mode: "onBlur",
    defaultValues: { leaveTypeId: "", fromDate: "", toDate: "", reason: "", fileIds: [] },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.leave.mine.queryKey() });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
      <form
        noValidate
        className="grid max-w-xl grid-cols-2 gap-3 rounded-md border border-border p-4"
        onSubmit={handleSubmit(async (values) => {
          try {
            await submit.mutateAsync(values);
            reset();
            await refresh();
            toast.success(t("sent"));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("submit"));
          }
        })}
      >
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="lv-type">{t("type")}</Label>
          <Select id="lv-type" {...register("leaveTypeId")}>
            <option value="">—</option>
            {types.data?.map((ty) => (
              <option key={ty.id} value={ty.id}>
                {ty.name}
              </option>
            ))}
          </Select>
          {errors.leaveTypeId ? (
            <p className="text-sm text-danger">{errors.leaveTypeId.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lv-from">{t("from")}</Label>
          <Input id="lv-from" type="date" {...register("fromDate")} />
          {errors.fromDate ? (
            <p className="text-sm text-danger">{errors.fromDate.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lv-to">{t("to")}</Label>
          <Input id="lv-to" type="date" {...register("toDate")} />
          {errors.toDate ? <p className="text-sm text-danger">{errors.toDate.message}</p> : null}
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="lv-reason">{t("reason")}</Label>
          <textarea
            id="lv-reason"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            {...register("reason")}
          />
          {errors.reason ? <p className="text-sm text-danger">{errors.reason.message}</p> : null}
        </div>
        <Button type="submit" className="col-span-2 self-start" loading={submit.isPending}>
          {t("submit")}
        </Button>
      </form>
      {mine.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {mine.data?.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {mine.data?.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {r.leaveTypeName} · {t("days", { from: r.fromDate, to: r.toDate })}
              </p>
              <p className="text-sm text-muted-foreground">{r.reason}</p>
              {r.decisionComment ? (
                <p className="text-sm">{t("comment", { comment: r.decisionComment })}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={badge[r.status] ?? "pending"} label={t(r.status)} />
              {r.status === "pending" ? (
                <ConfirmButton
                  label={t("cancel")}
                  question={t("confirmCancel")}
                  confirmLabel={t("yes")}
                  cancelLabel={t("no")}
                  onConfirm={async () => {
                    await cancel.mutateAsync({ id: r.id });
                    await refresh();
                  }}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Requests() {
  const t = useTranslations("leave");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.leave.review.queryOptions({}));
  const approve = useMutation(trpc.leave.approve.mutationOptions());
  const reject = useMutation(trpc.leave.reject.mutationOptions());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.leave.review.queryKey() });
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("rejectConfirm"));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold text-primary">{t("requests")}</h2>
      {list.data?.length === 0 ? <p className="text-muted-foreground">{t("noRequests")}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-md border border-border px-4 py-3">
            <div>
              <p className="font-medium">
                {t("by", { name: r.applicantName })} · {r.leaveTypeName}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("days", { from: r.fromDate, to: r.toDate })}
              </p>
              <p className="text-sm">{r.reason}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={approve.isPending}
                onClick={async () => {
                  try {
                    await approve.mutateAsync({ id: r.id });
                    toast.success(t("decided"));
                    await refresh();
                  } catch (error) {
                    fail(error);
                  }
                }}
              >
                {t("approve")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setRejecting(rejecting === r.id ? null : r.id)}
              >
                {t("reject")}
              </Button>
            </div>
            {rejecting === r.id ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await reject.mutateAsync({ id: r.id, comment });
                    setRejecting(null);
                    setComment("");
                    toast.success(t("decided"));
                    await refresh();
                  } catch (error) {
                    fail(error);
                  }
                }}
              >
                <div className="flex min-w-60 flex-1 flex-col gap-1.5">
                  <Label htmlFor={`lr-${r.id}`}>{t("rejectReason")}</Label>
                  <Input
                    id={`lr-${r.id}`}
                    required
                    minLength={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="danger" loading={reject.isPending}>
                  {t("rejectConfirm")}
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
