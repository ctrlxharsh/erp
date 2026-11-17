import {
  CheckCircle2,
  Clock,
  FileEdit,
  type LucideIcon,
  Megaphone,
  Send,
  TimerOff,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared status vocabulary (CONSTITUTION §7.4, §9.9). Always icon + text + colour. */
export const statusStyles = {
  pending: { icon: Clock, className: "bg-muted text-foreground" },
  submitted: { icon: Send, className: "bg-tone-teal text-tone-teal-foreground" },
  late: { icon: TimerOff, className: "bg-warning text-warning-foreground" },
  approved: { icon: CheckCircle2, className: "bg-success/10 text-success" },
  rejected: { icon: XCircle, className: "bg-tone-coral text-tone-coral-foreground" },
  published: { icon: Megaphone, className: "bg-tone-navy text-tone-navy-foreground" },
  draft: { icon: FileEdit, className: "bg-muted text-muted-foreground" },
} satisfies Record<string, { icon: LucideIcon; className: string }>;

export type Status = keyof typeof statusStyles;

export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const { icon: Icon, className } = statusStyles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
