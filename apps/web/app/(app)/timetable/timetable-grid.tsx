"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface GridPeriod {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}
export interface GridEntry {
  id: string;
  weekday: number;
  periodId: string;
  sectionLabel: string;
  subjectName: string;
  staffName: string | null;
}

const days = [1, 2, 3, 4, 5, 6] as const;
const dayKey = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" } as const;

/** A week grid: one row per period, one column per day. Cells are buttons when `onSelect` is given. */
export function TimetableGrid({
  periods,
  entries,
  showSection,
  selected,
  onSelect,
}: {
  periods: GridPeriod[];
  entries: GridEntry[];
  /** Show the class name in each cell (a teacher's timetable spans several classes). */
  showSection?: boolean;
  selected?: { weekday: number; periodId: string } | null;
  onSelect?: (slot: { weekday: number; periodId: string }) => void;
}) {
  const t = useTranslations("timetable");
  const at = (weekday: number, periodId: string) =>
    entries.find((e) => e.weekday === weekday && e.periodId === periodId);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead className="bg-surface">
          <tr>
            <th scope="col" className="border-b border-border px-3 py-2 font-medium">
              {t("period")}
            </th>
            {days.map((d) => (
              <th key={d} scope="col" className="border-b border-border px-3 py-2 font-medium">
                {t(dayKey[d])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id} className="border-b border-border last:border-0">
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                {period.name}
                <span className="block text-xs font-normal text-muted-foreground">
                  {period.startTime}–{period.endTime}
                </span>
              </th>
              {days.map((d) => {
                const entry = at(d, period.id);
                const isSelected = selected?.weekday === d && selected.periodId === period.id;
                const content = entry ? (
                  <>
                    <span className="block font-medium">{entry.subjectName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[showSection ? entry.sectionLabel : null, entry.staffName]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{onSelect ? "+" : "—"}</span>
                );
                return (
                  <td key={d} className="p-1 align-top">
                    {onSelect ? (
                      <button
                        type="button"
                        aria-label={t("slot", { day: t(dayKey[d]), period: period.name })}
                        aria-pressed={isSelected}
                        onClick={() => onSelect({ weekday: d, periodId: period.id })}
                        className={cn(
                          "min-h-12 w-full rounded-md px-2 py-1 text-left hover:bg-muted",
                          isSelected && "bg-primary/10 ring-2 ring-primary",
                        )}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="min-h-12 px-2 py-1">{content}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
