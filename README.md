# ERP

A simple, clean school management platform for Indian schools. Built by **PastAndPixels Group**.

- **Web app:** Super Admin, School Admin, Principal, Teacher, Student, Parent
- **Android app (later):** Principal, Teacher, Student, Parent

## Documents

| Document | What it is |
|---|---|
| [CONSTITUTION.md](CONSTITUTION.md) | Scope, roles, stack, architecture, UX rules, roadmap. The source of truth. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records: what we chose and why. |
| [docs/flows/](docs/flows) | Original role flow diagrams. |
| [docs/brand/](docs/brand) | Logo source. |
| [CLAUDE.md](CLAUDE.md) | Working rules for AI-assisted development. |

## Status

Phase 0 (foundation) is complete: scaffold, design system and app shell, Neon Auth, permissions, tenant isolation (RLS), audit log, private file pipeline, Super Admin school management, and school setup (profile and logo, sessions, classes, sections, subjects). Next: Phase 1, people (see CONSTITUTION §15).

## Getting started

```bash
pnpm install
neon login && neon checkout test && neon deploy   # Neon test branch, writes .env.local
pnpm --filter @erp/db db:migrate                  # apply migrations to that branch
pnpm dev
```

See the Commands section in [CLAUDE.md](CLAUDE.md) for all scripts.
