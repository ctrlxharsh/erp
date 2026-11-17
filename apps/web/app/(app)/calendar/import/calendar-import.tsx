"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useTRPC } from "@/lib/trpc/client";

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function CalendarImport() {
  const t = useTranslations("calendar");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const template = useQuery({ ...trpc.calendar.template.queryOptions(), enabled: false });
  const preview = useMutation(trpc.calendar.preview.mutationOptions());
  const commit = useMutation(trpc.calendar.commit.mutationOptions());
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [result, setResult] = useState<{
    totalRows: number;
    validRows: number;
    errors: { row: number; messages: string[] }[];
  } | null>(null);

  async function downloadTemplate() {
    const { data } = await template.refetch();
    if (!data) return;
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = data.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function choose(selected: File | undefined) {
    if (!selected) return;
    setResult(null);
    try {
      const base64 = await toBase64(selected);
      setFile(base64);
      setResult(await preview.mutateAsync({ fileBase64: base64 }));
    } catch (error) {
      setFile(null);
      toast.error(error instanceof Error ? error.message : t("cancel"));
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/calendar" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <PageHeader title={t("importTitle")} />
      <Card>
        <CardContent className="flex flex-wrap gap-3 py-4">
          <Button variant="secondary" loading={template.isFetching} onClick={downloadTemplate}>
            {t("downloadTemplate")}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label={t("chooseFile")}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            loading={preview.isPending}
            onClick={() => input.current?.click()}
          >
            {preview.isPending ? t("checking") : t("chooseFile")}
          </Button>
        </CardContent>
      </Card>
      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("rowsFound", { count: result.totalRows })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-success">{t("rowsOk", { count: result.validRows })}</p>
            {result.errors.length > 0 ? (
              <div role="alert" className="rounded-md bg-danger/10 p-3">
                <p className="font-medium text-danger">
                  {t("rowsBad", { count: result.errors.length })}
                </p>
                <p className="mb-2 text-sm">{t("fixAndRetry")}</p>
                <ul className="max-h-64 overflow-y-auto text-sm">
                  {result.errors.map((error) => (
                    <li key={error.row}>
                      <span className="font-medium">{t("rowLabel", { row: error.row })}:</span>{" "}
                      {error.messages.join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Button
                className="self-start"
                loading={commit.isPending}
                onClick={async () => {
                  if (!file) return;
                  try {
                    const done = await commit.mutateAsync({ fileBase64: file });
                    toast.success(t("imported", { count: done.created }));
                    setResult(null);
                    setFile(null);
                    await queryClient.invalidateQueries({
                      queryKey: trpc.calendar.list.queryKey(),
                    });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("cancel"));
                  }
                }}
              >
                {t("importNow", { count: result.validRows })}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
