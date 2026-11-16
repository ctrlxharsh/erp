"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

const schema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
type Values = z.infer<typeof schema>;

/** Only same-site paths are allowed as a post-login destination. */
function safeRedirect(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function isInvalidCredentials(error: unknown): boolean {
  const { code, message, status } = (error ?? {}) as {
    code?: string;
    message?: string;
    status?: number;
  };
  return (
    code === "INVALID_EMAIL_OR_PASSWORD" ||
    status === 401 ||
    /invalid email or password/i.test(message ?? "")
  );
}

export function SignInForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: "onBlur" });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      // The Neon Auth client reports failures as a returned `error` or as a thrown AuthApiError.
      const { error } = await authClient.signIn.email(values);
      if (error) throw error;
    } catch (error) {
      setFormError(isInvalidCredentials(error) ? t("invalid") : t("failed"));
      return;
    }
    router.replace(safeRedirect(params.get("redirectTo")));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="email-error" className="text-sm text-danger">
            {t("emailInvalid")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p id="password-error" className="text-sm text-danger">
            {t("passwordRequired")}
          </p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={isSubmitting}>
        {t("signIn")}
      </Button>
      <Link href="/auth/forgot-password" className="text-center text-sm text-primary underline">
        {t("forgot")}
      </Link>
    </form>
  );
}
