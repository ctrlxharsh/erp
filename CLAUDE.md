# CLAUDE.md — working rules for this repository

**Pixel Schoolware** by PastAndPixels Group: a multi-school ERP with a Next.js web app and (later) an Expo Android app in one pnpm + Turborepo monorepo.

## Read first, every session
1. [`CONSTITUTION.md`](CONSTITUTION.md): the source of truth for scope, roles, stack, architecture, UX rules and roadmap.
2. [`docs/DECISIONS.md`](docs/DECISIONS.md): why things are the way they are. Do not reverse an accepted decision without a new ADR approved by the founder.
3. `docs/flows/`: the original role flow diagrams. `docs/kickoff/PROJECT_BRIEF.md` is historical context only.

If the constitution and the code disagree, stop and ask which one is right.

## How to behave
- **Be a critical engineering partner, not a yes-man.** Point out risks, missing requirements, insecure designs, UX problems and needless dependencies, and propose a better option with a clear recommendation.
- **Never invent requirements.** Anything not in the constitution is an open decision: ask, with options and a recommended default.
- **Verify, don't assume.** Check current official docs before relying on a library, cloud feature or API behaviour.
- **Keep it simple.** One library per job, no speculative abstractions, no decorative animation. Follow the dependency policy in CONSTITUTION §5.

## How to work
1. **Plan first:** for a feature, give a short change list (paths, schema changes, dependencies, tests, tradeoffs) and get approval before building.
2. **Ask before:** architecture changes, new significant dependencies, paid services, auth or storage changes, irreversible data changes, production deploys or migrations on prod.
3. **Build one vertical slice at a time** (schema → API with permission + school scope → web UI → tests).
4. **After editing:** run Biome, type check and tests; report real results and anything not tested. Never claim a command passed without running it.
5. **Ship directly to `main`** (founder's instruction, 2026-11-16): no pull requests or feature branches. Commit small, Conventional Commit messages, and run Biome, type check, tests and build before every push. Keep `main` deployable.

## Non-negotiables (see CONSTITUTION §2)
- Server-side permission checks on every procedure; UI hiding is never security.
- Every school-owned query is scoped by `school_id`; each router has a tenant-isolation test.
- Audit sensitive actions. Money records are append-only (reversals, never edits). Money in integer paise.
- Files in private object storage, never in DB tables. All stored images are WebP, metadata stripped.
- Validate all input with shared Zod schemas on the server.
- No secrets or children's personal data in code, logs or URLs.
- Accessible UI: labels, focus, AA contrast, status never by color alone. All UI strings via i18n.

## Code standards
- TypeScript strict; small modules; clear names; no `any` without a comment explaining why.
- Use semantic design tokens (`primary`, `danger`, …), never raw hex values in components.
- Web lists use the shared `ERPDataTable`; forms use React Hook Form + Zod with the shared form patterns.
- Mobile uses touch-first lists and cards, never desktop tables.
- Database: reviewed Drizzle migrations, explicit FKs and unique constraints, transactions for multi-row writes, indexes from real query patterns.
- No Next.js Server Actions for data; all data goes through tRPC so mobile reuses it.

## Commands
Requires Node 24+ and pnpm 12 (`packageManager` is pinned in `package.json`).

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev` | Run the web app at http://localhost:3000 |
| `pnpm lint` / `pnpm lint:fix` | Biome check / apply safe fixes (Markdown is excluded) |
| `pnpm typecheck` | TypeScript check in every package |
| `pnpm test` | Vitest in every package that has tests |
| `pnpm build` | Production build |
| `pnpm check` | Lint, typecheck, test and build in one go (what CI runs) |
