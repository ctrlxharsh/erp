import { CalendarCheck, LayoutGrid, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  /** Key under `nav.` in the message catalog. */
  labelKey: "today" | "components";
  icon: LucideIcon;
}

/** Modules are added here as each phase ships. */
export const navItems: NavItem[] = [
  { href: "/", labelKey: "today", icon: CalendarCheck },
  { href: "/design", labelKey: "components", icon: LayoutGrid },
];
