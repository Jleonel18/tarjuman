# Feature Specification: Free Dev Provider

**Feature Branch**: `002-free-dev-provider`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Free dev provider: a second provider adapter backed by a local Ollama model (OpenAI-compatible API), for development and testing only, not a product provider. It must go through the existing pipeline (no second path to the provider), document Ollama CORS setup, clearly label that results from a non-Claude model prove mechanics only and not SC-003 with Claude, and make tasks T079 (fixture recorder) and T080 (live guardrail runner) of 001-core-foundation runnable without an Anthropic key. The owner has no Anthropic key and will not buy one."

## Context

Feature `001-core-foundation` supports one provider (Anthropic) and every task that needs a live
model assumes a paid key: the fixture recorder (T079) and the live guardrail runner (T080). The
owner has no key and will not buy one, so these tasks, and any manual try-out of the chat against a
real model, are blocked. This feature removes that blocker with a development-only provider that
runs on the developer's own machine at no cost. It adds no product capability for learners:
Anthropic remains the only provider Tarjuman offers to its users.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chat with a free local model while developing (Priority: P1)

As the project owner, I run a local model on my machine, start the app in development mode, pick
the local provider, and have a real conversation. Messages travel through the same pipeline as with
Anthropic (input guard, context assembly, model, output guard, metrics), and answers stream into the
chat.

**Why this priority**: it is the whole point of the feature. Without it, no live-model work can
happen for the owner.

**Independent Test**: with a local model running and the app in development mode, send one message
in the chat and see a streamed answer, a token count, and a cost shown as "free / not applicable".

**Acceptance Scenarios**:

1. **Given** a local model is running and reachable, **When** I select the local provider in a
   development build and send a message, **Then** the answer streams into the chat through the
   normal pipeline and usage is recorded.
2. **Given** the local model is not running, **When** I try to start a conversation, **Then** I see
   the normal network error in the app and a diagnostic in the developer console that says the
   local runtime cannot be reached and points to the setup guide.
3. **Given** the local model rejects a request (model not installed, request too large), **When**
   the failure occurs, **Then** the user sees an error mapped to the same error categories used for
   Anthropic, and nothing is retried automatically.
4. **Given** a production build of the app, **When** I open provider selection, **Then** the local
   provider is not offered and the production security policy is unchanged.

---

### User Story 2 - Record and run guardrail fixtures without an Anthropic key (Priority: P1)

As the project owner, I run the fixture recorder (T079) and the live guardrail runner (T080)
against the local model. They use no Anthropic key, never write any secret to disk, and every
output states which model produced it and that the result proves mechanics only.

**Why this priority**: it unblocks Phase 4 of `001-core-foundation` (User Story 2) for real, so
verdict parsing, refusal handling, and the fixture pipeline can be exercised end to end.

**Independent Test**: run the recorder for one rule file and the live runner once; confirm that
fixtures and the report are produced, carry the model name and the "not Claude" label, and contain
no key or request headers.

**Acceptance Scenarios**:

1. **Given** a local model is running, **When** I run the recorder, **Then** fixtures are written
   with provenance metadata: provider, model name, date, and a label that they come from a non-Claude
   model.
2. **Given** I run the live guardrail runner against the local model, **When** it finishes, **Then**
   the report shows refusal and acceptance rates and states, in its first lines, that these rates do
   not satisfy SC-003, which applies to Claude.
3. **Given** fixtures recorded with the local model, **When** the per-PR fixture suite runs, **Then**
   it passes or fails on the mechanics (verdict parsing, refusal rendering) and never reports them as
   a Claude result.
4. **Given** the local model is unavailable, **When** I run either tool, **Then** it stops with an
   actionable message and writes nothing partial.

---

### User Story 3 - Set up the local model without guessing (Priority: P2)

As the project owner, I follow a short written guide that tells me which local runtime to install,
how to download a suitable model, and how to allow the browser app to reach it (the runtime must
accept requests from the app's origin).

**Why this priority**: the app cannot reach the local runtime from the browser until this is
configured, and the failure looks like a network error. A guide prevents wasted time.

**Independent Test**: follow the guide on a clean machine; a message sent from the app in
development mode receives an answer.

**Acceptance Scenarios**:

1. **Given** the guide, **When** I follow it from scratch, **Then** I reach a working conversation
   without additional research.
2. **Given** the runtime is running but does not allow the app's origin, **When** I send a message,
   **Then** the developer console diagnostic names "not running or origin not allowed" as the cause,
   and the guide explains how to tell the two apart and fix each.

---

### Edge Cases

- The model emits no usage figures, or different ones than Anthropic: the app shows what is
  reported, and shows "unavailable" where it is not. It never invents numbers.
- The local model has a small context window: context-window usage is shown against that model's
  window, and an oversized request fails with a clear message rather than silently truncating.
- A small local model ignores the first-line verdict instruction: the existing fail-closed behavior
  of the verdict parser applies, and tests record this as expected non-Claude behavior.
- The user selects a model name that is not installed locally: the failure names the model and
  explains how to install it.
- The local runtime streams malformed or truncated output: the stream ends with an error event, and
  partial text already shown is kept but marked incomplete.
- No API key exists for the local provider: the developer enters the documented placeholder, which
  is never sent to the runtime.
- Generation is slow on modest hardware: the user can cancel, and cancellation stops the request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a second provider, backed by a local open-weights model
  runtime, implementing the same provider abstraction as the Anthropic adapter, with no change to
  that abstraction.
- **FR-002**: Every model call through the local provider MUST pass through the same pipeline as
  every other provider. There MUST be no second path to any provider.
- **FR-003**: The local provider MUST be available only in development builds and in test and
  recording tools. It MUST NOT be offered, selectable, or reachable in production builds, and the
  production security policy (including allowed network destinations) MUST NOT be relaxed to
  accommodate it.
- **FR-004**: The local provider MUST map failures to the existing provider error categories, and MUST
  NOT retry automatically.
- **FR-005**: The local provider MUST stream text incrementally, report usage figures exactly as the
  runtime reports them, support cancellation, and report a stop reason.
- **FR-006**: Costs for the local provider MUST be shown as free or not applicable, never as an
  estimated Anthropic price. Where the model's limits are unknown, the app MUST say so.
- **FR-007**: The local provider MUST NOT require a real API key, and MUST NOT send any credential
  to the runtime. Because the existing onboarding asks for a key before the first conversation, the
  developer enters a documented, non-secret placeholder in that screen; the local provider ignores
  it. (Amended during planning: the original "MUST NOT request or display" would require changing
  the onboarding flow and the core key manager for a dev-only tool. See plan.md, Spec Amendments.)
- **FR-008**: The user's Anthropic key MUST NOT be sent to the local runtime, and nothing about the
  local provider MAY weaken the key-handling rules of `001-core-foundation`.
- **FR-009**: The fixture recorder (T079) and live guardrail runner (T080) MUST be able to run
  against the local provider with no Anthropic key and MUST NOT write any secret, key, or request
  header to disk, logs, or output.
- **FR-010**: Fixtures and reports produced with the local provider MUST carry provenance (provider,
  model name, date) and an explicit label that the model is not Claude and that the results prove
  mechanics only. Fixtures recorded with it MUST NOT be presented as satisfying SC-003.
- **FR-011**: The system MUST NOT treat results from the local provider as evidence for SC-003 (the
  refusal and acceptance rates required for Claude). The Anthropic-based check remains open until a
  live Claude run exists, and that gap MUST stay documented.
- **FR-012**: The project MUST include a written setup guide covering: installing the local runtime,
  downloading a recommended model, allowing the app's origin, and checking that it works.
- **FR-013**: When the local runtime cannot be reached or rejects a request, the user MUST see the
  existing error message for the matching error category. In addition, the developer MUST get a
  specific diagnostic that distinguishes "not running or origin not allowed", "model not installed",
  and other failures: in the developer console of development builds, and in the output of the
  recording and live-run tools. The setup guide MUST map each diagnostic to its fix. (Amended
  during planning: a per-provider UI message would need a new error category in the provider
  abstraction, which FR-001 forbids. In a browser, "not running" and "origin not allowed" are the
  same failure and cannot be told apart.)
- **FR-014**: The local provider's model list MUST be explicit and maintained in the app (not
  discovered from remote sources), and MUST state each model's context window and output limit or
  mark them unknown.
- **FR-015**: User-facing strings added by this feature MUST use the i18n catalogs and CSS logical
  properties, consistent with `001-core-foundation`.
- **FR-016**: The provider contract test suite used for the Anthropic adapter MUST also pass for the
  local provider, so both are interchangeable behind the abstraction.
- **FR-017**: The local provider MUST NOT add any capability, tone, or guardrail behavior of its own;
  it only carries prompt layers and messages to the model and returns its output.

### Key Entities

- **Local provider**: a development-only provider. Attributes: identifier, base address of the
  runtime, list of locally installed model names it can use. It holds no secret.
- **Local model entry**: a model the local provider can use. Attributes: name, display name, context
  window (or unknown), maximum output (or unknown), pricing (always none).
- **Fixture provenance**: metadata attached to every recorded fixture and live-run report. Attributes:
  provider, model name, date, and the "not Claude, mechanics only" label.

## Threat Analysis

- **Key leakage**: the recorder and live runner run without any secret; they MUST NOT print request
  headers or environment values. The local provider receives no user secret.
- **Production exposure**: if the local provider were reachable in production, the app would be able
  to talk to arbitrary local addresses. FR-003 forbids it and keeps the production policy unchanged.
- **Misleading evidence**: a small non-Claude model could pass or fail guardrail cases for reasons
  unrelated to Claude. FR-010 and FR-011 prevent those results being used as proof for Claude.
- **Untrusted model output**: output from the local model is as untrusted as any model output and
  goes through the same output guard and renderer.
- **Local network reach**: the runtime address is configured by the developer; it is only used in
  development builds and tools, and only for the model request.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a local model installed, the owner can go from a clean checkout to a streamed
  answer in the chat in under 30 minutes, using only the written guide.
- **SC-002**: The fixture recorder and live guardrail runner complete a full run with zero
  Anthropic keys present, and no output or file produced by them contains any secret.
- **SC-003**: 100% of fixtures and live reports produced with the local provider carry the model
  name and the "not Claude, mechanics only" label.
- **SC-004**: The provider contract suite passes for the local provider with the same test cases as
  for the Anthropic adapter.
- **SC-005**: A production build exposes zero ways to select or reach the local provider, verified by
  an automated check.
- **SC-006**: In 100% of the unreachable-runtime scenarios covered (not running or origin not
  allowed, model missing), the developer gets a specific diagnostic that the setup guide maps to a
  fix.
- **SC-007**: Phase 4 of `001-core-foundation` can be completed, including T079 and T080, without
  buying or requesting an Anthropic key.

## Assumptions

- The owner's machine can run a small open-weights model locally; the guide recommends a model sized
  for modest hardware.
- The recommended local runtime is Ollama, which exposes an OpenAI-compatible interface. Its origin
  allow-list is configured by an environment setting on the owner's machine.
- Conversations are in English and Spanish for development purposes; small local models may handle
  other languages poorly, which is acceptable for mechanics testing.
- The local provider is for development only and is not a product commitment; any future decision to
  offer free or local models to learners needs its own specification and a constitution review
  (Principle VI and the "First provider" constraint).
- Anthropic remains the only product provider. The statement in `001-core-foundation` (FR-003: one
  provider) holds for the product and is not amended by this feature.
- `001-core-foundation` tasks T079 and T080 are edited, not replaced, to accept the local provider.
  That edit is part of this feature's plan, not of this specification.
- Tool use is not needed: `001-core-foundation` sends no tools to the model.
