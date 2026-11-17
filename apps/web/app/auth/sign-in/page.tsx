import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/logo-128.webp" alt="" width={64} height={64} priority />
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
      <p className="text-xs text-muted-foreground">{t("poweredBy")}</p>
    </main>
  );
}
