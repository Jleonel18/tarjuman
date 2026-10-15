# Architecture

How Tarjuman is put together and which rules keep it that way. This document describes the design
from [specs/001-core-foundation/plan.md](specs/001-core-foundation/plan.md) as built. The authoritative sources are the
[constitution](.specify/memory/constitution.md) (principles) and the feature specs (requirements);
if this file disagrees with them, they win.

**Implementation status:** all 11 phases of feature 001 are done: everything below is built and
tested. Feature 004 added Google Gemini as a second product provider (section 3). Two limits: the
Anthropic adapter has only been tested against synthetic fixtures, never the live API (the Gemini
adapter has been run live once), and the pipeline has no tool-call path yet (section 6).

## 1. Shape of the system

```
┌─────────────────────────── apps/web (composition root) ───────────────────────────┐
│                                                                                    │
│   packages/ui  ──►  packages/core  ◄──  packages/capabilities/*                   │
│   (React, i18n)     (pure TypeScript)    (declare data only)                      │
│                       ▲        ▲                                                   │
│            implements │        │ implements                                        │
│        packages/provider-anthropic    packages/storage-web                         │
│        packages/provider-gemini       (IndexedDB, WebCrypto)                       │
│        (adapters, model tables)                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼  directly from the browser, with the user's own key for the chosen provider
          Anthropic Messages API   or   Gemini API (generativelanguage.googleapis.com)
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
| `provider-gemini` | Implements `ProviderPort` for Google Gemini with native `fetch` (no SDK); owns its model/price table | `core` |
| `provider-ollama` | Dev-only `ProviderPort` for a free local model; dropped from production builds | `core` |
| `storage-web` | Implements `StoragePort` and `CredentialStore`; keeps the theme preference | `core`, `idb` |
| `search-youtube` | Implements `SearchPort` for the YouTube Data API with native `fetch`; validates and caps everything it returns | `core`, `zod` |
| `capabilities/language-qa` | First capability, pure data | `core` types |
| `capabilities/resource-curation` | Second capability: finds videos and songs in the target language (contract 1.1.0, shared by all conversations) | `core` types |
| `ui` | React components, i18next catalogs, design tokens and logical CSS, bundled fonts and icons | `core`, React, i18next, Fontsource font files, `lucide-react` |
| `testing` | Mock provider, fixtures, runners | `core` |
| `apps/web` | Wires adapters, capabilities, UI, and pipeline together | everything |

These rules are **enforced mechanically**, not by convention:

- `packages/core` imports no capability, adapter, UI, app, React, SDK, or Node/DOM built-in.
- Only `provider-anthropic` imports `@anthropic-ai/sdk`.
- A concrete provider is instantiated only in `apps/web/src/composition-root.ts`.
- Only the pipeline module, the provider adapters, the composition root, and tests may name
  `ProviderPort` at all, even as a type. The provider adapters never import each other.
- Likewise only the search broker (and the search credential validator), the search adapters, the
  composition root, and tests may name `SearchPort`; a concrete search source is instantiated only
  in the composition root; a search adapter imports only the core.
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
- **`SearchPort`** (feature 005): search a source such as YouTube, validate its key, and fetch the
  current details of known ids. Only `SearchBroker` holds one.
- **`StoragePort` / `CredentialStore`**: persistence and encrypted key storage. Web uses
  IndexedDB and WebCrypto; a desktop shell would use SQLite and the OS keychain.

Provider-specific behavior (reasoning effort, which models reject which parameters) is data inside
the adapter, so callers express intent only.

### More than one provider (feature 004)

The product offers Anthropic and Google Gemini; the learner picks one in onboarding and can switch
in settings. `ProviderPort` did not change. Instead:

- The composition root builds a fixed list of providers (dev builds: Ollama alone; the e2e build:
  one mock, or two with `?mockProviders=2`). The UI and the controller see only `ProviderOffer`
  (id, models, default model), never a `ProviderPort`.
- `Pipeline` holds that list, frozen, and sends each turn to the provider named by
  `profile.providerId`, with that provider's key. An unknown id ends the turn; nothing falls back
  to another provider. `ProviderCredentialValidator` holds the same list.
- `CredentialStore` keeps at most one key per provider, side by side; each method names its
  provider. The IndexedDB database went to version 2, and the upgrade moves a key stored under the
  old fixed id to its provider id, so existing installs keep working.
- A profile saved before 004 has no `providerId` and is read as Anthropic's (`readStoredProfile`).
  Switching provider resets the model to that provider's default and keeps the effort.
- `KeyManager` knows the key shapes (`sk-ant-…`, `AIza…`, `AQ.…`; `credentials/key-shapes.ts`). A
  key shaped for another provider is rejected locally before any request. Dev and test providers
  have no known shape and accept any key.

### Searching for resources (feature 005)

The learner asks for videos or songs; the model searches YouTube and the app shows cards. Four
pieces make that safe, and none of them trusts the model or the source:

- **Tool calls through `ProviderPort`.** `StreamEvent` has a `tool_call`; `ProviderMessage` has
  assistant-with-`toolCalls` and `tool` forms; `ModelInfo.supportsTools` says whether a model can
  use them. `continuation` is opaque adapter data (Gemini's thought signature) that the pipeline
  sends back unchanged and never stores or shows. The type-level proof that a `ModelRequest`
  cannot carry a `SecretHandle` still holds. Ollama declares `supportsTools: false`.
- **`SearchBroker`.** The only holder of `SearchPort`s. Each call checks the on/off switch and the
  learner's consent (per source, per version of its terms), validates the query (at most 120
  characters, no key shape) and the ids, loads the key, makes **one** request, and cleans what comes
  back (ids, lengths, key-shaped text). It never retries and never passes the key anywhere.
- **Credential ids.** Provider ids and search source ids share one key space: the same
  `CredentialStore`, `KeyManager` and "delete all my data" cover `youtube`. A key shape maps to a
  *set* of ids: an `AIza…` key is valid for `gemini` and `youtube`, `AQ.…` only for `gemini`.
- **The step loop** (below). Cards are built by the app from search data plus the model's choice of
  ids; the model never supplies a title, link or label.

Saved resources (`saved_resources`, IndexedDB version 3) are written only by the learner's click.
YouTube data is not kept longer than 30 days, in saved items or in conversations: `ResourceRetention`
runs at every start and strips an old card to its source, id and fetch time; **Refresh** fetches it
again with one request. The CSP `connect-src` gained exactly `https://www.googleapis.com`; the
YouTube and Google policy pages appear in the bundle only as links opened by a click.

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

### The step loop (feature 005)

A turn is no longer one model call. `Pipeline.run` makes up to **4 steps**: the model may ask for
tools, the pipeline runs them, and the results go back to it. For each call, in order:

1. `OutputGuard.checkToolCall`: the permission broker (an undeclared tool is denied) and the taint
   gate (a side-effecting tool after search results waits for the learner).
2. Per-turn limits: 2 searches, 1 `show_resources`. Over the limit is an error result.
3. A *presentation* tool (`show_resources`) is validated against the turn's results and kept, not run.
4. Consent: a search without consent ends the turn as `consent_required`, with nothing sent and the
   question and empty answer discarded. The app asks; on Agree the same message is sent as a **new
   turn** (the learner's action, not a retry).
5. Anything else runs under the broker. Its result reaches the model as an `untrusted_data` block,
   and later segments of the turn count as untrusted.

Only the **last** step's text is shown and gives the verdict; earlier text is dropped (a step is
buffered while tools are on offer). The last step is offered no tools. A `TurnSearchSession` numbers
results `r1…r16` across the turn's searches. In a turn that searched, a link in the prose is
clickable only if it equals a card's own link; others become text that shows the destination.
Tokens are summed over the steps, and the steps and searches are recorded.

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
   permissions: `net.fetch` to allowlisted `https` hosts with redirects refused, storage scoped to declared collections
   and access, and the notice surface. It holds no provider, secret, stage, or raw storage.

Every denial is a typed `PermissionDeniedError` plus a `permission_denied` metrics event.

Contract **1.1.0** (feature 005) adds, all optional: a `search` permission (which sources a tool may
use through `ctx.search`), `presentation` tools (data for the UI, no handler), `availability:
"all_conversations"` (at most one such capability), and prompt fragments tied to a search state
(`whenSearch`: available, off, no key, model cannot search), so the model is told only what is true.
`ctx.search.videos` fills in the learner's target language itself; a tool cannot choose it.

Two capabilities ship: `language-qa` (no tools, contract 1.0.0, unchanged) and `resource-curation`
(`search_videos`, `show_resources`). The pipeline calls the broker for every tool call.

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

- Entered by the user, validated with a minimal real request, then stored only if valid. Anthropic
  validates with a tiny generation; Gemini with a `GET` of the default model, which costs nothing.
- One key per provider, each with its own storage mode. A key that is recognizably another
  provider's is refused before it is sent anywhere. A Gemini key travels only in the
  `x-goog-api-key` header, never in a URL.
- On the web: encrypted with a non-extractable WebCrypto key in IndexedDB, or held in memory only
  for "this session only". The user chooses on first entry; there is no silent default.
- Never placed in model context, logs, telemetry, errors, or any Tarjuman service.
- Displayed only as a masked hint. Settings show it with the storage mode in effect.
- Replacing it validates the new key first and only then removes the old one; a rejected
  replacement keeps the old key. Deleting it keeps the profile and asks for a key again.
- "Delete all my data" (`DataController`, behind a confirmation step) removes every provider's key
  and checks each one is gone, then drops the whole IndexedDB database, Cache Storage, and service workers, and verifies
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
