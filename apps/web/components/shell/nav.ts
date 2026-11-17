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
import type { Tone } from "@/components/ui/tone";

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
  /** Module colour (ADR-031). */
  tone: Tone;
  /** Only shown to platform accounts (Super Admin, Platform Support). */
  platformOnly?: boolean;
  /** Only shown to people who hold this permission in their school. */
  permission?: Permission;
}

/** Modules are added here as each phase ships. */
export const navItems: NavItem[] = [
  { href: "/", labelKey: "today", tone: "navy", icon: CalendarCheck },
  {
    href: "/platform/schools",
    labelKey: "schools",
    tone: "navy",
    icon: School,
    platformOnly: true,
  },
  {
    href: "/calendar",
    labelKey: "calendar",
    tone: "navy",
    icon: CalendarDays,
    permission: "calendar.view",
  },
  {
    href: "/timetable",
    labelKey: "timetable",
    tone: "navy",
    icon: Clock,
    permission: "timetable.view",
  },
  {
    href: "/attendance",
    labelKey: "attendance",
    tone: "teal",
    icon: ClipboardCheck,
    permission: "attendance.view",
  },
  {
    href: "/homework",
    labelKey: "homework",
    tone: "saffron",
    icon: NotebookPen,
    permission: "homework.view",
  },
  { href: "/diary", labelKey: "diary", tone: "saffron", icon: BookOpen, permission: "diary.view" },
  {
    href: "/materials",
    labelKey: "materials",
    tone: "saffron",
    icon: FolderOpen,
    permission: "material.view",
  },
  {
    href: "/notices",
    labelKey: "notices",
    tone: "navy",
    icon: Megaphone,
    permission: "notice.view",
  },
  { href: "/exams", labelKey: "exams", tone: "coral", icon: ExamIcon, permission: "exams.view" },
  { href: "/marks", labelKey: "marks", tone: "coral", icon: Pencil, permission: "marks.enter" },
  {
    href: "/results",
    labelKey: "results",
    tone: "coral",
    icon: Trophy,
    permission: "results.view_own",
  },
  {
    href: "/results",
    labelKey: "reviewResults",
    tone: "coral",
    icon: FileCheck,
    permission: "marks.approve",
  },
  {
    href: "/leave",
    labelKey: "leave",
    tone: "saffron",
    icon: CalendarOff,
    permission: "leave.apply",
  },
  {
    href: "/leave",
    labelKey: "leaveRequests",
    tone: "saffron",
    icon: CalendarOff,
    permission: "leave.approve",
  },
  {
    href: "/people/students",
    labelKey: "students",
    tone: "teal",
    icon: GraduationCap,
    permission: "people.view",
  },
  { href: "/people/staff", labelKey: "staff", tone: "teal", icon: Users, permission: "staff.view" },
  {
    href: "/setup/profile",
    labelKey: "setup",
    tone: "slate",
    icon: Settings,
    permission: "school.setup",
  },
  { href: "/design", labelKey: "components", tone: "slate", icon: LayoutGrid },
];
