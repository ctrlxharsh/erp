import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas p-4">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {t("forgotTitle")}
        </h1>
        <p className="mt-2 max-w-sm text-muted-foreground">{t("forgotBody")}</p>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
