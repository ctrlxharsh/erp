"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { noticeBadge } from "../notices-list";

export function NoticeDetail({ noticeId }: { noticeId: string }) {
  const t = useTranslations("notices");
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.notices.get.queryOptions({ id: noticeId }));
  const approve = useMutation(trpc.notices.approve.mutationOptions());
  const reject = useMutation(trpc.notices.reject.mutationOptions());
  const submit = useMutation(trpc.notices.submit.mutationOptions());
  const remove = useMutation(trpc.notices.delete.mutationOptions());
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [sharing, setSharing] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.notices.get.queryKey({ id: noticeId }) });
    await queryClient.invalidateQueries({ queryKey: trpc.notices.list.queryKey() });
  };
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("cancel"));

  /** Shares the notice picture where the device allows it (phones), otherwise downloads it. */
  async function shareImage(title: string) {
    setSharing(true);
    try {
      const response = await fetch(`/api/notices/${noticeId}/image`);
      if (!response.ok) throw new Error("image");
      const blob = await response.blob();
      const file = new File([blob], "notice.webp", { type: "image/webp" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: t("shareText", { title }) });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "notice.webp";
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error(t("shareFailed"));
    } finally {
      setSharing(false);
    }
  }

  if (query.isPending) return <Skeleton className="h-48 w-full max-w-2xl" />;
  if (query.isError || !query.data) return <p role="alert">{query.error?.message}</p>;
  const notice = query.data;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/notices" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-primary">{notice.title}</h1>
        <StatusBadge
          status={noticeBadge[notice.status] ?? "draft"}
          label={notice.status === "rejected" ? t("rejectedStatus") : t(notice.status)}
        />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {[
              notice.refLabel ? t("ref", { ref: notice.refLabel }) : null,
              notice.authorName ? t("by", { name: notice.authorName }) : null,
              t(notice.audience),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="whitespace-pre-wrap">{notice.body}</p>
          {notice.status === "rejected" && notice.decisionComment ? (
            <p role="status" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              {t("sentBack", { comment: notice.decisionComment })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {notice.status === "published" ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/notices/${noticeId}/pdf`} target="_blank" rel="noopener noreferrer">
              {t("viewPdf")}
            </a>
          </Button>
          <Button variant="secondary" loading={sharing} onClick={() => shareImage(notice.title)}>
            {sharing ? t("sharing") : t("shareWhatsApp")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-2">
        {notice.canSubmit ? (
          <Button
            loading={submit.isPending}
            onClick={async () => {
              try {
                const result = await submit.mutateAsync({ id: noticeId });
                toast.success(
                  result.status === "published" ? t("publishedNow") : t("sentForApproval"),
                );
                await refresh();
              } catch (error) {
                fail(error);
              }
            }}
          >
            {t("send")}
          </Button>
        ) : null}
        {notice.canEdit ? (
          <Button asChild variant="outline">
            <Link href={`/notices/${noticeId}/edit`}>{t("edit")}</Link>
          </Button>
        ) : null}
        {notice.canDelete ? (
          <ConfirmButton
            label={t("delete")}
            question={t("deleteNamed", { name: notice.title })}
            detail={t("cannotUndo")}
            confirmLabel={t("confirm")}
            cancelLabel={t("cancel")}
            busy={remove.isPending}
            onConfirm={async () => {
              try {
                await remove.mutateAsync({ id: noticeId });
                router.push("/notices");
              } catch (error) {
                fail(error);
              }
            }}
          />
        ) : null}
      </div>

      {notice.canDecide ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {rejecting ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await reject.mutateAsync({ id: noticeId, comment });
                    toast.success(t("rejected"));
                    setRejecting(false);
                    await refresh();
                  } catch (error) {
                    fail(error);
                  }
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reject-reason">{t("rejectReason")}</Label>
                  <Input
                    id="reject-reason"
                    required
                    minLength={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" loading={reject.isPending}>
                    {t("rejectConfirm")}
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  loading={approve.isPending}
                  onClick={async () => {
                    try {
                      await approve.mutateAsync({ id: noticeId });
                      toast.success(t("approved"));
                      await refresh();
                    } catch (error) {
                      fail(error);
                    }
                  }}
                >
                  {t("approve")}
                </Button>
                <Button variant="outline" onClick={() => setRejecting(true)}>
                  {t("reject")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
