# Architecture

How Tarjuman is put together and which rules keep it that way. This document describes the
**target design** from [specs/001-core-foundation/plan.md](specs/001-core-foundation/plan.md) and
marks what is built today. The authoritative sources are the
[constitution](.specify/memory/constitution.md) (principles) and the feature specs (requirements);
if this file disagrees with them, they win.

**Implementation status:** monorepo, tooling, CI, and boundary rules exist (Phase 1). Every
package under `packages/` is an empty stub. Sections below describe what each will contain.

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
| `storage-web` | Implements `StoragePort` and `CredentialStore` | `core`, `idb` |
| `capabilities/language-qa` | First capability, pure data | `core` types |
| `ui` | React components, i18next catalogs, logical CSS | `core`, React, i18next |
| `testing` | Mock provider, fixtures, runners | `core` |
| `apps/web` | Wires adapters, capabilities, UI, and pipeline together | everything |

These rules are **enforced mechanically**, not by convention:

- `packages/core` imports no capability, adapter, UI, app, React, SDK, or Node/DOM built-in.
- Only `provider-anthropic` imports `@anthropic-ai/sdk`.
- A concrete provider is instantiated only in `apps/web/src/composition-root.ts`.
- Capabilities cannot import pipeline internals.
- Only adapters may unseal a secret (`SecretHandle`).
- Circular dependencies are errors.

Enforcement lives in [.dependency-cruiser.cjs](.dependency-cruiser.cjs) (authoritative) and
[eslint.config.js](eslint.config.js) (fast feedback in the editor). Run `pnpm lint:arch`.

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

The stage order is a fixed tuple in code and is neither exported nor injectable. Only the
pipeline module (the `Pipeline` class and `CredentialValidator`) can reach a `ProviderPort`;
capabilities never receive one.

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
The registry validates it; a permission broker denies anything not declared. Adding one must not
require touching `core`. A test-only dummy capability proves this.

Only `language-qa` ships now. It declares no tools.

## 7. Languages

The data model always keeps three separate settings:

- **UI language**: interface text (English and Spanish today)
- **Mediation language**: the language explanations are written in
- **Target language**: the language being learned

All user-facing strings come from translation catalogs. CSS uses logical properties only, so
right-to-left layouts mirror correctly. No RTL UI language ships yet; RTL is verified with a
pseudo-RTL test locale and with Arabic/Hebrew content.

## 8. Handling the API key

- Entered by the user, validated with a minimal real request, then stored only if valid.
- On the web: encrypted with a non-extractable WebCrypto key in IndexedDB, or held in memory only
  for "this session only". The user chooses on first entry; there is no silent default.
- Never placed in model context, logs, telemetry, errors, or any Tarjuman service.
- Displayed only as a masked hint.
- "Delete all my data" removes everything and verifies it.

An honest limit: a non-extractable key stops key material from being copied, but a compromised
script on the same origin could still *use* it. That is why the app ships a strict CSP and no
third-party scripts. See [SECURITY.md](SECURITY.md) and the threat analysis in the plan.

## 9. Testing strategy

| Layer | Tool | When | Cost |
|-------|------|------|------|
| Unit and integration | Vitest | every PR | free |
| Architecture rules | dependency-cruiser, ESLint | every PR | free |
| i18n and RTL checks | lint script, Playwright | every PR | free |
| Adversarial suite, structural | Vitest, mock provider | every PR, blocks merge | free |
| End to end | Playwright against the mock provider | every PR | free |
| Guardrail and adversarial, behavioral | Vitest against the real model | nightly / pre-release | uses a test key |

The per-PR gate relies on **structural** assertions (the assembled request never contains the key;
hostile output cannot render an image) because those do not depend on model behavior. Behavioral
rates against the real model are tracked separately. Every discovered bypass becomes a permanent
test case before its fix merges.

## 10. Where to read next

- Requirements: [specs/001-core-foundation/spec.md](specs/001-core-foundation/spec.md)
- Decisions and rationale: [specs/001-core-foundation/research.md](specs/001-core-foundation/research.md)
- Entities: [specs/001-core-foundation/data-model.md](specs/001-core-foundation/data-model.md)
- Interfaces: [specs/001-core-foundation/contracts/](specs/001-core-foundation/contracts/)
- Work breakdown: [specs/001-core-foundation/tasks.md](specs/001-core-foundation/tasks.md)
