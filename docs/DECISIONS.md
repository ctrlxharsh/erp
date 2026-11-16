# Architecture Decision Records

Each entry records what was decided, the alternatives that were rejected, and why. Approved decisions change only through a new entry that **supersedes** the old one; old entries are never rewritten.

Format: **Decision** · **Rejected** · **Why** · **Risks / follow-ups**.

Status values: `Accepted`, `Superseded by ADR-NNN`, `Proposed`.

---

## ADR-001 — Multi-school SaaS on one shared database
**Status:** Accepted · 2026-11-16
- **Decision:** One Neon Postgres database for all schools. Every school-owned row has `school_id`. A scoped data-access layer enforces isolation, with Postgres Row-Level Security as a second safety net.
- **Rejected:** a database per school (heavy operations, migrations × N); a schema per school (complexity without strong isolation).
- **Why:** Simplest to run and migrate; cross-school platform reports are easy; isolation is provable with tests.
- **Risks:** One missed filter leaks data. Mitigated by required `schoolId` in helpers, RLS, and mandatory isolation tests per router. RLS + Drizzle + Neon driver needs a Phase 0 spike.

## ADR-002 — India-first defaults
**Status:** Accepted · 2026-11-16
- **Decision:** INR stored as integer paise; April–March session by default; `Asia/Kolkata`; CBSE 9-point grading by default (configurable); English UI with all strings in an i18n catalog; DPDP Act 2023 compliance.
- **Rejected:** a locale-neutral product from day one.
- **Why:** The target market is Indian schools; defaults remove setup work.
- **Risks:** None significant. Note that DPDP does not require data to be stored in India; Singapore hosting is acceptable.

## ADR-003 — Fixed roles, permission-based checks
**Status:** Accepted · 2026-11-16
- **Decision:** Fixed roles (Super Admin, Platform Support, School Admin, Principal, Teacher, Student, Parent, Staff-basic). Code checks permission identifiers, mapped from roles in `packages/domain`. A user can hold several roles and belong to several schools.
- **Rejected:** a custom role builder (complex UI, hard to test); checking role names in code (blocks future roles).
- **Why:** Simple now; adding a role later is one map entry.
- **Risks:** Permission map must be kept tested.

## ADR-004 — One common login; school branding after login
**Status:** Accepted · 2026-11-16
- **Decision:** One login page on one domain; identifier is email or mobile + password. After login the school's logo and name replace ERP branding; footer reads "Powered by ERP · PastAndPixels Group". Schools set a logo only, not colors.
- **Rejected:** a subdomain per school (DNS, cookies and domain management overhead); per-school color themes (inconsistency, contrast failures).
- **Why:** Matches the flow diagrams, least infrastructure, consistent UX.
- **Risks:** Login page cannot show the school logo. Subdomains can be added later.

## ADR-005 — Better Auth for authentication
**Status:** Superseded by ADR-023 · 2026-11-16
- **Decision:** Better Auth, self-hosted in the Next.js app, Drizzle adapter, cookie sessions on web, Expo integration with secure storage on mobile. Accounts created by admins with email invites and forced password change on first login. Email required for every login account.
- **Rejected:** Clerk (per-user cost, user data outside our DB); Neon Auth (needed verification for Expo); custom auth (security risk).
- **Why:** Users live in our database, no per-user fee, supports web + Expo.
- **Risks:** Verify plugin versions at scaffold time. OTP via SMS deferred.

## ADR-006 — Super Admin "view as school" is read-only
**Status:** Accepted · 2026-11-16
- **Decision:** Read-only view of any school, with persistent banner, typed reason, and audit of every session.
- **Rejected:** full impersonation with write access; no view-as at all.
- **Why:** Essential for support; read-only removes the biggest abuse and accident risk.
- **Risks:** If write support is ever needed it requires a new ADR.

## ADR-007 — Two apps, one API (tRPC)
**Status:** Accepted · 2026-11-16
- **Decision:** Web app for all roles (only surface for Super Admin and School Admin). Android app (Expo) for Principal, Teacher, Student, Parent, built in Phase 6. Both call the same tRPC API hosted in Next.js route handlers. No Server Actions for data.
- **Rejected:** Server Actions for web + separate REST for mobile (two APIs); a separate backend service (extra deployment); a single Expo app for web too (weaker admin/data-table experience).
- **Why:** Write server logic once; fully typed clients on both platforms.
- **Risks:** tRPC couples clients to TypeScript; acceptable since both clients are ours.

## ADR-008 — Code sharing in three tiers
**Status:** Accepted · 2026-11-16
- **Decision:** (1) Share all non-UI code: tokens, icons, schemas, types, permissions, logic, i18n, data hooks. (2) UI primitives with the same name and props: shadcn/ui on web, React Native Reusables on mobile. (3) Truly shared rendered components in `packages/ui` only once proven on both platforms.
- **Rejected:** a fully universal UI with react-native-web or Tamagui (client-only components everywhere, build friction, weaker web tables).
- **Why:** Maximum reuse without breaking either platform.
- **Risks:** Two primitive sets to keep aligned; mitigated by identical APIs and shared tokens.

## ADR-009 — Neon for database and files
**Status:** Accepted · 2026-11-16
- **Decision:** Neon Postgres for data and **Neon Object Storage** (S3-compatible, private buckets, presigned URLs) for files, both in Singapore. Database stores only file keys and metadata. Direct-to-storage uploads via presigned URLs, then a server finalize step.
- **Rejected:** storing files in Postgres `bytea` (about 15× the storage cost, bloated backups, slow queries); Cloudflare R2 / Vercel Blob / AWS S3 (another vendor; still the fallback since the API is S3-compatible).
- **Why:** One vendor and credential; storage branches with the database; low cost.
- **Risks:** Neon Object Storage is new (sources disagree on beta status). Re-check maturity, pricing and region at scaffold time; keep storage behind a small adapter.

## ADR-010 — All images stored as WebP
**Status:** Accepted · 2026-11-16
- **Decision:** Server converts every uploaded image to WebP with sharp (max 2048 px, EXIF/GPS stripped). Documents stay PDF.
- **Rejected:** storing originals; client-only conversion (cannot be trusted).
- **Why:** Smaller files, consistent format, privacy (no location metadata).
- **Risks:** sharp must run in the Vercel function environment; verify in Phase 0.

## ADR-011 — Fees are records only
**Status:** Accepted · 2026-11-16
- **Decision:** The app records fee structures, concessions, offline payments (cash, UPI, cheque, bank transfer), receipts and dues. Payments are append-only; corrections are reversals. No payment gateway.
- **Rejected:** Razorpay or similar in MVP (KYC, webhooks, refunds, reconciliation).
- **Why:** Schools mostly collect at the counter; keeps scope and liability small.
- **Risks:** Online payment is a likely future request; it gets its own ADR and phase.

## ADR-012 — Homework has no in-app submission
**Status:** Accepted · 2026-11-16
- **Decision:** Students only view homework. Teachers record each student's status (Pending, Submitted, Late) and, if the homework is graded, marks up to the maximum set at creation.
- **Rejected:** student uploads in the app.
- **Why:** Matches how schools work; avoids student file storage and moderation.

## ADR-013 — Notices: approval rules and branded template
**Status:** Accepted · 2026-11-16
- **Decision:** Principal's notices publish immediately. School Admin's notices need Principal approval (school can switch approval off). Every notice is rendered into a branded template (PDF + WebP image) with a "Share on WhatsApp" button.
- **Why:** Matches the flow diagrams; gives schools ready-to-share notices without a WhatsApp integration.

## ADR-014 — Notifications phased
**Status:** Accepted · 2026-11-16
- **Decision:** Phase 1: in-app notifications and email (Resend) for everyone. Later: push (Expo), SMS, WhatsApp.
- **Rejected:** SMS/WhatsApp in MVP (per-message cost, DLT and template approvals).
- **Risks:** Email volume and cost need checking in Phase 2.

## ADR-015 — Subscription expiry and deletion lock users out
**Status:** Accepted · 2026-11-16
- **Decision:** After the renewal date and a grace period, or on deletion, all users of that school are locked out of web and mobile. Data is retained and never auto-purged; permanent erasure is an explicit, audited Super Admin action after export.
- **Rejected:** read-only access after expiry.
- **Why:** Founder's requirement; retention protects against mistakes and disputes.

## ADR-016 — Library deferred; Staff role basic
**Status:** Accepted · 2026-11-16
- **Decision:** No Library module now. Staff (non-teaching) exists as a role and person record for attendance and leave, with no portal.
- **Why:** Focus the MVP; avoid schema changes when these arrive.

## ADR-017 — Daily attendance by class teacher
**Status:** Accepted · 2026-11-16
- **Decision:** Once per day per section, statuses Present / Absent / Leave / Late, editable by the teacher until midnight, after that only by School Admin with an audited reason. Holidays from the calendar block marking.
- **Rejected:** per-period attendance (later, as a per-school option).

## ADR-018 — Exams with Principal approval
**Status:** Accepted · 2026-11-16
- **Decision:** School-defined exams with subjects, dates and max marks; teacher enters and submits marks per subject-section; Principal approves or rejects; approved results are published; branded PDF report card per exam. Default CBSE 9-point grade scale.
- **Deferred:** weighted final results, co-scholastic grading.

## ADR-019 — Two environments' databases: test and prod
**Status:** Accepted · 2026-11-16
- **Decision:** Neon `test` database (local and preview) and `prod` database. Vercel, Neon and storage in Singapore. Point-in-time restore plus weekly logical dump.
- **Rejected:** a database branch per pull request.
- **Why:** Simpler, cheaper, enough for the team size.
- **Risks:** Preview deployments share test data; migrations on test must stay backward compatible while PRs overlap.

## ADR-020 — Light testing, strict where it matters
**Status:** Accepted · 2026-11-16
- **Decision:** Vitest for domain logic, permissions and mandatory tenant-isolation tests. CI runs lint, type check, tests and build on every PR. Sentry for errors. Playwright deferred.
- **Why:** Protects the costliest failures without slowing feature work.

## ADR-021 — Tooling choices
**Status:** Accepted · 2026-11-16
- **Decision:** pnpm + Turborepo; Biome for lint and format; @react-pdf/renderer for PDFs; ExcelJS for spreadsheets; Resend + React Email; date-fns; next-intl on web.
- **Rejected:** ESLint + Prettier (two tools); SheetJS from npm (outdated registry version); Puppeteer for PDFs (heavy on serverless).
- **Why:** One well-known library per job, small footprint.

## ADR-022 — GitHub workflow
**Status:** Accepted · 2026-11-16
- **Decision:** Protected `main`, one branch and PR per slice, Conventional Commits, squash merge, production deploys from `main`.

## ADR-023 — Neon Auth (Managed Better Auth) replaces self-hosted Better Auth
**Status:** Accepted · 2026-11-16 · Supersedes ADR-005
- **Decision:** Authentication uses **Neon Auth**, which is Managed Better Auth: users, sessions and auth config live in the `neon_auth` schema of our own Neon database, and auth state branches with the database. The web app proxies to it through `@neon/auth` (`/api/auth/*` route handler, `auth.getSession()` on the server). The `test` and `production` Neon branches each have their own Auth instance. Everything else in ADR-005 stands: accounts are created by the level above, email is required, forced password change on first login.
- **Rejected:** keeping self-hosted Better Auth (more code and security surface for us to own); Clerk (per-user cost, data outside our DB).
- **Why:** The founder chose it. Less auth code to maintain, users still live in our database, no per-user fee.
- **Risks / follow-ups (verify in the auth PR, record outcomes here):**
  - Managed Auth has a **fixed plugin set**: no MFA, passkeys, custom plugins, server hooks or custom JWT claims. We cannot add these without moving to self-managed Better Auth.
  - **Mobile-number login** (CONSTITUTION §3.3) is not confirmed: the phone-number plugin is constrained (no phone-first sign-up, needs our own SMS webhook). Until verified, login is by email only.
  - **Admin-created accounts, invite emails and forced first-login password change** must be checked against the Managed admin plugin and its shared SMTP. Production needs custom SMTP.
  - Rate limiting and lockout (§6.4) must be checked against what Managed Auth provides.
  - **Expo support** for Phase 6 must be verified with `@neon/auth`.
  - Neon Auth is a managed dependency: auth availability follows Neon's.

## ADR-024 — UI foundation choices (Phase 0.2)
**Status:** Accepted · 2026-11-16
- **Decision:** Tailwind CSS 4 with CSS-variable tokens in `apps/web/app/globals.css`; shadcn-style components written by hand in `components/ui` (Radix primitives, `class-variance-authority`); next-intl with the English catalog in `packages/i18n`; **TanStack Table 8.21** for `ERPDataTable`. Semantic `secondary` and `danger` use darker shades of brand teal and coral (`#027A81`, `#C4311E`) so white text meets WCAG AA; the exact brand colours stay available as `brand-*` for decoration and charts.
- **Rejected:** TanStack Table 9 (a new API that we have not verified; `ERPDataTable` is the only place it is used, so upgrading later is contained); running the shadcn CLI (it would only copy the same files and prompts interactively in a monorepo).
- **Risks / follow-ups:** The logo is only a JPG, so the generated icons are raster. A vector source is still needed for a crisp SVG favicon.

## ADR-025 — Access model: memberships, active school, procedure chain
**Status:** Accepted · 2026-11-16
- **Decision:** `platform_users` holds Super Admin / Platform Support; `memberships` holds one row per (user, school) with an array of school roles. A request's school is the `erp_school` cookie, verified against the user's memberships: a user with one school gets it automatically, with several must choose, and an id they do not belong to is treated as no choice. Schools that are suspended, expired or deleted lock every user out; `grace` keeps working (ADR-015). API procedures chain `publicProcedure` → `authedProcedure` → `schoolProcedure` → `requirePermission(...)`, and `platformProcedure` for platform accounts. Output shapes are validated with Zod schemas from `@erp/contracts`.
- **Rejected:** a foreign key from `user_id` to `neon_auth."user"` (that schema is managed by Neon and may change); trusting a school id sent by the client.
- **Notes:** UUID v7 keys use Postgres 18's `uuidv7()`. The first Super Admin is created with `pnpm db:grant <email> platform super_admin`. Row-level security and the scoped data layer follow in PR 0.4.

## ADR-026 — Row-level security adopted (spike outcome)
**Status:** Accepted · 2026-11-16 · Resolves CONSTITUTION open item 4
- **Decision:** Adopt Postgres RLS as the second isolation layer, as a restricted role instead of `FORCE`d policies. The app connects as the table owner for access lookups (sign-in, memberships, platform checks). School-owned work goes through `withSchool(db, schoolId, fn)`, which opens a transaction, sets `app.school_id` (transaction-local) and does `SET LOCAL ROLE erp_app`. `erp_app` can only see and change rows of that school, cannot read `platform_users`, and has insert-and-read-only access to `audit_events`. `audit_events` also has triggers that block UPDATE, DELETE and TRUNCATE for every role, including the owner. New tables get `erp_app` grants by default, but each one needs its own `ENABLE ROW LEVEL SECURITY` and policy in its migration.
- **Verified:** Works with Drizzle and the Neon serverless driver (WebSocket pool). `packages/db/src/tenant.test.ts` runs against the Neon `test` branch: cross-school reads, inserts, updates and deletes are blocked; the setting does not leak to the next pooled transaction; audit rows cannot be changed.
- **Rejected:** `FORCE ROW LEVEL SECURITY` with a per-request session variable for owner queries (the access lookups legitimately span schools); a separate login role per school.
- **Risks / follow-ups:** The isolation tests need database access, so they are skipped in CI until a Neon test-branch secret is added to GitHub Actions (a decision for the founder). Drizzle's snapshot does not know about RLS, policies and triggers, so they live in hand-written migrations (`0002_rls_and_audit_guard.sql`). Every new school-owned table needs a tenant-isolation test.

## ADR-027 — File upload pipeline; HEIC not supported yet
**Status:** Accepted · 2026-11-16
- **Decision:** Uploads follow CONSTITUTION §6.6: `files.requestUpload` (permission by purpose, size cap, presigned POST to `incoming/…`) → browser uploads directly → `files.finalize` (reads the real bytes, checks magic numbers, converts images to WebP at most 2048 px with metadata stripped, keeps PDFs as PDFs, writes `schools/{schoolId}/{purpose}/{id}.webp|pdf`, deletes the incoming object) → `files.downloadUrl` (5-minute link, only to the uploader or holders of the purpose's view permission; unknown and not-allowed look the same). Purposes and their permissions are in `packages/domain/src/files.ts`. Storage sits behind a small `ObjectStorage` interface implemented with the Files SDK `neon` adapter.
- **Deviation:** **HEIC is refused** with a clear message (“share the photo as a JPEG or PNG”). The constitution says HEIC is converted, but sharp's prebuilt libvips cannot decode HEIC (only AVIF). Supporting it needs a custom libvips build or a separate converter; decide when schools ask for it.
- **Verified:** 8 end-to-end tests on the Neon `test` database and bucket: conversion and EXIF stripping, 2048 px cap, PDFs, disguised files refused and cleaned up, permission checks, cross-school isolation, only the uploader can finalize.
- **Follow-ups:** the browser upload needs CORS set on the bucket (S3 `PutBucketCors`, supported by Neon) once the first upload screen exists; pending uploads that are never finalized need a cleanup job (a decision for later, see CONSTITUTION §10 on background jobs); Neon Object Storage is still a young product, so keep the adapter boundary.

## ADR-028 — People records (Phase 1)
**Status:** Accepted · 2026-11-16
- **Decision:** Students are enrolled per academic session (`student_enrolments`), so class history is kept. A guardian is one record per school, found by email: two children with the same guardian email share one parent. Staff (teachers and non-teaching) share one table; only teachers can be assigned. Teacher assignments are per session: one class teacher per section (subject empty) and one teacher per subject per section. Teachers see and open only students of sections they take; School Admin and Principal see all; students and parents have no access to people lists. A new permission `staff.view` (School Admin, Principal) guards the staff list, since teachers hold `people.view` but should not browse colleagues' contact details. Adding a student records the school's DPDP consent confirmation (who, when) and audits it. The Excel import is all-or-nothing: the server re-validates the whole file on commit and saves nothing if any row is wrong; limit 1,000 rows per file; template includes the school's real class and section names.
- **Invites:** `people.invite` creates the account (no password), links it to the person, adds the matching role (`teacher`, `staff`, `parent`, `student`) and emails a set-password link. It needs `NEON_API_KEY` (ADR-023); without it the call fails with a plain message and nothing else changes.
- **Not built yet:** profile change requests and year-end promotion (Phase 5); per-class student login switch; students without their own email (open item 5): a student invite needs an email passed in.
- **Verified:** 55 API integration tests on the Neon `test` database, including a 500-student import, teacher scope and cross-school isolation.

## ADR-029 — Daily work (Phase 2)
**Status:** Accepted · 2026-11-16
- **Decision:**
  - **Attendance:** one register per section per day. Only the class teacher (assignment without a subject) marks, and only on the current school day in Asia/Kolkata (window closes at midnight). After that only the School Admin (`attendance.edit_after_window`) may correct a day, with a reason of at least 5 characters, written to the audit log. Holidays from the calendar and future dates block marking for everyone. Parents of a child newly marked absent get an in-app alert and an email; saving the same mark again does not alert twice. Staff attendance is entered daily by the School Admin (`staff_attendance.manage`); the Principal can view it.
  - **Timetable:** periods are shared by all weekdays and sections; entries are per session, section, weekday and period. A teacher booked in two sections at the same time is saved but reported as a warning, never blocked. Automatic "new timetable" notifications are not sent (every edit would notify everyone); a publish step can be added later.
  - **Homework, diary, material:** teachers act only on subject-section pairs assigned to them. Students and parents see their own status and marks; the class list is visible to the teacher and to School Admin and Principal. Marks cannot exceed the maximum. Attachments use the private file pipeline; a download link is issued only after a permission check.
  - **Calendar:** events have a type and an audience; the Excel import follows the same all-or-nothing rule as the student import.
  - **Notices:** Draft → Pending approval → Published / Rejected (ADR-013). The Principal's notices publish immediately; the School Admin's go to the Principal unless the school switched approval off. Publishing assigns a school-scoped reference number (`counters` table, atomic) and notifies the audience in-app and by email. Published notices are rendered as a branded A4 PDF (`@react-pdf/renderer`) and a WebP picture (`next/og` then sharp) for sharing; the picture is shared with the device share sheet on phones, otherwise downloaded. Notices have no file attachments yet.
  - **Notifications:** saved in the same transaction as the change; emails go out after commit through Resend's HTTP API and never fail the request. Without `RESEND_API_KEY` emails are skipped and only a line is logged (no address or content).
- **Deviations:** emails are plain text; React Email templates are not used yet. PDFs and images use the built-in Latin fonts, so Hindi text will not render until a font is bundled (Hindi UI is out of scope for now).
- **Follow-ups:** email volume and the Resend plan (open item 6) need a decision before real schools use absence alerts; users cannot yet turn off non-essential emails; no push notifications.

