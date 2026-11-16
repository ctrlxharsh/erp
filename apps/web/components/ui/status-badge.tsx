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
  submitted: { icon: Send, className: "bg-secondary/10 text-secondary" },
  late: { icon: TimerOff, className: "bg-warning text-warning-foreground" },
  approved: { icon: CheckCircle2, className: "bg-success/10 text-success" },
  rejected: { icon: XCircle, className: "bg-danger/10 text-danger" },
  published: { icon: Megaphone, className: "bg-primary/10 text-primary" },
  draft: { icon: FileEdit, className: "bg-muted text-muted-foreground" },
} satisfies Record<string, { icon: LucideIcon; className: string }>;

export type Status = keyof typeof statusStyles;

export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const { icon: Icon, className } = statusStyles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
