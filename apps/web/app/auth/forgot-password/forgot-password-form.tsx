"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    } catch {
      // Same message either way: never reveal whether an account exists.
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {sent ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {t("linkSent")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" loading={busy}>
            {t("sendLink")}
          </Button>
        </>
      )}
      <Link href="/auth/sign-in" className="text-center text-sm text-primary underline">
        {t("backToSignIn")}
      </Link>
    </form>
  );
}
