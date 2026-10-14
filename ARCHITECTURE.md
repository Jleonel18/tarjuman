# Architecture

How Tarjuman is put together and which rules keep it that way. This document describes the design
from [specs/001-core-foundation/plan.md](specs/001-core-foundation/plan.md) as built. The authoritative sources are the
[constitution](.specify/memory/constitution.md) (principles) and the feature specs (requirements);
if this file disagrees with them, they win.

**Implementation status:** all 11 phases of feature 001 are done: everything below is built and
tested. Two limits: the Anthropic adapter has only been tested against synthetic fixtures, never the live
API, and the pipeline has no tool-call path yet (section 6).

## 1. Shape of the system

```
┌─────────────────────────── apps/web (composition root) ───────────────────────────┐
│                                                                                    │
│   packages/ui  ──►  packages/core  ◄──  packages/capabilities/*                   │
│   (React, i18n)     (pure TypeScript)    (declare data only)                      │
│                       ▲        ▲                                                   │
│            implements │        │ implements                                        │
│        packages/provider-anthropic    packages/storage-web                         │
│        (Anthropic SDK, model table)   (IndexedDB, WebCrypto)                       │
└────────────────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼  directly from the browser, with the user's own key
          Anthropic Messages API
```

There is **no Tarjuman server** on the path. The user's key goes from their browser to the
provider and nowhere else. A stateless gateway (for fetching external content) is part of the
long-term topology but is **not built in this feature**, because nothing fetches external
content yet. A desktop shell (Tauri 2) is also future work; the only thing this feature owes it
is that `core` stays portable.

## 2. Packages and what each may depend on

| Package | Role | May import |
|---------|------|-----------|
| `core` | Domain logic and **ports** (interfaces) | `zod`, `markdown-it` only |
| `provider-anthropic` | Implements `ProviderPort`; owns the SDK and the model/price table | `core`, `@anthropic-ai/sdk` |
| `provider-ollama` | Dev-only `ProviderPort` for a free local model; dropped from production builds | `core` |
| `storage-web` | Implements `StoragePort` and `CredentialStore`; keeps the theme preference | `core`, `idb` |
| `capabilities/language-qa` | First capability, pure data | `core` types |
| `ui` | React components, i18next catalogs, design tokens and logical CSS, bundled fonts and icons | `core`, React, i18next, Fontsource font files, `lucide-react` |
| `testing` | Mock provider, fixtures, runners | `core` |
| `apps/web` | Wires adapters, capabilities, UI, and pipeline together | everything |

These rules are **enforced mechanically**, not by convention:

- `packages/core` imports no capability, adapter, UI, app, React, SDK, or Node/DOM built-in.
- Only `provider-anthropic` imports `@anthropic-ai/sdk`.
- A concrete provider is instantiated only in `apps/web/src/composition-root.ts`.
- Only the pipeline module, the provider adapters, the composition root, and tests may name
  `ProviderPort` at all, even as a type. The two provider adapters never import each other.
- Capabilities cannot import pipeline internals.
- Only adapters may unseal a secret (`SecretHandle`).
- Circular dependencies are errors.

Reading a raw secret is split into its own module (`@tarjuman/core/adapter`), so the rule can
forbid every importer except adapters while the rest of the core still passes `SecretHandle`
values around. A type-level assertion in `ports/provider.ts` also fails the build if any field of
`ModelRequest` could carry one.

Enforcement lives in [.dependency-cruiser.cjs](.dependency-cruiser.cjs) (authoritative),
[scripts/provider-port-imports.ts](scripts/provider-port-imports.ts) (the `ProviderPort` rule,
which needs imported names rather than module paths), and [eslint.config.js](eslint.config.js)
(fast feedback in the editor). `pnpm lint:arch` runs the first two.

## 3. Ports

The core talks to the outside world only through interfaces it owns
(defined in [specs/001-core-foundation/contracts/](specs/001-core-foundation/contracts/)):

- **`ProviderPort`**: stream a model response, validate a credential, list models. Adding another
  AI provider means writing another adapter, with no change to `core` or capabilities.
- **`StoragePort` / `CredentialStore`**: persistence and encrypted key storage. Web uses
  IndexedDB and WebCrypto; a desktop shell would use SQLite and the OS keychain.

Provider-specific behavior (reasoning effort, which models reject which parameters) is data inside
the adapter, so callers express intent only.

## 4. The pipeline

Every model interaction, for every capability present or future, runs through one fixed sequence
([contracts/pipeline.md](specs/001-core-foundation/contracts/pipeline.md)):

```
InputGuard → ContextAssembler → ModelCall → OutputGuard → Metrics
```

| Stage | Responsibility |
|-------|----------------|
| InputGuard | Detect key-shaped strings, withhold them from the model, warn the user |
| ContextAssembler | Build prompt layers in fixed precedence; wrap untrusted text in labeled, delimiter-safe blocks |
| ModelCall | Stream through `ProviderPort` |
| OutputGuard | Parse the domain verdict; convert Markdown to a restricted `SafeBlock` tree; check tool calls against permissions and taint |
| Metrics | Record provider-reported token usage; raise the 80 % context notice |

The stage order is fixed inside `Pipeline.run` and is neither exported nor injectable. `Pipeline`
and `CapabilityRegistry` freeze their instances and prototypes, so no method can be swapped at
run time. Only the pipeline module (the `Pipeline` class and `CredentialValidator`) can reach a
`ProviderPort`; capabilities never receive one.

### Instruction hierarchy

Precedence, highest first: **security > domain scope > capability > tone > user preferences >
external content**. Tone is its own prompt layer and cannot relax scope or security. Content from
outside (pasted text, future web pages) has zero instruction authority.

### Rendering safety

Model output never reaches the DOM as HTML. It becomes `SafeBlock` nodes: paragraphs, lists,
code, tables, and links. There is no image node, so remote images cannot auto-load. Links carry
their real destination and stay inert until the user acts. `dangerouslySetInnerHTML` is banned by
lint.

## 5. Domain guardrails

Scope rules are **versioned data**, not prose scattered across prompts
([contracts/domain-rule.schema.json](specs/001-core-foundation/contracts/domain-rule.schema.json)).
A rule with no accept and refuse cases is invalid. Refusals are courteous, state Tarjuman's
purpose, offer an in-domain alternative, and are given in the learner's mediation language.

The verdict (`ACCEPT` / `REFUSE` / `CLARIFY`) comes back in the same model call, so scope
enforcement costs no extra request on the user's key.

## 6. Capabilities

A capability is a plain object declaring its tools, permissions, domain rules, prompt fragments,
and i18n strings ([contracts/capability-contract.md](specs/001-core-foundation/contracts/capability-contract.md)).
The registry validates it with Zod and keeps a frozen copy. Adding one does not require touching
`core`: a test-only dummy capability under `tests/fixtures/` runs a full turn to prove it (SC-008).

Tools run only through the **permission broker** and the OutputGuard:

1. The broker denies a tool the capability did not declare, even if the learner confirmed.
2. The taint gate holds a side-effecting tool in a turn that contains untrusted content until the
   learner confirms.
3. An allowed tool gets a frozen, least-privilege `ToolContext` built from that tool's own
   permissions: `net.fetch` to allowlisted `https` hosts, storage scoped to declared collections
   and access, and the notice surface. It holds no provider, secret, stage, or raw storage.

Every denial is a typed `PermissionDeniedError` plus a `permission_denied` metrics event.

Only `language-qa` ships now. It declares no tools, and no provider is asked for tools in this
feature, so the pipeline never calls the broker yet: `OutputGuard.checkToolCall` is the one place
a future tool-call path must go through.

## 7. Languages

The data model always keeps three separate settings:

- **UI language**: interface text (English and Spanish today)
- **Mediation language**: the language explanations are written in
- **Target language**: the language being learned

All user-facing strings come from translation catalogs. CSS uses logical properties only, so
right-to-left layouts mirror correctly. No RTL UI language ships yet; RTL is verified with a
pseudo-RTL test locale and with Arabic/Hebrew content.

## 8. Styling and themes

The look is defined once, as design tokens, and every component refers to them
([specs/003-visual-design](specs/003-visual-design/)).

- **Tokens.** [`packages/ui/src/styles/tokens.css`](packages/ui/src/styles/tokens.css) holds every
  color, shadow, type size, spacing step, radius, and duration. It is the **only** stylesheet
  allowed to contain a raw color: Stylelint rejects hex values, named colors, and color functions
  anywhere else, and an architecture test rejects colors in a component's `style` prop. Text and
  background pairs are checked for WCAG contrast from the token values (a unit test) and on every
  screen in both themes (axe, in Playwright).
- **Light and dark.** Each color is written as `light-dark(<light>, <dark>)`, and the root sets
  `color-scheme: light dark`, so the device's preference applies with no script and follows a
  change at once. An explicit choice sets `data-theme="light"` or `"dark"` on `<html>`, which pins
  `color-scheme` to one value. "Follow system" removes the attribute.
- **No flash before first paint.** The choice is kept in `localStorage` under `tarjuman.theme` by
  `ThemePreferenceStore` (`packages/storage-web`), because IndexedDB cannot be read synchronously.
  [`apps/web/public/theme-init.js`](apps/web/public/theme-init.js) is a tiny classic script loaded
  from the app's own origin in `<head>`, before the stylesheet and the app module. It reads that one
  key and sets the attribute, so the CSP is unchanged (no inline script). A build test checks that
  it stays a classic, unmodified script in that position.
- **Erasure.** "Delete all my data" also removes every `localStorage` key starting with
  `tarjuman.` and fails its emptiness check if one remains, so the theme choice is never kept.
- **Fonts.** Inter (body), Plus Jakarta Sans (headings), and Noto Naskh Arabic are bundled from
  Fontsource as variable `.woff2` files with hand-written `@font-face` rules in
  [`fonts.css`](packages/ui/src/styles/fonts.css). Only the Latin, Latin Extended, and Arabic
  subsets ship; other scripts use system fonts. `font-display: swap` shows text at once in a
  fallback font, and `unicode-range` makes the Arabic file download only when Arabic text is on
  screen. A build test enforces the budget: Latin files at most 250 KB, Arabic at most 200 KB.
  The reading column uses a 1.7 line height and never clips a line, so Arabic diacritics have room.
- **Icons.** `lucide-react`, imported per icon and drawn by React as SVG: no icon font, no remote
  request. Icons beside a label are `aria-hidden`; directional ones carry `icon-directional` and
  mirror in right-to-left layouts.
- **Layout.** From 64rem up, the chat screen has a persistent sidebar beside a centered reading
  column; below it, the sidebar becomes a drawer that slides in from the inline-start edge. Every
  stylesheet uses logical properties only (`pnpm lint:css`), and Playwright checks that nothing
  scrolls sideways at 320, 768, and 1280 px in English, Spanish, and the pseudo-RTL locale.
- **Notices.** Every notice and error has an icon and wording, never color alone. Focus is always
  a visible 2px outline. `prefers-reduced-motion` and `forced-colors` are honored.

## 9. Handling the API key

- Entered by the user, validated with a minimal real request, then stored only if valid.
- On the web: encrypted with a non-extractable WebCrypto key in IndexedDB, or held in memory only
  for "this session only". The user chooses on first entry; there is no silent default.
- Never placed in model context, logs, telemetry, errors, or any Tarjuman service.
- Displayed only as a masked hint. Settings show it with the storage mode in effect.
- Replacing it validates the new key first and only then removes the old one; a rejected
  replacement keeps the old key. Deleting it keeps the profile and asks for a key again.
- "Delete all my data" (`DataController`, behind a confirmation step) removes the key and checks it
  is gone, then drops the whole IndexedDB database, Cache Storage, and service workers, and verifies
  that nothing is left. A failed check is shown as a failure, never as success. On success the app
  returns to onboarding.

An honest limit: a non-extractable key stops key material from being copied, but a compromised
script on the same origin could still *use* it. That is why the app ships a strict CSP and no
third-party scripts. See [SECURITY.md](SECURITY.md) and the threat analysis in the plan.

## 10. Testing strategy

| Layer | Tool | When | Cost |
|-------|------|------|------|
| Unit and integration | Vitest | every PR | free |
| Architecture rules | dependency-cruiser, `ProviderPort` import check, ESLint, Vitest | every PR | free |
| i18n and RTL checks | lint script, Playwright | every PR | free |
| Adversarial suite, structural | Vitest, mock provider | every PR, blocks merge | free |
| End to end | Playwright against the mock provider | every PR | free |
| Visual design (contrast, focus, overflow, themes, font budget) | Vitest, Stylelint, Playwright with axe | every PR | free |
| Latency (SC-001, SC-002) and network origins (FR-039, FR-040) | Playwright against the mock provider | every PR | free |
| Guardrail and adversarial, behavioral | Vitest against a live model | on demand, and nightly against Claude once `TARJUMAN_TEST_KEY` is set | free with Ollama; uses a test key with Anthropic |

The per-PR gate relies on **structural** assertions (the assembled request never contains the key;
hostile output cannot render an image) because those do not depend on model behavior. Behavioral
rates against the real model are tracked separately. Every discovered bypass becomes a permanent
test case before its fix merges.

## 11. Where to read next

- Requirements: [specs/001-core-foundation/spec.md](specs/001-core-foundation/spec.md)
- Decisions and rationale: [specs/001-core-foundation/research.md](specs/001-core-foundation/research.md)
- Entities: [specs/001-core-foundation/data-model.md](specs/001-core-foundation/data-model.md)
- Interfaces: [specs/001-core-foundation/contracts/](specs/001-core-foundation/contracts/)
- Work breakdown: [specs/001-core-foundation/tasks.md](specs/001-core-foundation/tasks.md)
- Visual design (tokens, themes, fonts, layout): [specs/003-visual-design/](specs/003-visual-design/)
