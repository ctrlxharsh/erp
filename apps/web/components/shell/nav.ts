import type { Permission } from "@erp/domain";
import {
  CalendarCheck,
  GraduationCap,
  LayoutGrid,
  type LucideIcon,
  School,
  Settings,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Key under `nav.` in the message catalog. */
  labelKey: "today" | "components" | "schools" | "setup" | "students" | "staff";
  icon: LucideIcon;
  /** Only shown to platform accounts (Super Admin, Platform Support). */
  platformOnly?: boolean;
  /** Only shown to people who hold this permission in their school. */
  permission?: Permission;
}

/** Modules are added here as each phase ships. */
export const navItems: NavItem[] = [
  { href: "/", labelKey: "today", icon: CalendarCheck },
  { href: "/platform/schools", labelKey: "schools", icon: School, platformOnly: true },
  {
    href: "/people/students",
    labelKey: "students",
    icon: GraduationCap,
    permission: "people.view",
  },
  { href: "/people/staff", labelKey: "staff", icon: Users, permission: "staff.view" },
  { href: "/setup/profile", labelKey: "setup", icon: Settings, permission: "school.setup" },
  { href: "/design", labelKey: "components", icon: LayoutGrid },
];
