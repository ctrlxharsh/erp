"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";

/** Below the md breakpoint the sidebar becomes a toggled panel under the top bar. */
export function MobileNav({
  isPlatform = false,
  permissions = [],
}: {
  isPlatform?: boolean;
  permissions?: string[];
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? t("closeMenu") : t("openMenu")}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </Button>
      {open ? (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-16 z-40 border-b border-border bg-background"
        >
          <SidebarNav
            isPlatform={isPlatform}
            permissions={permissions}
            onNavigate={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
