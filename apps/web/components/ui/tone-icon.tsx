import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Tone, toneClasses } from "./tone";

/** A rounded tile holding an icon in a module tone. Decorative: the label next to it carries meaning. */
export function ToneIcon({
  icon: Icon,
  tone,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        size === "sm" ? "size-8" : "size-9",
        toneClasses[tone],
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-[18px]"} />
    </span>
  );
}
