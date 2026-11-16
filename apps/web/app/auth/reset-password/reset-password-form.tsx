"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "invalid" | "short">("idle");

  if (!token || params.get("error")) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {t("resetInvalid")}
        </p>
        <Link href="/auth/forgot-password" className="text-center text-sm text-primary underline">
          {t("forgot")}
        </Link>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setState("short");
    setState("busy");
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token: token ?? "",
      });
      if (error) throw error;
      setState("done");
    } catch {
      setState("invalid");
    }
  }

  if (state === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {t("resetDone")}
        </p>
        <Button asChild>
          <Link href="/auth/sign-in">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">{t("newPassword")}</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-describedby="password-hint"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p
          id="password-hint"
          className={state === "short" ? "text-sm text-danger" : "text-sm text-muted-foreground"}
        >
          {state === "short" ? t("passwordShort") : t("passwordHint")}
        </p>
      </div>
      {state === "invalid" ? (
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {t("resetInvalid")}
        </p>
      ) : null}
      <Button type="submit" loading={state === "busy"}>
        {t("setPassword")}
      </Button>
    </form>
  );
}
