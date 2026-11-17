import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./card";
import { ProgressBar } from "./progress-bar";
import type { Tone } from "./tone";
import { ToneIcon } from "./tone-icon";

/** A headline number with an icon, optionally "of N" with a progress bar. */
export function StatTile({
  icon,
  tone,
  label,
  value,
  total,
  hint,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: number;
  total?: number;
  hint?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5 text-sm font-semibold text-muted-foreground">
        <ToneIcon icon={icon} tone={tone} size="sm" />
        {label}
      </div>
      <p className="font-heading text-3xl font-extrabold tracking-tight">
        {value}
        {total !== undefined ? (
          <span className="ml-1.5 text-base font-semibold text-muted-foreground">of {total}</span>
        ) : null}
      </p>
      {total !== undefined ? <ProgressBar value={value} total={total} tone={tone} /> : null}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
