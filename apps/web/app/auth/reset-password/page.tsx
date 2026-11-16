import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface p-4">
      <h1 className="text-2xl font-semibold text-primary">{t("resetTitle")}</h1>
      <div className="w-full max-w-sm rounded-md border border-border bg-background p-6">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
