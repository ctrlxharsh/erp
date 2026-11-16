import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** A native select: works well with touch, keyboards and screen readers. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
