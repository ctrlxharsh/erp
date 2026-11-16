"use client";

import { Bell, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsButton() {
  const t = useTranslations("shell");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("notifications")}>
          <Bell className="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
        <p className="px-3 pb-3 text-sm text-muted-foreground">{t("noNotifications")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ name }: { name: string }) {
  const t = useTranslations("shell");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("userMenu")}>
          <User className="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t("signedInAs")} {name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>{t("profile")}</DropdownMenuItem>
        <DropdownMenuItem>{t("signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
