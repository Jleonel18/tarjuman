# CLAUDE.md

Guidance for AI coding agents working in this repository. Humans: see [README.md](README.md).

## What this project is

Tarjuman is a BYOK, local-first AI mediator for learning languages through comprehensible input.
It follows Spec-Driven Development with GitHub Spec Kit. Read these before changing anything
substantial:

1. [.specify/memory/constitution.md](.specify/memory/constitution.md) — non-negotiable principles.
   It supersedes specs, plans, and habits.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — how the system fits together.
3. The active feature in `specs/<NNN-name>/` (currently `001-core-foundation`): `spec.md`,
   `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md`.

## Workflow

Work happens through Spec Kit skills, in order: `speckit-specify` → `speckit-clarify` →
`speckit-plan` → `speckit-tasks` → `speckit-analyze` → `speckit-implement`. Each stage needs the
owner's approval before the next one.

- Implement tasks from `tasks.md` in order and mark each `[X]` when done. Do not skip ahead of a
  phase checkpoint without saying so.
- Tests come before implementation within a story: write them, see them fail, then implement.
- Do not add features, packages, or abstractions the spec does not call for. If a task seems to
  need one, stop and say so.
- If you find a conflict between spec, plan, and constitution, report it instead of choosing
  silently.

## Hard rules (constitution, in short)

- No courses, lessons, levels, streaks, or other engagement mechanics.
- `packages/core` stays framework-free: no React, no `@anthropic-ai/sdk`, no Node or DOM APIs,
  no imports from capabilities or adapters.
- Only `packages/provider-anthropic` imports the SDK. Only the pipeline module may reach a
  `ProviderPort`. Only adapters may unseal a `SecretHandle`.
- Every model call goes through the pipeline. Never add a second path to the provider.
- The user's API key must never appear in model context, logs, errors, telemetry, fixtures, or
  committed files.
- No `dangerouslySetInnerHTML`, no `innerHTML` assignment, no auto-loaded remote resources, no
  `img` node in `SafeBlock`.
- No hard-coded user-facing strings: use i18n catalog keys. CSS uses logical properties only.
- Keep UI language, mediation language, and target language as three separate settings.
- No automatic retries against the provider (cost safety).
- Tone is a separate prompt layer and must not change what the app will or won't do.
- A newly found injection bypass becomes a permanent adversarial test case before its fix.

## Secrets

- `.env` is git-ignored and may hold a throwaway test key (`TARJUMAN_TEST_KEY`). **Do not read,
  print, or log `.env`.** If a script needs it, load it with `node --env-file=.env` so the value
  never passes through your context, and make sure the script prints results only, never the key
  or request headers.
- Never commit `.env*` except `.env.example`.

## Commands

Requires Node 22 or 24 and pnpm.

```bash
pnpm install
pnpm typecheck     # tsc -b
pnpm lint          # ESLint
pnpm lint:css      # Stylelint (logical properties)
pnpm lint:arch     # dependency-cruiser (package boundaries)
pnpm lint:i18n     # catalog parity (placeholder until T038)
pnpm test          # Vitest, all projects
pnpm test:redteam  # adversarial project only
pnpm test:e2e      # Playwright
pnpm --filter @tarjuman/web dev
```

Run `pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm test` before declaring work done.

## Repository map

- `packages/core` — domain logic and ports
- `packages/provider-anthropic` — Anthropic adapter and model/price table
- `packages/storage-web` — IndexedDB and WebCrypto adapters
- `packages/capabilities/language-qa` — first capability
- `packages/ui` — React components, i18n catalogs, styles
- `packages/testing` — mock provider, fixtures, runners
- `apps/web` — composition root and shell
- `tests/` — adversarial, guardrails, e2e, architecture suites
- `specs/` — Spec Kit feature folders
- `.specify/`, `.claude/skills/` — Spec Kit machinery; edit only via Spec Kit or deliberately

## Conventions

- Specs, code, identifiers, comments, and commit messages are in **English**. Talk to the owner in
  **Spanish** unless they switch.
- Commits use Conventional Commits (`docs(spec): …`, `feat(core): …`, `chore: …`). One logical
  step per commit.
- Prefer small, boring TypeScript: strict mode, no `any`, Zod at trust boundaries.
- Provider facts (model ids, prices, parameter support) drift. Verify against live documentation
  rather than memory, and record results in `research.md`.

## Current state

Phase 1 of 11 is done (workspace, tooling, CI, boundary rules). Every package is an empty stub.
Phase 2 begins with task T018, a provider spike. The owner has no Anthropic key and will not buy
one, so do the spike from documentation plus keyless probes (CORS was already verified with a fake
key) and mark anything not confirmed by a live call as unverified. Do not ask for a key.
