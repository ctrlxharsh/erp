import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-primary">{t("forgotTitle")}</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">{t("forgotBody")}</p>
      </div>
      <div className="w-full max-w-sm rounded-md border border-border bg-background p-6">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
