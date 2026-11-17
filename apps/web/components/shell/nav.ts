import type { Permission } from "@erp/domain";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  Clock,
  GraduationCap as ExamIcon,
  FileCheck,
  FolderOpen,
  GraduationCap,
  LayoutGrid,
  type LucideIcon,
  Megaphone,
  NotebookPen,
  Pencil,
  School,
  Settings,
  Trophy,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Key under `nav.` in the message catalog. */
  labelKey:
    | "today"
    | "components"
    | "schools"
    | "setup"
    | "students"
    | "staff"
    | "calendar"
    | "timetable"
    | "attendance"
    | "homework"
    | "diary"
    | "materials"
    | "notices"
    | "exams"
    | "marks"
    | "results"
    | "reviewResults"
    | "leave"
    | "leaveRequests";
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
  { href: "/calendar", labelKey: "calendar", icon: CalendarDays, permission: "calendar.view" },
  { href: "/timetable", labelKey: "timetable", icon: Clock, permission: "timetable.view" },
  {
    href: "/attendance",
    labelKey: "attendance",
    icon: ClipboardCheck,
    permission: "attendance.view",
  },
  { href: "/homework", labelKey: "homework", icon: NotebookPen, permission: "homework.view" },
  { href: "/diary", labelKey: "diary", icon: BookOpen, permission: "diary.view" },
  { href: "/materials", labelKey: "materials", icon: FolderOpen, permission: "material.view" },
  { href: "/notices", labelKey: "notices", icon: Megaphone, permission: "notice.view" },
  { href: "/exams", labelKey: "exams", icon: ExamIcon, permission: "exams.view" },
  { href: "/marks", labelKey: "marks", icon: Pencil, permission: "marks.enter" },
  { href: "/results", labelKey: "results", icon: Trophy, permission: "results.view_own" },
  { href: "/results", labelKey: "reviewResults", icon: FileCheck, permission: "marks.approve" },
  { href: "/leave", labelKey: "leave", icon: CalendarOff, permission: "leave.apply" },
  { href: "/leave", labelKey: "leaveRequests", icon: CalendarOff, permission: "leave.approve" },
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
