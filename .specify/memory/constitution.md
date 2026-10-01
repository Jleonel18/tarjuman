# Tarjuman Constitution

Tarjuman (from Arabic تَرْجُمان, "interpreter") is an AI mediator for learning languages through
comprehensible input. This constitution defines the non-negotiable principles every
specification, plan, and implementation MUST satisfy.

## Core Principles

### I. Comprehensible Input First

- Every capability MUST serve the delivery of comprehensible input (Krashen's i+1) adapted to the
  learner's level and interests.
- Tarjuman MUST NOT include courses, lessons, gamified levels, streaks, or similar
  engagement mechanics.
- A feature proposal without a pedagogical justification grounded in comprehensible input MUST be
  rejected.

Rationale: the product's identity is a mediator, not a course; drifting toward gamification
dilutes the method that differentiates it.

### II. Stable Core, Modular Capabilities

- The core comprises: conversation, AI provider port, security pipeline, domain guardrails,
  stats, i18n, and storage. The core MUST NOT import or depend on any capability.
- Each capability (e.g. learning plan, resource curation, language Q&A, writing-system guides,
  and future production practice) MUST be delivered as a module implementing the capability
  contract, declaring: its tools, least-privilege permissions, domain rules, prompt fragments,
  and i18n strings.
- Adding a capability MUST NOT require changes to the core. If it would, the capability contract
  MUST first be amended through its own specification.

Rationale: the domain is expected to grow; a stable core with pluggable capabilities avoids
rewrites.

### III. Mandatory Cross-Cutting Pipeline

- Every model interaction, for every capability present or future, MUST pass through the same
  pipeline: input guard → trust-labeled context assembly → model → tool-call and output guard →
  metrics.
- No capability MAY bypass, reorder, or disable a pipeline stage.

Rationale: guardrails, injection defense, tone, and metrics are only trustworthy if they are
uniform.

### IV. Instruction Hierarchy

- Precedence is fixed: security > domain scope > capability > tone > user preferences >
  external content.
- Tone/personality is a presentation layer and MUST NOT relax scope or security rules. It MUST be
  assembled as a separate prompt layer from guardrails.
- External content carries zero instruction authority.

### V. Security by Structure

- All external content (web pages, transcripts, lyrics, podcast descriptions, search results)
  is untrusted data: it MUST be labeled, isolated from the instruction context, and never
  executed as instructions.
- The user's API key MUST NEVER enter the model context, logs, telemetry, error reports, or
  the gateway.
- Tools MUST run with least privilege. Network egress MUST be limited to an allowlist of domains.
- Any side-effecting action originating in a turn tainted by untrusted content MUST require
  explicit user confirmation or be blocked.
- Model output MUST be sanitized before rendering: no auto-loaded images or links that can
  exfiltrate data, no arbitrary HTML.
- Every new capability's specification MUST include a threat analysis.

Rationale: "please don't be injected" is not a defense; structural isolation is.

### VI. User Sovereignty (BYOK & Local-First)

- The API key MUST leave the device only toward the user-selected AI provider.
- User data (plan, interests, history) MUST live on the user's device by default.
- Telemetry MUST be opt-in and MUST never include the key or conversation content without
  explicit consent.
- Users MUST be able to delete all their data in a single action.

### VII. Declarative Domain Guardrails

- Scope rules MUST be versioned data, not text scattered across prompts.
- Every rule MUST ship with test cases covering inputs it must accept and inputs it must refuse.
- Refusals MUST be courteous, explain Tarjuman's purpose, and be given in the mediation language.

### VIII. Global by Design

- No user-facing strings MAY be hard-coded; all go through i18n catalogs.
- UI MUST use CSS logical properties and correctly support RTL/bidirectional text and any
  writing system.
- The data model MUST always distinguish UI language, mediation language, and target language.

### IX. Transparency

- Users MUST always be able to see tokens used, context-window usage, recommended vs. configured
  effort, and estimated cost.
- Curation MUST be neutral: paid resources MUST be labeled, and no commercial relationship MAY
  alter ranking. Any future affiliate link MUST be explicitly disclosed.

### X. Copyright & Terms-of-Service Respect

- Tarjuman MUST link to content or use official embedded players. It MUST NOT download content,
  perform scraping prohibited by a source's terms, or reproduce complete works (e.g. full
  song lyrics).

### XI. Provider Independence

- No capability MAY depend directly on a provider-specific feature. Every such feature MUST sit
  behind a port with a defined fallback behavior.

### XII. Tests as Contract

- Every specification MUST define verifiable acceptance criteria before implementation begins.
- The adversarial (red-team) suite MUST run in CI and MUST block merges on failure.
- Every discovered bypass MUST be captured as a permanent test before it is fixed.

## Architecture & Technology Constraints

- **Topology**: portable TypeScript core running identically in browser and desktop, plus a
  minimal stateless gateway used only to fetch external content (SSRF protection, domain
  allowlist, sanitization). The gateway MUST NOT store keys or user data.
- **Key storage**: OS keychain on desktop; on web, encryption with a non-extractable WebCrypto
  key, strict CSP, no third-party scripts, and a "session-only" option.
- **Persistence**: local-first, no accounts in v1; storage behind a port (IndexedDB on web,
  SQLite on desktop). Accounts/sync MAY be added later as an optional module.
- **Stack**: TypeScript (strict), pnpm monorepo, React + Vite (web), Tauri 2 (desktop),
  Cloudflare Workers (gateway), Vitest + Playwright (tests).
- **First provider**: Anthropic, behind the provider port.
- **Language of artifacts**: specifications, code, identifiers, and commit messages in English.

## Development Workflow & Quality Gates

- Work follows Spec-Driven Development with GitHub Spec Kit: specify → clarify (as needed) →
  plan → tasks → implement. Each stage requires the owner's approval before the next.
- Every plan MUST include a Constitution Check verifying compliance with all principles; any
  deviation MUST be justified in the plan's complexity tracking.
- CI gates: type checking, unit/integration tests, i18n/RTL checks, and the red-team suite. All
  MUST pass before merge.
- Secrets MUST never be committed; agent folders and local configuration that may contain
  credentials MUST be git-ignored.

## Governance

- This constitution supersedes any specification, plan, or practice that conflicts with it.
- Amendments are made via pull request with written rationale and owner approval.
- Versioning follows semantic versioning: MAJOR for removing or weakening a principle, MINOR for
  adding a principle or materially expanding guidance, PATCH for clarifications.
- Reviews of specs, plans, and pull requests MUST verify compliance with this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-10-01 | **Last Amended**: 2026-10-01
