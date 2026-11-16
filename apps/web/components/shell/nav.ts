import { CalendarCheck, LayoutGrid, type LucideIcon, School } from "lucide-react";

export interface NavItem {
  href: string;
  /** Key under `nav.` in the message catalog. */
  labelKey: "today" | "components" | "schools";
  icon: LucideIcon;
  /** Only shown to platform accounts (Super Admin, Platform Support). */
  platformOnly?: boolean;
}

/** Modules are added here as each phase ships. */
export const navItems: NavItem[] = [
  { href: "/", labelKey: "today", icon: CalendarCheck },
  { href: "/platform/schools", labelKey: "schools", icon: School, platformOnly: true },
  { href: "/design", labelKey: "components", icon: LayoutGrid },
];
