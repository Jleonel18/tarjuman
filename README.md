# Tarjuman

> *Tarjuman* (تَرْجُمان) is Arabic for "interpreter".

Tarjuman is an AI **mediator** for learning languages through **comprehensible input**
(Krashen's *i+1*). It is not a course: there are no lessons, levels to unlock, or streaks. You
tell it which language you want explanations in, which language you are learning, your level and
your interests, and it answers your questions about the language at the right difficulty.

- **Bring your own key (BYOK).** You use your own Anthropic API key. It stays on your device and
  is only ever sent to Anthropic.
- **Local-first.** No accounts, no Tarjuman server. Conversations and settings live in your
  browser.
- **Stays on purpose.** Declarative guardrails keep it focused on language learning, so your paid
  key is not spent on unrelated work.
- **Hard to hijack.** Pasted or external text is treated as untrusted data, never as
  instructions, and model output is rendered through a restricted format (no images, no raw
  HTML).
- **Global by design.** Interface in English and Spanish today; layout and text handling are
  built for right-to-left scripts from day one.

## Status

**Early development. There is no usable app yet.**

The project follows Spec-Driven Development with [GitHub Spec Kit](https://github.com/github/spec-kit).
Everything is specified and planned; implementation has just started.

| Stage | State |
|-------|-------|
| Constitution (12 principles) | Done |
| Specification (`001-core-foundation`) | Done |
| Plan, data model, contracts | Done |
| Task list (153 tasks, 11 phases) | Done |
| Implementation | **Phase 2 of 11 done** (foundation: ports, storage, mock provider, i18n, app shell). No user-facing feature yet |

What exists today: the monorepo, lint/type/architecture checks and a CI workflow, the typed
contracts, encrypted local storage, a mock provider for testing without a key, English and Spanish
catalogs, and an app shell with a strict Content-Security-Policy. What does **not** exist yet: the
chat, onboarding, the security pipeline, the Anthropic adapter, the guardrails, and the stats
panel. `pnpm --filter @tarjuman/web dev` serves a placeholder page.

Progress is tracked by the checkboxes in
[specs/001-core-foundation/tasks.md](specs/001-core-foundation/tasks.md).

## How it will work

```
 you ─► web app ─► Pipeline ─► Anthropic API (directly from your browser, with your key)
                      │
   input guard → trust-labeled context → model → output guard → usage metrics
```

Every message passes through the same fixed pipeline:

1. **Input guard** withholds anything shaped like an API key.
2. **Context assembly** builds the prompt in a fixed order of authority
   (security > domain scope > capability > tone > your preferences > conversation) and wraps
   pasted material as labeled, untrusted data.
3. **Model call** streams the answer from the provider.
4. **Output guard** turns the answer into safe blocks: no auto-loaded images, links shown with
   their real destination, HTML shown as text.
5. **Metrics** record the provider-reported token usage for the stats panel.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full picture.

## Repository layout

| Path | What it is |
|------|------------|
| `packages/core` | Framework-free TypeScript core: conversation, pipeline, guardrails, stats, ports |
| `packages/provider-anthropic` | Adapter for the Anthropic API (the only package that imports the SDK) |
| `packages/storage-web` | Adapter for IndexedDB storage and WebCrypto key encryption |
| `packages/capabilities/language-qa` | The first capability: answering questions about your target language |
| `packages/ui` | React components, translation catalogs, logical-property styles |
| `packages/testing` | Mock provider, fixtures, adversarial test runner, pseudo-RTL locale |
| `apps/web` | The web app that wires everything together |
| `tests/` | Cross-package suites: adversarial, guardrails, end-to-end, architecture |
| `specs/` | Specification, plan, contracts, and tasks for each feature |
| `.specify/`, `.claude/skills/` | Spec Kit templates, scripts, and slash-command skills |

## Getting started (contributors)

Requirements: **Node 22 or 24** (see `.nvmrc`) and **pnpm**.

```bash
pnpm install
pnpm typecheck      # TypeScript project references
pnpm lint           # ESLint (bans dangerouslySetInnerHTML, enforces i18n and import boundaries)
pnpm lint:css       # Stylelint: logical CSS properties only
pnpm lint:arch      # dependency-cruiser: package boundary rules
pnpm test           # Vitest
pnpm --filter @tarjuman/web dev   # empty placeholder page for now
```

Other scripts (`test:e2e`, `test:redteam`, `test:live:*`, `lint:i18n`) are wired up but have
little or nothing to run until their phases are implemented.

Some tooling (the provider spike and the live-model test suites) needs a throwaway API key. Copy
[.env.example](.env.example) to `.env` (git-ignored) and fill it in. End users never use this:
they enter their own key in the app.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit and which rules keep them apart
- [SECURITY.md](SECURITY.md) — security model and how to report a problem
- [CLAUDE.md](CLAUDE.md) — instructions for AI coding agents working in this repo
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — the non-negotiable principles
- [specs/001-core-foundation/](specs/001-core-foundation/) — spec, plan, data model, contracts, tasks

## License

Not yet chosen.
