"use client";

import type { AttendanceStatus } from "@erp/domain";
import { Check, Clock, Plane, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const options = [
  { value: "present", icon: Check, active: "bg-success text-success-foreground" },
  { value: "absent", icon: UserX, active: "bg-danger text-danger-foreground" },
  { value: "leave", icon: Plane, active: "bg-secondary text-secondary-foreground" },
  { value: "late", icon: Clock, active: "bg-warning text-warning-foreground" },
] as const;

/** Four mutually exclusive choices. Each shows an icon and a word, never colour alone. */
export function StatusPicker({
  name,
  legend,
  value,
  disabled,
  onChange,
}: {
  name: string;
  legend: string;
  value: AttendanceStatus | null;
  disabled?: boolean;
  onChange: (status: AttendanceStatus) => void;
}) {
  const t = useTranslations("attendance");
  return (
    <fieldset className="flex gap-1" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      {options.map(({ value: option, icon: Icon, active }) => {
        const selected = value === option;
        return (
          <label
            key={option}
            className={cn(
              "flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-1 rounded-md border border-border px-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
              selected ? `${active} border-transparent` : "bg-background hover:bg-muted",
              disabled && "cursor-default opacity-80",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={selected}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            <Icon className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t(option)}</span>
            <span className="sm:hidden">{t(option).slice(0, 1)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
