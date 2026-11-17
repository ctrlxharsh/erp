"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useTRPC } from "@/lib/trpc/client";

interface Preview {
  totalRows: number;
  validRows: number;
  errors: { row: number; messages: string[] }[];
  sample: { row: number; admissionNo: string; fullName: string; section: string }[];
}

/** Reads a file as base64 without the data-URL prefix. */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function ImportWizard() {
  const t = useTranslations("people");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const template = useQuery({
    ...trpc.people.studentImport.template.queryOptions(),
    enabled: false,
  });
  const preview = useMutation(trpc.people.studentImport.preview.mutationOptions());
  const commit = useMutation(trpc.people.studentImport.commit.mutationOptions());
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [result, setResult] = useState<Preview | null>(null);
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState<{ created: number; guardiansCreated: number } | null>(null);

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
    setDone(null);
    setResult(null);
    setConsent(false);
    try {
      const base64 = await toBase64(selected);
      setFile(base64);
      setResult(await preview.mutateAsync({ fileBase64: base64 }));
    } catch (error) {
      setFile(null);
      toast.error(error instanceof Error ? error.message : t("importFailed"));
    }
  }

  async function runImport() {
    if (!file) return;
    try {
      const outcome = await commit.mutateAsync({ fileBase64: file, consentConfirmed: true });
      setDone(outcome);
      setResult(null);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: trpc.people.students.list.queryKey() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("importFailed"));
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/people/students" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <PageHeader title={t("importTitle")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("importStep1")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" loading={template.isFetching} onClick={downloadTemplate}>
            {t("downloadTemplate")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("importStep2")}</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label={t("chooseFile")}
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = "";
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
            <CardTitle>{t("importStep3")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>{t("rowsFound", { count: result.totalRows })}</p>
            <p className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t("rowsOk", { count: result.validRows })}
            </p>
            {result.errors.length > 0 ? (
              <div role="alert" className="flex flex-col gap-2 rounded-md bg-danger/10 p-3">
                <p className="flex items-center gap-2 font-medium text-danger">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  {t("rowsBad", { count: result.errors.length })}
                </p>
                <p className="text-sm">{t("fixAndRetry")}</p>
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                  {result.errors.map((error) => (
                    <li key={error.row}>
                      <span className="font-medium">{t("rowLabel", { row: error.row })}:</span>{" "}
                      {error.messages.join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div>
                  <p className="mb-1 text-sm font-medium">{t("sampleTitle")}</p>
                  <ul className="text-sm text-muted-foreground">
                    {result.sample.map((s) => (
                      <li key={s.row}>
                        {s.admissionNo} · {s.fullName} · {s.section}
                      </li>
                    ))}
                  </ul>
                </div>
                <label className="flex min-h-10 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  {t("importConsent")}
                </label>
                <Button
                  className="self-start"
                  disabled={!consent}
                  loading={commit.isPending}
                  onClick={runImport}
                >
                  {t("importNow", { count: result.validRows })}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {done ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-success">
          {t("importDone", { created: done.created })}
          {done.guardiansCreated > 0
            ? `. ${t("importDoneGuardians", { guardians: done.guardiansCreated })}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
