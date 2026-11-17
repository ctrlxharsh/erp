import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
