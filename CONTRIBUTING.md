# Contributing

Tarjuman is built with Spec-Driven Development. Behavior is decided in a specification first,
then planned, then implemented. Code is the last step, not the first.

## Before you start

1. Read the [constitution](.specify/memory/constitution.md). Proposals that conflict with it are
   rejected, including anything that adds courses, lessons, streaks, or other engagement
   mechanics.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md).
3. Find the work in [specs/](specs/): requirements in `spec.md`, tasks in `tasks.md`.

## Setup

Requires **Node 22 or 24** (see `.nvmrc`) and **pnpm**.

```bash
pnpm install
cp .env.example .env     # only if you need the provider spike or live suites
```

`.env` holds a throwaway developer key. It is git-ignored; never commit it and never use a
personal production key.

## The feature workflow

| Stage | Command (Claude Code skill) | Produces |
|-------|------------------------------|----------|
| Specify | `/speckit-specify` | `spec.md` |
| Clarify | `/speckit-clarify` | answers recorded in `spec.md` |
| Plan | `/speckit-plan` | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` |
| Tasks | `/speckit-tasks` | `tasks.md` |
| Analyze | `/speckit-analyze` | consistency report |
| Implement | `/speckit-implement` | code, tasks checked off |

Each stage needs the owner's approval before the next starts. New capabilities require their own
specification, including a threat analysis.

## Checks that must pass

```bash
pnpm typecheck
pnpm lint
pnpm lint:css
pnpm lint:arch
pnpm lint:i18n
pnpm test
pnpm test:redteam
pnpm test:e2e
```

CI runs all of them on every pull request, and failures block merging. Adversarial and guardrail
failures are never waived.

## Rules that the tooling enforces

- Package boundaries (see ARCHITECTURE.md §2): `core` is framework-free, only one package imports
  the SDK, capabilities cannot reach pipeline internals.
- No `dangerouslySetInnerHTML` or `innerHTML` assignment.
- No literal UI strings in `packages/ui` or `apps/web`; use catalog keys in both `en` and `es`.
- CSS logical properties only (`margin-inline-start`, not `margin-left`).

## Adding tests for a security bypass

If you find a prompt-injection or guardrail bypass, add it as a case under
`tests/adversarial/cases/` (schema in
[contracts/adversarial-case.schema.json](specs/001-core-foundation/contracts/adversarial-case.schema.json))
**before** the fix. The case is permanent. For anything that could expose a key or user data,
follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Commits and pull requests

- Conventional Commits: `feat(core): …`, `fix(ui): …`, `docs(spec): …`, `chore: …`.
- Language of code, comments, specs, and commit messages is English.
- Keep each commit to one logical step. Mark finished tasks `[X]` in `tasks.md` in the same
  change.
- A pull request description should say which tasks or requirements it covers and how it was
  verified.
