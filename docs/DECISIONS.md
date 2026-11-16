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
**Status:** Accepted · 2026-11-16
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
