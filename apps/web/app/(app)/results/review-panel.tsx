"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { resultBadge } from "../marks/marks-list";

type Key = { examId: string; sectionId: string; subjectId: string };
const keyOf = (b: Key) => `${b.examId}:${b.sectionId}:${b.subjectId}`;

export function ReviewPanel() {
  const t = useTranslations("results");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"submitted" | "approved" | "rejected" | "published">(
    "submitted",
  );
  const [open, setOpen] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const list = useQuery(trpc.results.review.queryOptions({ status }));
  const approve = useMutation(trpc.results.approve.mutationOptions());
  const reject = useMutation(trpc.results.reject.mutationOptions());
  const publish = useMutation(trpc.results.publish.mutationOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.results.review.queryKey() });
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("rejectConfirm"));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-primary">{t("reviewTitle")}</h1>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="rv-status">{t("filter")}</Label>
          <Select
            id="rv-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {(["submitted", "approved", "rejected", "published"] as const).map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </Select>
        </div>
        {status === "approved" && list.data && list.data.length > 0 ? (
          <Button
            loading={publish.isPending}
            onClick={async () => {
              try {
                const r = await publish.mutateAsync({
                  batches: list.data.map((b) => ({
                    examId: b.examId,
                    sectionId: b.sectionId,
                    subjectId: b.subjectId,
                  })),
                });
                toast.success(t("publishedN", { count: r.published }));
                await refresh();
              } catch (error) {
                fail(error);
              }
            }}
          >
            {t("publishAll")}
          </Button>
        ) : null}
      </div>
      {list.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {list.data?.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((b) => {
          const id = keyOf(b);
          return (
            <li key={id} className="flex flex-col gap-2 rounded-md border border-border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {b.examName} · {b.subjectName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {b.sectionLabel}
                    {b.teacherName ? ` · ${t("by", { name: b.teacherName })}` : ""}
                  </p>
                </div>
                <StatusBadge status={resultBadge[b.status] ?? "draft"} label={t(b.status)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setOpen(open === id ? null : id)}>
                  {open === id ? t("hide") : t("open")}
                </Button>
                {b.status === "submitted" ? (
                  <>
                    <Button
                      loading={approve.isPending}
                      onClick={async () => {
                        try {
                          await approve.mutateAsync(b);
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
                      onClick={() => setRejecting(rejecting === id ? null : id)}
                    >
                      {t("reject")}
                    </Button>
                  </>
                ) : null}
                {b.status === "approved" ? (
                  <Button
                    loading={publish.isPending}
                    onClick={async () => {
                      try {
                        await publish.mutateAsync({ batches: [b] });
                        await refresh();
                      } catch (error) {
                        fail(error);
                      }
                    }}
                  >
                    {t("publish")}
                  </Button>
                ) : null}
              </div>
              {rejecting === id ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    try {
                      await reject.mutateAsync({
                        examId: b.examId,
                        sectionId: b.sectionId,
                        subjectId: b.subjectId,
                        comment,
                      });
                      setRejecting(null);
                      setComment("");
                      await refresh();
                    } catch (error) {
                      fail(error);
                    }
                  }}
                >
                  <div className="flex min-w-60 flex-1 flex-col gap-1.5">
                    <Label htmlFor={`rj-${id}`}>{t("rejectReason")}</Label>
                    <Input
                      id={`rj-${id}`}
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
              {open === id ? <BatchMarks batch={b} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BatchMarks({ batch }: { batch: Key & { maxMarks: number } }) {
  const t = useTranslations("results");
  const trpc = useTRPC();
  const sheet = useQuery(
    trpc.marks.sheet.queryOptions({
      examId: batch.examId,
      sectionId: batch.sectionId,
      subjectId: batch.subjectId,
    }),
  );
  if (sheet.isPending) return <Skeleton className="h-16 w-full" />;
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr>
          <th className="py-1 font-medium">{t("student")}</th>
          <th className="py-1 font-medium">{t("marks")}</th>
        </tr>
      </thead>
      <tbody>
        {sheet.data?.students.map((s) => (
          <tr key={s.id} className="border-t border-border">
            <td className="py-1">{s.fullName}</td>
            <td className="py-1">
              {s.absent ? t("absent") : `${s.marks} ${t("outOf", { max: batch.maxMarks })}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
