"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

export function ExamsList() {
  const t = useTranslations("exams");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const list = useQuery(trpc.exams.list.queryOptions());
  const create = useMutation(trpc.exams.create.mutationOptions());
  const [name, setName] = useState("");

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={t("title")} />
      {can("exams.manage") ? (
        <form
          className="flex max-w-md flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await create.mutateAsync({ name });
              setName("");
              await queryClient.invalidateQueries({ queryKey: trpc.exams.list.queryKey() });
              toast.success(t("created"));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("cancel"));
            }
          }}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="exam-name">{t("examName")}</Label>
            <Input
              id="exam-name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" loading={create.isPending}>
            {t("create")}
          </Button>
        </form>
      ) : null}
      {list.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {list.data?.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((exam) => (
          <li key={exam.id}>
            <Link
              href={`/exams/${exam.id}`}
              className="flex items-center justify-between rounded-md border border-border px-4 py-3 hover:bg-muted"
            >
              <span className="font-medium">{exam.name}</span>
              <span className="text-sm text-muted-foreground">
                {t("subjects", { count: exam.subjectCount })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
