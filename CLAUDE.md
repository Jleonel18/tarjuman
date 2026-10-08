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

## Working agreement with the owner (overrides skills and hooks)

The owner reviews all code before it enters git history, and there is no pull request to review
through yet. So:

- **Do not commit or push.** Never run `git commit` or `git push`, and never run the
  `speckit-git-commit` hook. When a Spec Kit skill offers that optional hook (before or after
  specify, clarify, plan, tasks, implement, and so on), skip it and say you skipped it. The owner
  makes the commits.
- **Explain every code change** in plain language: which files changed, what each one does, why
  it exists, and where to start reading. "Done" is not an explanation.
- **Work in small batches** of a few tasks, each reviewable on its own. Leave the working tree
  uncommitted between batches, including the `[X]` marks in `tasks.md`.
- **Stop at every point where a commit would normally happen.** End the batch, summarize it, give
  a suggested commit message and the `git add` paths, and wait for the owner to say to continue.
  Do not start the next batch on your own.

### Branches: when to recommend a new one or a merge to `main`

The owner creates branches and does the merges, like commits. The agent never creates, merges,
or deletes branches. It **recommends**, in the batch summary, at these points:

- **New branch:** before starting a new phase or user story (for example Phase 3 → Phase 4), or
  any work that is not part of the current branch's goal (a refactor, a docs rewrite, a spec
  change). Suggest a name `<NNN>-<short-goal>` (`001-us1-chat-mvp`) so Spec Kit skills still
  recognize it. Also recommend one if the current branch is `main` and the next batch changes code.
- **Merge to `main`:** at a phase checkpoint, when the user story's independent test passes and
  `pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm test` is green with a clean working
  tree. Say what is in the branch, give the checks that passed, and offer the commands
  (`git checkout main`, `git merge --ff-only <branch>`, then the owner decides on the push and on
  deleting the branch). Do not recommend merging mid-phase or with red checks.
- Say it once per checkpoint, at the end of the batch, then wait. Do not repeat it every batch.

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
VITE_PROVIDER=ollama pnpm --filter @tarjuman/web dev   # dev-only free local model
pnpm test:live:ollama                                    # live smoke test, needs Ollama running
```

Setup for the local model: [docs/local-model.md](docs/local-model.md).

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

Phases 1-3 of 11 are done for feature 001: tooling, ports and types, encrypted storage, the mock
provider and contract suite, i18n, the app shell with its CSP, and User Story 1 (the MVP chat).
Phase 4 (User Story 2, guardrails) is next.

The provider spike (T018) was done without a key because the owner has no Anthropic key and will
not buy one; its results are in `research.md` -> Spike Results, and what it could not confirm is
listed there as unverified. Do not ask for a key. Test fixtures that imitate the provider's wire
format are synthetic until a live capture exists, and must say so.

Feature 002 (`specs/002-free-dev-provider/`) adds a dev-only Ollama provider so guardrail fixtures
can be recorded and run without a key. Anthropic is still the only product provider. Results from a
non-Claude model never count as 001 SC-003 evidence; fixture provenance says which model produced
them. Setup: [docs/local-model.md](docs/local-model.md).

Gotchas learned so far:

- `idb` uses the global `indexedDB`; tests use `fake-indexeddb/auto` and assign
  `globalThis.indexedDB = new IDBFactory()` per test.
- `@tarjuman/core/adapter` is the only way to read a raw secret, and only adapters may import it.
- E2E runs against the production build (`vite build` + `vite preview`) so the real CSP is tested.
- `i18next` catalogs are flat and dotted (`common.save`); key and namespace separators are off.
- Do not import across package roots in tests (`tsc -b` would emit stray `.js` files).
- `VITE_PROVIDER=ollama` is dev-only: it is guarded by `import.meta.env.DEV` and stripped from
  production builds. Ollama silently drops the start of a prompt larger than its context, where
  the security layer sits, so `OLLAMA_CONTEXT_LENGTH=32768` is required.
