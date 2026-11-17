import { cn } from "@/lib/utils";
import { type Tone, toneFill } from "./tone";

/** A thin bar plus visible numbers, so the value never depends on colour alone. */
export function ProgressBar({
  value,
  total,
  tone = "teal",
  className,
}: {
  value: number;
  total: number;
  tone?: Tone;
  className?: string;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span aria-hidden="true" className="flex h-1.5 flex-1 rounded-full bg-border">
        <span className={cn("rounded-full", toneFill[tone])} style={{ width: `${percent}%` }} />
      </span>
      <span className="text-sm tabular-nums text-muted-foreground">
        {value}/{total}
      </span>
    </div>
  );
}
