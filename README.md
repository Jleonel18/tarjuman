# Tarjuman

> *Tarjuman* (تَرْجُمان) is Arabic for "interpreter".

Tarjuman is an AI **mediator** for learning languages through **comprehensible input**
(Krashen's *i+1*). It is not a course: there are no lessons, levels to unlock, or streaks. You
tell it which language you want explanations in, which language you are learning, your level and
your interests, and it answers your questions about the language at the right difficulty.

- **Bring your own key (BYOK).** You use your own Anthropic or Google Gemini API key. It stays on
  your device and is only ever sent to the provider you chose.
- **Local-first.** No accounts, no Tarjuman server. Conversations and settings live in your
  browser.
- **Stays on purpose.** Declarative guardrails keep it focused on language learning, so your paid
  key is not spent on unrelated work.
- **Hard to hijack.** Pasted or external text is treated as untrusted data, never as
  instructions, and model output is rendered through a restricted format (no images, no raw
  HTML).
- **Global by design.** Interface in English and Spanish today; layout and text handling are
  built for right-to-left scripts from day one.
- **Light and dark themes.** It follows your device's theme, or you pick light or dark on any
  screen. Fonts and icons are bundled with the app, so nothing loads from a third party.

## Status

**Feature-complete for the first release, not released yet.** The app works end to end against a
mock provider and a free local model. It has **never run against the real Anthropic API**: the
maintainer has no key, so the Anthropic adapter is built and tested against synthetic fixtures only.
Do not trust it with a real key until a release says otherwise.

The project follows Spec-Driven Development with [GitHub Spec Kit](https://github.com/github/spec-kit).

| Stage | State |
|-------|-------|
| Constitution (12 principles) | Done |
| Specification (`001-core-foundation`) | Done |
| Plan, data model, contracts | Done |
| Task list (153 tasks, 11 phases) | Done |
| Implementation | **All 11 phases done** (153 tasks). Results: [validation](specs/001-core-foundation/checklists/validation.md), [security review](specs/001-core-foundation/checklists/security-review.md) |

What works today: onboarding, key entry with a choice of where the key is kept, a streaming chat
with saved conversations, the security pipeline (key withholding, untrusted-content isolation,
safe rendering), scope guardrails with courteous refusals, the token and cost stats panel, model
and effort settings, tone presets, English and Spanish interfaces with right-to-left support,
light and dark themes with a layout that adapts to phone, tablet, and desktop, replacing or
deleting the key, and "delete all my data". Capabilities are added by declaration
and checked by a permission broker.

**Finding material (feature 005).** Ask for videos or songs in the language you are learning and
the assistant searches YouTube and shows cards: source and channel, type, duration, captions,
language, price, an estimate of difficulty for you, and why it fits. Cards are built by the app from
what YouTube returned, never from the model's text, and they link to YouTube. Before the first
search the app asks your consent and says what is sent. You can save cards; YouTube data is not
kept more than 30 days (a card then shows only that it expired, and Refresh fetches it again). It
needs a model that can use tools (Claude and Gemini can; the local Ollama models cannot) and a
YouTube Data API key of your own: in the Google Cloud console enable "YouTube Data API v3" for a
project, create an API key, and restrict it to the site's address. Add it under Settings →
Internet search. The free daily allowance covers about 100 searches.

What is still open: a run against Claude itself. The guardrail fixtures were recorded with a local
non-Claude model, so how well Claude keeps to scope (SC-003) is not measured, and the nightly job
that would measure it skips until a test key is configured. A human click-through of the manual
scenarios is also still to do.

Progress is tracked by the checkboxes in
[specs/001-core-foundation/tasks.md](specs/001-core-foundation/tasks.md).

## How it works

```
 you ─► web app ─► Pipeline ─► Anthropic API or Gemini API (directly from your browser, with your key)
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

## Security model in short

- **Your key** is validated before it is stored, kept encrypted with a non-extractable browser key
  (or only in memory, if you choose "this session only"), shown only as a masked hint, and sent
  only to the AI provider. It is never part of what the model sees.
- **Pasted text** is labeled as untrusted data with no authority to give instructions, and
  anything that looks like a key is withheld before it reaches the model.
- **Answers** are rendered as a restricted set of blocks: no images, no raw HTML, and links that
  show their real destination and do nothing until you act.
- **The browser** runs under a strict Content-Security-Policy, loads no third-party scripts, and
  talks only to the app's own origin and the provider. There is no telemetry.
- **Capabilities** get only the permissions they declare, checked by a permission broker.
- **Search results** are untrusted data: validated, capped, fenced from the instruction layers, and
  turned into cards by the app. The model only picks which results to show.
- **Your data** can be erased in one confirmed action, which verifies that nothing is left.

Known limits and how to report a problem: [SECURITY.md](SECURITY.md).

## Repository layout

| Path | What it is |
|------|------------|
| `packages/core` | Framework-free TypeScript core: conversation, pipeline, guardrails, stats, ports |
| `packages/provider-anthropic` | Adapter for the Anthropic API (the only package that imports the SDK) |
| `packages/provider-gemini` | Adapter for the Google Gemini API, with native `fetch` (no SDK) |
| `packages/provider-ollama` | Development-only adapter for a free local model ([docs/local-model.md](docs/local-model.md)); never in a production build |
| `packages/search-youtube` | Adapter for the YouTube Data API, with native `fetch`; validates and caps what it returns |
| `packages/storage-web` | Adapter for IndexedDB storage and WebCrypto key encryption |
| `packages/capabilities/language-qa` | The first capability: answering questions about your target language |
| `packages/capabilities/resource-curation` | The second capability: finding videos and songs in your target language |
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
pnpm lint:arch      # package boundaries (dependency-cruiser) and ProviderPort import check
pnpm lint:i18n      # catalog parity between English and Spanish
pnpm lint:rules     # guardrail rule versions and recorded fixtures
pnpm test           # Vitest, all projects
pnpm test:redteam   # adversarial suite only, with a summary
pnpm test:e2e       # Playwright against the production build and the mock provider
pnpm test:live:youtube  # opt-in smoke test of the YouTube adapter; needs YOUTUBE_API_KEY in .env
```

Running the app without an Anthropic key:

```bash
VITE_PROVIDER=mock pnpm --filter @tarjuman/web dev     # deterministic mock; key: sk-ant-mock-valid-key-0000
VITE_PROVIDER=ollama pnpm --filter @tarjuman/web dev   # free local model, see docs/local-model.md
```

The live-model suites (`test:live:*`) and `record:guardrails` use Ollama by default. Pointed at
Anthropic they need a throwaway key: copy [.env.example](.env.example) to `.env` (git-ignored) and
fill it in. End users never use this: they enter their own key in the app.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit and which rules keep them apart
- [SECURITY.md](SECURITY.md) — security model and how to report a problem
- [docs/local-model.md](docs/local-model.md) — running and testing with a free local model
- [docs/adding-a-capability.md](docs/adding-a-capability.md) — how to add a capability without touching the core
- [CLAUDE.md](CLAUDE.md) — instructions for AI coding agents working in this repo
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — the non-negotiable principles
- [specs/001-core-foundation/](specs/001-core-foundation/) — spec, plan, data model, contracts, tasks

## License

Not yet chosen.
