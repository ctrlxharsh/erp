# ERP — Project Constitution

> **Product:** ERP · **Built by:** PastAndPixels Group
> **Status:** Approved baseline · **Version:** 1.0 · **Date:** 2026-11-16
>
> This document is the single source of truth for *what* we build and *how*. Every design, code and review decision must be consistent with it. When reality forces a change, amend this file **and** add an entry to [`docs/DECISIONS.md`](docs/DECISIONS.md) in the same pull request. Anything not covered here is an **open decision**: ask, don't assume.

---

## Table of contents

1. [Product](#1-product)
2. [Non-negotiables](#2-non-negotiables)
3. [Users, roles and permissions](#3-users-roles-and-permissions)
4. [Apps and platforms](#4-apps-and-platforms)
5. [Tech stack](#5-tech-stack)
6. [Architecture](#6-architecture)
7. [Design system and UX rules](#7-design-system-and-ux-rules)
8. [Data model essentials](#8-data-model-essentials)
9. [Modules and workflows by role](#9-modules-and-workflows-by-role)
10. [Notifications](#10-notifications)
11. [Security and privacy](#11-security-and-privacy)
12. [Environments, deployment and backups](#12-environments-deployment-and-backups)
13. [Quality: testing, CI and monitoring](#13-quality-testing-ci-and-monitoring)
14. [Git and GitHub workflow](#14-git-and-github-workflow)
15. [Roadmap](#15-roadmap)
16. [Out of scope (for now)](#16-out-of-scope-for-now)
17. [Open items](#17-open-items)
18. [Glossary](#18-glossary)

---

## 1. Product

**ERP** is a multi-school management platform made by **PastAndPixels Group**. The platform owner (Super Admin) onboards schools. Each school then runs its own administration, academics, communication and fee records in an isolated space, with logins for School Admin, Principal, Teacher, Student and Parent.

- **Market:** India first. Prices in INR, academic session April–March by default, CBSE-style grading by default (configurable per school), timezone `Asia/Kolkata`.
- **Language:** English UI now. Every user-facing string goes through the i18n layer so Hindi and other languages can be added later without touching components.
- **Surfaces:** a **web app** (all roles; the only surface for Super Admin and School Admin) and an **Android app** (Principal, Teacher, Student, Parent) built later in the same monorepo.

### Product principles (in priority order)

1. **Anyone can use it.** A first-time teacher, a busy principal or a parent with a basic phone should finish their task without training. Plain words, obvious next steps, nothing hidden.
2. **Fewest steps for daily work.** Marking attendance, recording a fee payment and publishing a notice are the most frequent tasks and must be the fastest.
3. **Clean and calm.** No decorative animation, no gradients, no clutter. Motion only when it explains a change of state.
4. **Consistent everywhere.** The same patterns for lists, forms, filters, statuses and confirmations on every screen and on both apps.
5. **Boring, proven technology.** Well-known libraries over custom code, and one library per job.

---

## 2. Non-negotiables

These rules hold in every phase. Breaking one blocks a merge.

1. **Authorization is enforced on the server.** Hiding a button is UX, never security. Every API procedure checks the caller's permission and school.
2. **Schools are isolated.** Every school-owned row carries `school_id`. All reads and writes go through the scoped data-access layer. Automated tests prove one school can never read or change another school's data.
3. **Sensitive actions are audited.** Logins, view-as sessions, role changes, attendance edits after the window, marks approval, fee entries and reversals, school lifecycle changes and data exports write to an append-only audit log.
4. **Money records are append-only.** Fee payments and subscription payments are never edited or deleted. Mistakes are corrected with a reversal entry. Amounts are stored as integer paise.
5. **Files never go in database tables.** Files live in private object storage; the database stores the key and metadata.
6. **All stored images are WebP.** Every uploaded image is converted to WebP on the server and stripped of EXIF/GPS metadata. Documents stay PDF.
7. **Validate all input** with shared Zod schemas, on the server, even when the client already validated.
8. **No secrets in code or logs.** Environment variables only; logs never contain passwords, tokens or children's personal data beyond IDs.
9. **Accessible by default.** Keyboard reachable, visible focus, labels on every input, WCAG AA contrast, status never shown by color alone.

---

## 3. Users, roles and permissions

### 3.1 Roles

Roles are **fixed** in this version. Schools cannot create custom roles.

| Role | Scope | Web | Mobile | Purpose |
|---|---|:-:|:-:|---|
| **Super Admin** | Platform | ✅ | — | Onboards and manages schools, plans, platform users, support, platform reports, audit. |
| **Platform Support** | Platform | ✅ | — | Read-only platform access for support staff (a limited Super Admin). |
| **School Admin** | One school | ✅ | — | Runs the school: setup, people, timetable, fee records, calendar, notices (with approval), promotion. |
| **Principal** | One school | ✅ | ✅ | Oversight and approvals: results, notices, teacher leave; complaints; reports. |
| **Teacher** | One school | ✅ | ✅ | Attendance, homework, class diary, study material, marks, own leave. |
| **Student** | One school | ✅ | ✅ | Views own timetable, attendance, homework, exams, results, fees, notices. |
| **Parent** | One or more schools | ✅ | ✅ | Same as Student, for each linked child, via a child switcher. |
| **Staff** (non-teaching) | One school | — | — | **Basic only for now:** exists as a person record and role so staff attendance and leave can include them. No portal yet. |

### 3.2 Permission model (built for future roles)

- Code checks **permissions**, never role names. Example: `attendance.mark`, `marks.approve`, `fees.record_payment`, `notice.publish`.
- Permission identifiers and the role → permissions map live in `packages/domain/permissions`. Adding a role later means adding one entry to that map, not changing feature code.
- Permissions combine with **resource scope**:
  - Teacher can mark attendance only for sections where they are class teacher.
  - Teacher can enter marks only for their assigned subject–section pairs.
  - Parent can see only linked children; Student only themselves.
- One person can hold **several roles** in a school (e.g. School Admin + Principal in a small school). Effective permissions are the union.
- A person can belong to **more than one school** (e.g. a parent with children in two schools). After login they pick the school if they have more than one; otherwise it is automatic.

### 3.3 Accounts

- **Login:** one common login page. Identifier is **email or mobile number**, plus password.
- **Email is required** for every account that can log in (invites, password reset, notifications).
- Accounts are created by the level above (Super Admin → School Admin; School Admin → everyone in the school), one at a time or by bulk import. The user receives an email invite and **must set a new password on first login**.
- **Student logins** can be switched on or off per class by the school (young children usually use the parent account).
- **Super Admin "view as school"** is **read-only**: it shows a persistent banner, requires a typed reason, and every session is audited. No writes are possible in this mode.
- OTP login via SMS is a later phase.

---

## 4. Apps and platforms

| | Web app (`apps/web`) | Mobile app (`apps/mobile`) |
|---|---|---|
| Who | All roles | Principal, Teacher, Student, Parent |
| When | Built first (Phases 0–5) | Phase 6 |
| Optimised for | Desktop admin work, data-heavy tables; responsive down to phone width | Quick daily tasks and information on Android phones |
| API | Same tRPC API | Same tRPC API |

- Web keeps working for Principal, Teacher, Student and Parent after mobile launches. Mobile gets feature parity for those roles over time.
- The mobile app is **online-only**, but must handle slow and dropped connections gracefully (clear loading, retry, no lost form input). Offline mode is not promised.
- Mobile never squeezes wide desktop tables onto a phone; it uses lists and cards designed for touch.

---

## 5. Tech stack

Versions are pinned when the scaffold is created, after checking current official docs. "Verify" means confirm compatibility at implementation time.

| Concern | Choice | Notes |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | |
| Language | **TypeScript** (strict) | |
| Runtime | Node.js LTS | |
| Web framework | **Next.js** (App Router) + React | Hosted on Vercel |
| Web UI | **shadcn/ui + Tailwind CSS**, **Lucide** icons, **Sonner** toasts (via shadcn) | |
| Tables | **TanStack Table** rendered with shadcn | Server-side pagination, filtering, sorting |
| Charts (web) | **Recharts** via shadcn chart patterns | Mobile v1 uses stat cards, not charts |
| Forms | **React Hook Form + Zod** | Same Zod schemas on server and both clients |
| API | **tRPC** inside Next.js route handlers | One API for web and mobile |
| Server state | **TanStack Query** (via tRPC integration) | |
| Auth | **Neon Auth** (Managed Better Auth, `@neon/auth`) | Users in our Neon DB (`neon_auth` schema); see ADR-023 for limits and follow-ups |
| Database | **Neon PostgreSQL** | Region: Singapore |
| ORM / migrations | **Drizzle ORM + Drizzle Kit** | Raw SQL allowed when clearer |
| File storage | **Neon Object Storage** (S3-compatible, private buckets, presigned URLs) | Region: Singapore. Newer product; S3 API keeps us portable |
| Image processing | **sharp** | Convert to WebP, strip metadata, resize |
| PDF documents | **@react-pdf/renderer** | Receipts, notices, admit cards, report cards |
| Notice share image | `next/og` (ImageResponse) → sharp → WebP | |
| Spreadsheets | **ExcelJS** | Import and template download (students, teachers, calendar) |
| Email | **Resend + React Email** | |
| Dates | **date-fns** (+ `@date-fns/tz`) | |
| i18n | **next-intl** on web; shared message catalogs in `packages/i18n` | Mobile i18n library chosen in Phase 6 |
| Mobile | **Expo + Expo Router**, **React Native Reusables + NativeWind**, `lucide-react-native` | Android only. Verify NativeWind ↔ Tailwind version compatibility in Phase 6 |
| Mobile builds | **Expo EAS** (build + update) | |
| Lint / format | **Biome** | One tool for lint + format |
| Tests | **Vitest** | Playwright deferred |
| Errors | **Sentry** | Web first, mobile in Phase 6 |
| CI | **GitHub Actions** | |

### Dependency policy

- One library per responsibility. Use platform or framework primitives first.
- Any new dependency needs a one-line justification in the PR description; significant ones need a `DECISIONS.md` entry.
- **Excluded unless a concrete need appears:** other component kits (coss ui, Magic UI, React Bits, Aceternity), ECharts, paid data grids, Lottie, Redis, job queues, state-management libraries (Redux, Zustand), CSS-in-JS.

---

## 6. Architecture

### 6.1 Monorepo layout

```text
apps/
  web/            Next.js app: all web UI + hosts the tRPC and Better Auth HTTP endpoints
  mobile/         Expo app (created in Phase 6)
packages/
  api/            tRPC routers, procedures and server services (auth, files, email, pdf). Server-only.
  db/             Drizzle schema, migrations, scoped data-access helpers. Server-only.
  contracts/      Zod schemas and inferred TS types for every API input/output
  domain/         Pure business logic: permissions, grade calculation, fee maths, date rules
  design/         Design tokens (colors, radii, spacing, type scale) for Tailwind and NativeWind
  i18n/           Message catalogs (en now) and formatting helpers (₹, dates)
  ui/             Cross-platform components that are proven to render well on web AND native (starts empty)
  config/         Shared tsconfig and Biome config
```

Rules:
- `db` and `api` must never be imported by client code. Enforce with `server-only` and package boundaries.
- `contracts`, `domain`, `design`, `i18n` are platform-neutral: no React DOM, no React Native, no Node-only APIs.

### 6.2 Code sharing between web and mobile

Three tiers. Prefer the highest tier that does not break either platform.

1. **Shared 100%:** tokens, icons (same Lucide names), Zod schemas, types, permissions, business logic, formatters, i18n strings, the tRPC client setup and data hooks (e.g. `useAttendanceSheet()`).
2. **Same name, same props:** primitives such as `Button`, `Input`, `Card`, `Badge`, `Avatar`, `Select`, `Dialog`, `Tabs`, `Checkbox`, `Switch`, `Skeleton`. Web uses shadcn/ui (`apps/web/components/ui`); mobile uses React Native Reusables (`apps/mobile/components/ui`), which mirrors shadcn's API. Code using them reads the same on both.
3. **Truly shared rendered components** (`packages/ui`): small presentational pieces such as `StatCard`, `EmptyState`, `StatusPill` and `NoticeCard`. They move here only once both platforms render them correctly. Never web-only pieces (data tables, command menus).

### 6.3 API

- tRPC routers are grouped by module: `schools`, `setup`, `people`, `timetable`, `attendance`, `homework`, `diary`, `material`, `exams`, `leave`, `notices`, `calendar`, `fees`, `complaints`, `support`, `subscriptions`, `reports`, `notifications`, `audit`.
- Procedure builders encode security: `publicProcedure` → `authedProcedure` → `schoolProcedure` (resolves membership, active school and subscription status) → `permission('marks.approve')`.
- Every input and output has a Zod schema in `contracts`.
- Errors use one shape (`code`, `message`, optional `fieldErrors`), shown to users in plain language.
- Lists are always paginated server-side (cursor or page/limit) with a hard maximum page size.
- Web uses Server Components for layout and shells; data is fetched through tRPC (prefetch on the server where it helps). **No Next.js Server Actions for data**, so mobile never needs a second API.

### 6.4 Authentication and sessions

- Neon Auth (Managed Better Auth): users and sessions live in the `neon_auth` schema of our Postgres. The web app proxies to it with `@neon/auth` (ADR-023).
- Web: secure HTTP-only cookie session. Mobile: Neon Auth client with the token kept in secure storage (Expo support to be verified in Phase 6, ADR-023).
- Password rules: minimum 8 characters, checked against common passwords; rate-limited login; lockout after repeated failures.
- Session is checked on every API call, together with the school's status (active, expired, deleted).

### 6.5 Multi-tenancy

- One shared database. Every school-owned table has `school_id NOT NULL`, indexed, and part of uniqueness rules where relevant (e.g. `UNIQUE (school_id, admission_no)`).
- The `schoolProcedure` context carries the resolved `schoolId`; data-access helpers require it, so an unscoped query is a type error, not a bug found later.
- **Postgres Row-Level Security** is the second safety net. Policies check a per-transaction setting (`app.school_id`). Phase 0 includes a spike to confirm this works cleanly with Drizzle and the Neon driver; if it does not, record the outcome in `DECISIONS.md` and rely on the scoped layer plus tests.

### 6.6 Files

1. The client asks the API for an upload URL (declares purpose, type, size).
2. The API checks permission, type and size, and returns a short-lived presigned URL to a private `incoming/` prefix.
3. The client uploads directly to storage (this avoids Vercel request-size limits).
4. The client calls `files.finalize`. The server checks magic bytes, converts images to **WebP** (max 2048 px long edge, metadata stripped), stores the final object under `schools/{schoolId}/{purpose}/{id}.webp` (or `.pdf`), deletes the incoming object and records metadata in the `files` table.
5. Downloads use short-lived presigned URLs issued only after a permission check.

Limits (adjustable): images up to 10 MB input; PDFs up to 10 MB. Allowed: JPEG, PNG, WebP, HEIC (converted) and PDF.

### 6.7 Generated documents

Notices, fee receipts, admit cards and report cards are generated from templates with **school branding** (logo, name, address, affiliation number) in a consistent layout. PDFs are produced with `@react-pdf/renderer`. Notices also get a WebP image for sharing on WhatsApp.

### 6.8 Conventions

- IDs: UUID v7. Human-friendly numbers (admission no., receipt no., notice ref.) are separate, school-scoped sequences.
- Time: store `timestamptz` in UTC. Day-based facts (attendance, holidays, due dates) use the `date` type in the school's timezone.
- Money: integer paise; format with `en-IN` (₹1,25,000.00).
- Soft delete (`deleted_at`) for people and school records; hard delete only through explicit, audited admin actions.
- Every table: `created_at`, `updated_at`, `created_by` where meaningful.

---

## 7. Design system and UX rules

### 7.1 Brand

The product logo is the "P + open book" mark in `docs/brand/`. In Phase 0 it is converted to app assets: SVG for web, WebP raster sizes, favicon, Android adaptive icon.

| Token | Hex | Role | Usage rules |
|---|---|---|---|
| `brand-navy` | `#01306F` | Primary | Primary buttons, active navigation, headings, links on light backgrounds |
| `brand-teal` | `#02969E` | Secondary / info | Secondary actions, info states, selected filters, charts series 1 |
| `brand-saffron` | `#FDB802` | Highlight / warning | Badges, warning backgrounds, charts. **Never as text on white** (fails contrast); use a dark text color on it |
| `brand-coral` | `#F35844` | Error / destructive | Error states, destructive buttons. Use a darker coral shade for small text to meet AA |
| Neutrals | Slate scale | Surfaces, borders, body text | Body text near `#0F172A` on white |

Semantic tokens map to these: `primary`, `secondary`, `success` (green derived to sit beside teal), `warning` (saffron), `danger` (coral), `info` (teal). Components use semantic tokens only, never raw hex values.

- **Theme:** light only for now. Tokens are defined as CSS variables so a dark theme can be added later.
- **Type:** Inter for body text and Manrope for headings on web (ADR-031); Inter on mobile. Base 16 px on web, 15–16 px on mobile; one heading scale.
- **Shape:** 10 px radius for controls and 14 px for cards, subtle 1 px borders, minimal shadow. Controls are at least 44 px high.
- **Module tones:** navy, teal, saffron, coral and slate tints with dark foregrounds mark module areas (icons, stat tiles, badges), always next to a text label. See ADR-031.

### 7.2 School branding

- Super Admin screens and the login page show **ERP** branding.
- After a school user logs in, the **school's logo and name replace ours** in the header, the mobile app bar, and on every generated document (notices, receipts, admit cards, report cards).
- The footer shows **"Powered by ERP · PastAndPixels Group"**.
- Schools set a logo only, not custom colors. This keeps the UI consistent and accessible.
- Missing logo → school initials on a navy tile.

### 7.3 Layout and navigation

- **Web:** left sidebar grouped by module (collapsible, icon + label), top bar with school logo and name, school switcher (when needed), notification bell and user menu. A page title with breadcrumbs, then content. A global search/command palette (⌘K) for admins.
- **Mobile:** bottom tab bar with at most 5 tabs per role (e.g. Teacher: Today, Attendance, Homework, Notices, More). "More" holds the rest.
- **Role home ("Today"):** each role opens to a dashboard that answers "what do I need to do now?" (e.g. Teacher: attendance not yet marked, homework to check; Principal: pending approvals; Parent: child's attendance today, homework due, latest notice).

### 7.4 UX rules

- **Lists:** every list on web uses the shared `ERPDataTable`: search, filters, sorting, server pagination, column visibility, row actions, bulk actions where useful, export where allowed, and designed **empty, loading (skeleton) and error** states.
- **Forms:** single column, labels above inputs, required fields marked, inline validation on blur, a clear primary action at the bottom, disabled + spinner while saving, success toast, and no data loss on error. Long forms are split into steps or sections.
- **Destructive actions** need a confirmation dialog that names the item. Reversals (e.g. fees) explain what will happen.
- **Statuses** always use icon + text + color, with the same words everywhere (Pending, Submitted, Late, Approved, Rejected, Published, Draft).
- **Copy:** plain English, short sentences, verbs on buttons ("Save attendance", not "Submit"). No jargon or internal codes on screen.
- **Formats:** dates like `16 Nov 2026`; money as `₹1,25,000`; phone numbers formatted for India.
- **Touch:** minimum 44×44 px targets on mobile; primary actions reachable with the thumb.
- **Performance:** the first meaningful content within ~2 s on a mid-range Android phone over 4G; no layout jumps.
- **Motion:** CSS transitions under 200 ms for state changes only. No decorative animation.

---

## 8. Data model essentials

Indicative, not final. The schema is designed per phase and reviewed before migration.

- **Platform:** `platform_users`, `plans`, `schools` (status: active / suspended / expired / deleted), `subscriptions`, `subscription_payments`, `support_tickets`, `audit_events`, `view_as_sessions`.
- **Identity:** `users`, `sessions`, `accounts` (Better Auth), `memberships` (user ↔ school ↔ roles).
- **School setup:** `school_profiles` (logo file, address, affiliation, timezone, settings), `academic_sessions` (one active), `classes`, `sections`, `subjects`, `class_subjects`, `grade_scales`.
- **People:** `students` (admission no., per-session enrolment in a section), `guardians` + `student_guardians` (parent ↔ child links), `staff` (teachers and non-teaching), `teacher_assignments` (class teacher; subject–section), `profile_change_requests`.
- **Academics:** `timetable_periods`, `timetable_entries`, `attendance_days` + `attendance_records`, `staff_attendance`, `homework` + `homework_status`, `class_diary_entries`, `study_materials`, `exams`, `exam_subjects` (date, max marks), `marks`, `result_batches` (approval state), `report_cards`.
- **Communication:** `notices` (state, audience, ref no., files), `notifications`, `calendar_events`, `complaints` + messages.
- **Leave:** `leave_types`, `leave_requests` (teachers and staff).
- **Fees (records):** `fee_heads`, `fee_structures` + `fee_installments`, `student_fee_assignments`, `concessions`, `fee_payments` (append-only) + `fee_payment_allocations`, `fee_reversals`, `receipts`.
- **Files:** `files` (key, purpose, mime, size, owner, school).

Every school-owned table includes `school_id`; session-bound records include `academic_session_id`.

---

## 9. Modules and workflows by role

Based on the flow diagrams in `docs/flows/`, adjusted by the decisions in this document.

### 9.1 Super Admin (web)

- **Schools:** create a school (profile, logo, plan), create its first School Admin (email invite), suspend, restore, soft-delete.
- **View as school:** read-only, banner, typed reason, audited.
- **Plans and subscriptions (records only):** plans have name, student limit and price. Each school has a plan, start and renewal date; payments are entered manually (append-only).
  - **Lifecycle:** Active → (renewal date passes) Grace period (default 7 days, banner shown) → **Expired: all users of that school are locked out** of web and mobile.
  - **Deleted:** users locked out immediately. Data is retained; it is never auto-purged. Permanent erasure is a separate, explicit, audited Super Admin action, offered after an export.
- **Platform users:** Super Admin and Platform Support accounts.
- **Support:** tickets raised by School Admins; statuses Open → In progress → Resolved; threaded replies.
- **Reports and analytics:** schools by status and plan, students and active users per school, usage (logins, attendance marked rate), renewals due.
- **Audit and security:** audit log viewer (filters by school, actor, action, date), login history, view-as sessions.
- **Platform settings:** product name and logo, default grade scale, default leave types, email sender settings.

### 9.2 School Admin (web)

- **School setup:** profile and logo; academic sessions (one active); classes and sections; subjects and class–subject mapping; grade scale (default CBSE 9-point); leave types; whether student logins are enabled per class; whether notice approval is required.
- **People:**
  - **Students:** add (personal details, class and section, guardians, fee assignment), bulk import, profile and documents, transfer/leave school.
  - **Parents:** created with or linked to students; one parent can link to several children.
  - **Teachers:** add (personal details, subjects, class-teacher section optional), create account.
  - **Staff:** basic records only (for attendance and leave).
  - **Bulk import:** download Excel template → upload → preview → per-row errors → confirm. Admission number unique per school.
  - **Profile change requests** from parents: approve or reject.
- **Timetable:** define periods (times) per day; weekly grid per section; each slot = subject + teacher; warning when a teacher is double-booked.
- **Staff attendance:** daily for teachers and staff; approved leave fills in automatically.
- **Fee records:** see 9.8.
- **School calendar:** Excel template (Start date, End date, Title, Type: Holiday / Event / Exam / PTM / Other, Audience) → upload → validate → preview → save. Manual add and edit too. Holidays block attendance marking.
- **Notices:** write → goes to Principal for approval (if the school requires it) → published.
- **Attendance corrections:** after the teacher's window closes, the admin can edit with a mandatory, audited reason.
- **Year-end promotion:** wizard per class: promote all, hold back or mark left individually; creates enrolments in the new session and keeps all history.
- **Reports:** students, attendance, fees, exams.
- **Support:** raise tickets to the platform team.

### 9.3 Principal (web + mobile)

- **School overview:** profile, classes and sections, session (view).
- **Management (view):** students (list, admission, attendance); staff (teacher list, staff attendance, staff leave, teacher performance); academics (classes, timetable, homework, study materials); fees (collection, pending, class-wise).
- **Approvals:**
  - **Results:** view submitted marks per exam/class/subject → approve or reject with a comment → approved results can be published → students and parents notified.
  - **Notices:** review School Admin notices → approve (publishes and notifies) or reject with a comment. Principal's own notices publish immediately.
  - **Teacher/staff leave:** view application → approve or reject → staff attendance updated → applicant notified.
- **Complaints:** raised by parents or teachers; Principal moves them Open → In progress → Resolved with replies.
- **School calendar:** view.
- **Reports and analytics:** student, staff, attendance and academic reports.

### 9.4 Teacher (web + mobile)

Teachers act only on their **assigned** classes and subjects.

- **Today / My classes / My timetable.**
- **Student attendance:** select section → student list (default Present) → mark Absent / Leave / Late → save. One record per student per day, taken by the class teacher. Editable until **midnight** of the same day; afterwards only School Admin can change it. Parents of absent students are notified.
- **Homework & assignments:** select class and subject → title and details → due date → optional PDF/image attachments → choose **graded or not**, and if graded, **maximum marks** → publish. Students and parents can view. **Students do not submit in the app**; the teacher marks each student **Pending / Submitted / Late** and, if graded, enters marks.
- **Class diary:** daily log of topic covered per subject and section; visible to Principal, students and parents.
- **Study material:** select class and subject → title → upload PDF/image/document → publish → students can view and download.
- **Examination & marks:** select exam → class and subject → student list → enter marks (validated against max marks; "Absent" allowed) → submit to Principal. If rejected, correct and resubmit. Marks are visible to students only after approval and publishing.
- **Leave application:** leave type → from and to date → reason → optional documents → submit → Principal decides → notified. Can cancel while pending.
- **Student performance:** attendance %, marks trend, homework completion per student (computed, no subjective rating).
- **Notifications:** leave decisions, new timetable, notices, exam schedule.
- **My profile.**

### 9.5 Student (web + mobile; login enabled per class)

- **Today:** today's timetable, attendance status, homework due, latest notices.
- **My profile:** personal, parent and contact details (view only).
- **Academic:** my class, timetable, subjects, study materials.
- **Attendance:** daily, monthly, summary.
- **Examination:** exam schedule, admit card, marks, report card (after publishing).
- **Fee:** fee details, pending fees, payment history, download receipts.
- **Homework:** view homework and the status/marks the teacher recorded.
- **Communication:** notices, notifications, school calendar.

### 9.6 Parent (web + mobile)

Everything a Student sees, for each linked child, plus:

- **Child switcher** at the top of every screen.
- **Today screen** per child.
- **Absence alert** when the child is marked absent.
- **Profile correction requests** (School Admin approves).
- **Class teacher name** shown (no personal phone number).
- **Complaints** to the Principal.

Not included: parent–teacher chat, online fee payment.

### 9.7 Staff (basic)

Person record with role `staff`, included in staff attendance and leave. No login portal in this version.

### 9.8 Fee records (School Admin records; Principal, Student and Parent view)

The app **records** fees. It does not collect or process money.

- **Fee heads** (Tuition, Transport, Admission, Exam, …) with frequency (one-time, monthly, quarterly, annual).
- **Fee structure** per class per session → installments with due dates.
- **Assignment:** students get their class structure automatically; optional heads (e.g. transport) and **concessions** (amount or % per head) per student.
- **Record payment:** student → amount → date → mode (Cash, UPI, Cheque, Bank transfer, Other) → reference → allocated to oldest dues first (editable before saving) → **receipt number** (school-scoped sequence) → branded PDF receipt.
- **Corrections:** never edit or delete a payment; create a **reversal** with a reason (audited), then record the correct payment.
- **Late fines:** entered manually as a fee line.
- **Reports:** daily collection by mode, dues and defaulters by class, class-wise summary, student ledger.

### 9.9 Workflow states (shared vocabulary)

| Entity | States |
|---|---|
| Notice | Draft → Pending approval → Published / Rejected (Principal's notices: Draft → Published) |
| Result batch (exam + section + subject) | Draft → Submitted → Approved / Rejected → Published |
| Leave request | Pending → Approved / Rejected / Cancelled |
| Homework status (per student) | Pending → Submitted / Late |
| Complaint / Support ticket | Open → In progress → Resolved |
| Profile change request | Pending → Approved / Rejected |
| School | Active → Grace → Expired; Suspended; Deleted |

State changes are done only by server procedures that check the allowed transition and the caller's permission.

---

## 10. Notifications

Channels: **in-app** (bell on web; notification list on mobile), **email** (Resend), and later **push**, **SMS**, **WhatsApp**.

| Event | Recipients | Phase 1 channels | Later |
|---|---|---|---|
| Account invite, password reset, password changed | The user | Email | — |
| Notice published | Audience (school / classes / teachers / parents) | In-app + email | Push, WhatsApp |
| Student marked absent | Parents of that student | In-app + email | Push, SMS |
| Homework published | Students + parents of the section | In-app | Push |
| Results published | Students + parents | In-app + email | Push |
| Marks rejected | Teacher | In-app + email | Push |
| Leave approved / rejected | Applicant | In-app + email | Push |
| Notice pending approval / marks submitted | Principal | In-app | Push |
| New timetable / exam schedule | Affected teachers, students, parents | In-app | Push |
| Complaint / ticket update | Raiser and handler | In-app + email | — |
| Subscription grace / expiry | School Admin, Super Admin | In-app + email | — |

- Users can turn off non-essential emails; security emails are always sent.
- Notices also have a **Share on WhatsApp** button that shares the rendered notice image. This needs no WhatsApp integration.
- Sending is done inside the request transaction's after-commit step, batched where large. If volume grows past what this handles, a background job runner is a `DECISIONS.md` decision, not a silent addition.

---

## 11. Security and privacy

- **Law:** follow India's **DPDP Act 2023**. The school is the data fiduciary for its students; PastAndPixels Group processes data on its behalf. Children's data needs verifiable parental consent, recorded by the school at admission (consent flag, date, recorded by).
- **Least privilege:** each role sees only what it needs. Contact details of students and parents are visible only to School Admin, Principal and that section's teachers.
- **No tracking or advertising** on children's data. No third-party analytics on student or parent screens.
- **Exports** (Excel/PDF of people data) are permission-gated and audited.
- **Files** are private; access only through short-lived signed URLs after a permission check.
- **Rate limits** on login, password reset, upload URL requests and imports.
- **Headers:** CSP, HSTS, frame-ancestors none, secure cookies.
- **Dependencies:** GitHub Dependabot alerts on; review before upgrades.
- **Audit log** is append-only; retention at least 3 years (to be confirmed with legal advice).
- **Data retention:** a deleted or expired school's data is retained and locked; permanent erasure only by explicit audited action after export.

---

## 12. Environments, deployment and backups

| Environment | Web | Database & files |
|---|---|---|
| Local | `next dev` | Neon **test** database + test bucket |
| Preview (per PR) | Vercel preview deployment | Neon **test** database + test bucket |
| Production | Vercel production (`main`) | Neon **prod** database + prod bucket |

- Two databases only: **test** and **prod**. Hosting region **Singapore** for Vercel functions, Neon database and Neon Object Storage.
- **Migrations:** generated by Drizzle Kit, committed, reviewed in the PR, applied to test automatically and to prod as an explicit release step. Never edit an applied migration. Destructive migrations need a written rollback plan.
- **Backups:** Neon point-in-time restore (window as per plan) plus a weekly logical dump stored separately. A restore drill is done before the first real school goes live, then quarterly.
- **Secrets:** Vercel environment variables and GitHub Actions secrets; `.env.example` documents every variable.
- **Mobile releases:** EAS Build for Android (internal testing → Play Store), EAS Update for JS-only fixes.

---

## 13. Quality: testing, CI and monitoring

Testing is kept **light but targeted**: it protects the things that would hurt most, without slowing feature work.

- **Must have (Vitest):**
  - `domain`: permissions map, grade calculation, fee allocation and dues maths, attendance edit window, workflow state transitions.
  - **Tenant isolation:** for each module router, a test that a user of school A cannot read or write school B's data.
  - Permission checks on approval procedures (only Principal can approve marks/notices/leave).
- **Nice to have:** tests for tricky bug fixes (write the failing test with the fix).
- **Deferred:** Playwright end-to-end tests (revisit after Phase 4).
- **CI (GitHub Actions) on every PR:** install, Biome check, TypeScript type check, Vitest, Drizzle migration check, build. A red CI blocks merge.
- **Monitoring:** Sentry for web errors (mobile in Phase 6); structured server logs without personal data; Vercel analytics for performance only.
- **Definition of done for any feature:** works for the right role, blocked for wrong roles and other schools (tested), empty/loading/error states designed, strings in i18n catalog, accessible, CI green, docs updated if behaviour changed.

---

## 14. Git and GitHub workflow

- Repository: `github.com/ctrlxharsh/erp`.
- `main` is protected and always deployable. No direct pushes once the scaffold exists.
- One branch per slice: `feat/attendance-marking`, `fix/receipt-number-gap`, `docs/…`, `chore/…`.
- Commit messages follow Conventional Commits: `feat: …`, `fix: …`, `docs: …`, `chore: …`, `refactor: …`, `test: …`.
- Every PR: short description of what and why, screenshots for UI changes, migration notes if any, checklist against the Definition of done.
- Squash-merge into `main`. Production deploys from `main`.
- Changes to this constitution go through a `docs/` PR with a `DECISIONS.md` entry.

---

## 15. Roadmap

Each phase ends with a working, deployed vertical slice. Detailed specs are written at the start of each phase.

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundation** | Monorepo scaffold, CI, Biome, design tokens + brand assets (logo → SVG/WebP/favicon), app shell (sidebar, top bar, footer, school branding), Better Auth, memberships and permissions, scoped data access + RLS spike, audit log, files pipeline (WebP), Super Admin: create school + first School Admin invite, School Admin: school profile and logo, session, classes and sections, subjects | A Super Admin creates a school; its admin logs in, sees the school's logo, and sets up classes; isolation tests pass |
| **1. People** | Students, parents (multi-child), teachers, staff (basic), teacher assignments, Excel import, email invites, first-login password change, role home screens (empty states) | A school imports 500 students with parents; a teacher and a parent log in and see the right home |
| **2. Daily work** | Timetable, student attendance (+ absence alerts), staff attendance, homework (status + optional marks), class diary, study material, notices (approval + branded PDF/WebP + WhatsApp share), calendar Excel upload, in-app notifications + email | A teacher's full day works end to end on web |
| **3. Exams and leave** | Exams and schedule, admit cards, marks entry, Principal approval, publishing, report cards, grade scales, teacher/staff leave with approval updating staff attendance | A term's results go from entry to parents |
| **4. Fee records** | Fee heads, structures, concessions, payments, reversals, receipts, dues reports | A month of counter collections is recorded and reconciled |
| **5. Platform operations** | Plans, subscriptions, grace and lockout, platform users, support tickets, complaints, reports and analytics, audit viewer, read-only view-as, profile change requests, year-end promotion | The platform can onboard and bill-track a paying school |
| **6. Mobile app** | Expo Android app for Principal, Teacher, Student, Parent on the same API; push notifications; shared `packages/ui` components where proven | Teachers mark attendance and parents check homework from the app |
| **Later** | SMS/WhatsApp, online fee payments, Library, Staff portal, per-period attendance, OTP login, Hindi, dark theme, Playwright E2E | Each needs a `DECISIONS.md` entry before starting |

---

## 16. Out of scope (for now)

Library management · Staff (non-teaching) portal · online payment gateway · SMS and WhatsApp messaging · offline mode · per-period attendance · automatic timetable generation and substitutions · student submissions of homework in the app · parent–teacher chat · custom roles · school-specific colors · co-scholastic grading and weighted final results · Hindi UI · iOS app · dark theme.

---

## 17. Open items

Decisions still needed. Each one is resolved in `DECISIONS.md` before the phase that needs it.

| # | Item | Needed by |
|---|---|---|
| 1 | Final product name: "ERP" is the working name; a distinctive brand name may replace it (one constant + assets to change) | Before first school goes live |
| 2 | Production domain and email sending domain (SPF/DKIM) | Phase 0 (test), Phase 1 (prod) |
| 3 | Neon Object Storage maturity, pricing and Singapore availability re-checked at scaffold time; fallback is any S3-compatible store | Phase 0 |
| 4 | ~~RLS with Drizzle + Neon driver~~ Adopted, see ADR-026 | Done |
| 5 | Students without their own email: allow parent's email or keep student login off for them | Phase 1 |
| 6 | Email volume and Resend plan (absence alerts and notices can be thousands per day) | Phase 2 |
| 7 | Admit card blocking rules (e.g. fee dues) | Phase 3 |
| 8 | Report card layout per board (CBSE first) | Phase 3 |
| 9 | Receipt numbering reset: per academic session or per financial year | Phase 4 |
| 10 | Audit and data retention periods; DPDP consent text (legal review) | Before first school goes live |

---

## 18. Glossary

- **School / tenant:** one customer school with its own isolated data.
- **Session:** an academic year (e.g. 2026–27). One is active per school.
- **Section:** a division of a class (e.g. Class 6 – A).
- **Class teacher:** the teacher responsible for a section's daily attendance.
- **Result batch:** the marks of one subject for one section in one exam, approved as a unit.
- **View as:** Super Admin's read-only, audited view of a school's screens.
- **Records only (fees):** the app tracks what was paid and what is due; money moves outside the app.
