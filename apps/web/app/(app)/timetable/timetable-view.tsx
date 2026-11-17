"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";
import { PeriodsPanel } from "./periods-panel";
import { TimetableGrid } from "./timetable-grid";

export function TimetableView() {
  const t = useTranslations("timetable");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const manage = can("timetable.manage");
  const setup = useQuery(trpc.setup.get.queryOptions());
  const home = useQuery(trpc.home.summary.queryOptions());
  const staff = useQuery({
    ...trpc.people.staff.list.queryOptions({ page: 1, pageSize: 50, search: "", kind: "teacher" }),
    enabled: manage,
  });

  const isTeacher = (home.data?.mySections.length ?? 0) > 0 || can("attendance.mark");
  const ownSectionId = home.data?.me?.sectionId ?? home.data?.children[0]?.sectionId ?? null;
  const [tab, setTab] = useState<"class" | "mine">("class");
  const [pickedSection, setPickedSection] = useState("");
  const sectionId = pickedSection || ownSectionId || "";
  const canPick = manage || can("people.view");

  const grid = useQuery({
    ...trpc.timetable.forSection.queryOptions({ sectionId }),
    enabled: Boolean(sectionId) && tab === "class",
  });
  const mine = useQuery({ ...trpc.timetable.mine.queryOptions(), enabled: tab === "mine" });
  const setEntry = useMutation(trpc.timetable.setEntry.mutationOptions());
  const clearEntry = useMutation(trpc.timetable.clearEntry.mutationOptions());

  const [slot, setSlot] = useState<{ weekday: number; periodId: string } | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [staffId, setStaffId] = useState("");

  const data = tab === "mine" ? mine.data : grid.data;
  const entries = data?.entries ?? [];
  const periods = data?.periods ?? [];
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.timetable.forSection.queryKey() });

  function select(next: { weekday: number; periodId: string }) {
    setSlot(next);
    const entry = entries.find((e) => e.weekday === next.weekday && e.periodId === next.periodId);
    setSubjectId(entry?.subjectId ?? "");
    setStaffId(entry?.staffId ?? "");
  }

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader title={t("title")} />

      {isTeacher ? (
        <div role="tablist" aria-label={t("title")} className="flex gap-1 border-b border-border">
          {(["class", "mine"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "min-h-10 border-b-2 px-3 text-sm font-medium",
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {key === "class" ? t("byClass") : t("myWeek")}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "class" && canPick ? (
        <div className="max-w-xs">
          <Label htmlFor="tt-section" className="sr-only">
            {t("chooseClass")}
          </Label>
          <Select
            id="tt-section"
            value={sectionId}
            onChange={(e) => {
              setPickedSection(e.target.value);
              setSlot(null);
            }}
          >
            <option value="">{t("chooseClass")}</option>
            {setup.data?.classes.flatMap((c) =>
              c.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {c.name} {s.name}
                </option>
              )),
            )}
          </Select>
        </div>
      ) : null}

      {(tab === "class" && !sectionId) ||
      (grid.isPending && tab === "class" && sectionId) ||
      (tab === "mine" && mine.isPending) ? (
        tab === "class" && !sectionId ? (
          <p className="text-muted-foreground">{canPick ? t("chooseClass") : t("noClassYet")}</p>
        ) : (
          <Skeleton className="h-48 w-full" />
        )
      ) : periods.length === 0 ? (
        <p className="text-muted-foreground">{manage ? t("noPeriodsAdmin") : t("noPeriods")}</p>
      ) : (
        <>
          <TimetableGrid
            periods={periods}
            entries={entries}
            showSection={tab === "mine"}
            selected={slot}
            onSelect={tab === "class" && manage ? select : undefined}
          />
          {tab === "mine" && entries.length === 0 ? (
            <p className="text-muted-foreground">{t("noEntries")}</p>
          ) : null}
        </>
      )}

      {tab === "class" && manage && slot ? (
        <form
          className="flex max-w-md flex-col gap-3 rounded-md border border-border p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const result = await setEntry.mutateAsync({
                sectionId,
                weekday: slot.weekday,
                periodId: slot.periodId,
                subjectId,
                staffId: staffId || null,
              });
              await refresh();
              toast.success(t("saved"));
              if (result.conflicts.length > 0) {
                const teacher = staff.data?.items.find((s) => s.id === staffId)?.fullName ?? "";
                toast.warning(
                  t("doubleBooked", { teacher, sections: result.conflicts.join(", ") }),
                );
              }
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("cancel"));
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slot-subject">{t("subject")}</Label>
            <Select
              id="slot-subject"
              required
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slot-teacher">{t("teacher")}</Label>
            <Select id="slot-teacher" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">{t("noTeacher")}</option>
              {staff.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={setEntry.isPending} disabled={!subjectId}>
              {t("saveSlot")}
            </Button>
            <Button
              variant="outline"
              loading={clearEntry.isPending}
              onClick={async () => {
                await clearEntry.mutateAsync({
                  sectionId,
                  weekday: slot.weekday,
                  periodId: slot.periodId,
                });
                await refresh();
                setSlot(null);
                toast.success(t("cleared"));
              }}
            >
              {t("clearSlot")}
            </Button>
          </div>
        </form>
      ) : tab === "class" && manage && periods.length > 0 && sectionId ? (
        <p className="text-sm text-muted-foreground">{t("editSlotHint")}</p>
      ) : null}

      {manage ? (
        <PeriodsPanel
          periods={data?.periods ?? []}
          onChanged={() =>
            queryClient.invalidateQueries({ queryKey: trpc.timetable.forSection.queryKey() })
          }
        />
      ) : null}
    </div>
  );
}
