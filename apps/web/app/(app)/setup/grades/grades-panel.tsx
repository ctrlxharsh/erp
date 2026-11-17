"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";

interface Band {
  grade: string;
  minPercent: string;
  gradePoint: string;
}

export function GradesPanel() {
  const t = useTranslations("grades");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.grades.get.queryOptions());
  const save = useMutation(trpc.grades.save.mutationOptions());
  const [bands, setBands] = useState<Band[]>([]);

  useEffect(() => {
    if (query.data)
      setBands(
        query.data.map((b) => ({
          grade: b.grade,
          minPercent: String(b.minPercent),
          gradePoint: String(b.gradePoint),
        })),
      );
  }, [query.data]);

  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  const update = (index: number, patch: Partial<Band>) =>
    setBands((all) => all.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-muted-foreground">{t("intro")}</p>
      <ul className="flex flex-col gap-2">
        <li className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-sm font-medium">
          <span>{t("grade")}</span>
          <span>{t("from")}</span>
          <span>{t("points")}</span>
          <span />
        </li>
        {bands.map((band, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place
          <li key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
            <Input
              aria-label={t("grade")}
              value={band.grade}
              onChange={(e) => update(index, { grade: e.target.value })}
            />
            <Input
              aria-label={t("from")}
              type="number"
              min={0}
              max={100}
              value={band.minPercent}
              onChange={(e) => update(index, { minPercent: e.target.value })}
            />
            <Input
              aria-label={t("points")}
              type="number"
              min={0}
              value={band.gradePoint}
              onChange={(e) => update(index, { gradePoint: e.target.value })}
            />
            <Button
              variant="ghost"
              onClick={() => setBands((all) => all.filter((_, i) => i !== index))}
            >
              {t("remove")}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() =>
            setBands((all) => [...all, { grade: "", minPercent: "0", gradePoint: "0" }])
          }
        >
          {t("add")}
        </Button>
        <Button
          loading={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({
                bands: bands.map((b) => ({
                  grade: b.grade,
                  minPercent: Number(b.minPercent),
                  gradePoint: Number(b.gradePoint),
                })),
              });
              await queryClient.invalidateQueries({ queryKey: trpc.grades.get.queryKey() });
              toast.success(t("saved"));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("save"));
            }
          }}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
