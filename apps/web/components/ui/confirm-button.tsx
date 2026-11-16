"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Destructive action with an inline confirmation that names the item (CONSTITUTION §7.4).
 * The first click only asks; nothing happens until the second, explicit click.
 */
export function ConfirmButton({
  label,
  question,
  detail,
  confirmLabel,
  cancelLabel,
  onConfirm,
  busy,
}: {
  label: string;
  question: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="ghost" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div
      role="alertdialog"
      aria-label={question}
      className="flex flex-wrap items-center gap-2 rounded-md bg-danger/10 p-2"
    >
      <span className="text-sm font-medium">{question}</span>
      {detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
      <Button
        variant="danger"
        loading={busy}
        onClick={async () => {
          await onConfirm();
          setAsking(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="outline" onClick={() => setAsking(false)}>
        {cancelLabel}
      </Button>
    </div>
  );
}
