> **Historical.** This was the kickoff brief. It is superseded by [`CONSTITUTION.md`](../../CONSTITUTION.md) and [`DECISIONS.md`](../DECISIONS.md).

# School ERP — Project Brief

> Starting context for Claude Code. Status: planning / pre-scaffold. Updated: 2026-11-16.

## Goal
Build a simple, efficient, accessible, production-oriented school ERP as a **pnpm + Turborepo monorepo**. Optimize daily workflows, speed, consistent UX, and low maintenance—not animations or a large collection of libraries.

The **web ERP is the primary product**, handling complex operations and data-heavy tables. The **React Native mobile app is a companion**, focused on lightweight tasks and information access. Share contracts and business logic; do not force web components into native.

## Intended roles and experiences
- **Platform/Master Admin (web):** manage schools/tenants, plans, high-level settings and operations.
- **School Admin (web):** admissions, records, fees, staff, classes, reporting, administration.
- **Principal (web first; optional mobile):** dashboards, oversight, approvals.
- **Teacher (web + mobile):** daily attendance, marks, homework, notices, timetable. Fewer feature types does not mean low usage.
- **Student / Parent (mobile first):** timetable, attendance, results, fees, notices.

All role capabilities and boundaries are **provisional** until requirements are confirmed.

## Selected baseline stack
| Concern | Choice |
|---|---|
| Repository | pnpm workspaces + Turborepo |
| Language | TypeScript |
| Web | Next.js + React, deployed on Vercel |
| Web UI | shadcn/ui + Tailwind CSS; Lucide icons; Sonner via shadcn |
| Data tables | TanStack Table, rendered with shadcn; server-side pagination/filtering/sorting for large data |
| Charts | Recharts through shadcn chart patterns |
| Forms | React Hook Form + Zod |
| Server state | TanStack Query where client-side caching is genuinely needed |
| Web animation | CSS first; Motion only where it improves usability |
| Mobile | Expo + React Native; React Native Reusables + NativeWind (verify compatibility before locking versions) |
| Mobile animation | Native defaults first; Reanimated for custom interactions |
| Database | Neon PostgreSQL |
| DB access / migrations | Drizzle ORM + Drizzle Kit; raw SQL allowed when appropriate |
| Image / document storage | Evaluate Neon Object Storage for private uploads; verify current capabilities and fit before committing |
| Deploy | Vercel for Next.js; Expo EAS for native app builds |

**Intentional exclusions for now:** coss ui, Magic UI, React Bits, Aceternity, ECharts, duplicate table kits, Lottie, Redis, queues and additional component frameworks. Add only with a concrete requirement.

## Design and engineering priorities
1. Fast and clear navigation; accessible forms and states; responsive but desktop-optimized web administration.
2. A reusable `ERPDataTable` wrapper, standardized filters, row actions, bulk actions, exports, empty/loading/error states.
3. Mobile task-oriented screens; no desktop-style wide tables squeezed onto phones.
4. Shared TypeScript API contracts, Zod schemas, types, domain utilities, and permission identifiers.
5. **Backend authorization is mandatory.** Tenant boundaries and role permissions must never depend on UI hiding controls.
6. Secure handling of minors' personal data, private files, auditable financial changes, and safe uploads.
7. Keep architecture simple; test workflows, not just components.
8. Prefer boring, maintainable approaches and no speculative abstractions.

## Suggested initial workspace (proposal, not mandate)
```text
apps/
  web/               # Next.js ERP and server API (unless architecture review says otherwise)
  mobile/            # Expo React Native
packages/
  contracts/         # Shared Zod schemas and API types
  domain/            # Pure shared business helpers and permission constants
  db/                # Drizzle schema, migrations, server-only database access
  config/            # Shared TS / lint config if warranted
```

Avoid a shared React `ui` package across web/native until actual compatible components justify it. Keep the DB package server-only.

## Important decisions NOT made yet
- Single-school vs multi-school SaaS; required isolation level and onboarding.
- MVP features, target school type/country, academic-year model, fee and attendance rules.
- Auth provider and mobile session strategy; Neon Auth is a candidate, **not chosen**.
- API design (Next.js route handlers vs separate service); mobile API lifecycle.
- File storage provider, private access controls and signed upload/download workflows.
- Payment gateway, email/SMS/WhatsApp, background jobs/cron, notifications and offline use.
- Hosting region, budgets, backups, restore drills, audit retention, privacy and compliance.
- Monitoring (Sentry candidate), tests (Vitest/Playwright candidates), CI/CD and release workflow.
- Need for admin impersonation, cross-school reports, parent-child associations and exports.

## First task for Claude Code
Read this brief and `CLAUDE.md`. **Do not scaffold, install libraries, connect services, or create database tables yet.** First challenge the assumptions and interview me, prioritized by impact. Present alternatives with tradeoffs and your recommendation, then request explicit approval of a short architecture decision record. Once approved, propose a minimal monorepo scaffold and a vertical-slice MVP (e.g., schools/classes/students) with security boundaries and tests.

## Official references (verify current documentation at implementation time)
- https://ui.shadcn.com/
- https://tanstack.com/table/latest
- https://tanstack.com/query/latest
- https://recharts.org/
- https://react-hook-form.com/
- https://zod.dev/
- https://motion.dev/
- https://docs.expo.dev/
- https://docs.swmansion.com/react-native-reanimated/
- https://neon.com/docs
- https://orm.drizzle.team/
- https://vercel.com/docs
- https://turbo.build/repo/docs
