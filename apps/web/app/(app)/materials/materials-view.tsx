"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FilePicker, type PickedFile } from "@/components/file-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { useOpenFile } from "@/lib/use-open-file";
import { usePermissions } from "@/lib/use-permissions";

export function MaterialsView() {
  const t = useTranslations("materials");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openFile = useOpenFile();
  const { can } = usePermissions();
  const list = useQuery(trpc.classwork.material.list.queryOptions({}));
  const assignments = useQuery({
    ...trpc.classwork.myAssignments.queryOptions(),
    enabled: can("material.manage"),
  });
  const create = useMutation(trpc.classwork.material.create.mutationOptions());
  const [pair, setPair] = useState("");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);

  // One entry per class and subject (a teacher may take several sections of the same class).
  const options = [
    ...new Map((assignments.data ?? []).map((a) => [`${a.classId}|${a.subjectId}`, a])).values(),
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={t("title")} />

      {can("material.manage") ? (
        assignments.isSuccess && options.length === 0 ? (
          <p className="text-muted-foreground">{t("noAssignments")}</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("add")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex max-w-md flex-col gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const [classId = "", subjectId = ""] = pair.split("|");
                  try {
                    await create.mutateAsync({
                      classId,
                      subjectId,
                      title,
                      fileId: files[0]?.id ?? "",
                    });
                    setTitle("");
                    setFiles([]);
                    await queryClient.invalidateQueries({
                      queryKey: trpc.classwork.material.list.queryKey(),
                    });
                    toast.success(t("shared"));
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("fileFailed"));
                  }
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="m-pair">{t("pick")}</Label>
                  <Select
                    id="m-pair"
                    required
                    value={pair}
                    onChange={(e) => setPair(e.target.value)}
                  >
                    <option value="">{t("pick")}</option>
                    {options.map((a) => (
                      <option
                        key={`${a.classId}|${a.subjectId}`}
                        value={`${a.classId}|${a.subjectId}`}
                      >
                        {a.label.split(" ").slice(0, -1).join(" ")} · {a.subjectName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="m-title">{t("materialTitle")}</Label>
                  <Input
                    id="m-title"
                    required
                    minLength={2}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <FilePicker
                  purpose="study_material"
                  value={files}
                  onChange={setFiles}
                  label={t("chooseFile")}
                  busyLabel={t("uploading")}
                  failedMessage={t("fileFailed")}
                  removeLabel="×"
                />
                <Button
                  type="submit"
                  className="self-start"
                  loading={create.isPending}
                  disabled={!pair || !title || files.length === 0}
                >
                  {t("share")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )
      ) : null}

      {list.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {list.data?.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-3"
          >
            <div>
              <p className="font-medium">{m.title}</p>
              <p className="text-sm text-muted-foreground">
                {m.className} · {t("by", { subject: m.subjectName, teacher: m.teacherName })}
              </p>
            </div>
            <Button variant="outline" onClick={() => openFile(m.fileId)}>
              {t("download")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
