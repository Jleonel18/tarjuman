# Feature Specification: Gemini Provider

**Feature Branch**: `004-gemini-provider`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Add Google Gemini as a second product AI provider alongside Anthropic. Users can bring their own Gemini API key (BYOK), choose which provider (Anthropic or Gemini) the app uses, and the key is stored, validated, and used exactly like the Anthropic key today: encrypted locally, sent only to the selected provider's domain, never in model context/logs/errors. All model calls still go through the single pipeline and ProviderPort; guardrails, verdict line, cost display, and no-automatic-retry rules apply equally. The owner has a Gemini key in .env for live smoke tests and guardrail recording."

## Context

Tarjuman offers one product provider today: Anthropic. Which provider the app talks to is fixed
when the app is built, and the app keeps one key. Learners who already have a Google Gemini key, or
who cannot pay for Anthropic, have no way to use Tarjuman. The owner is one of them: they have a
Gemini key and no Anthropic key.

This feature adds Google Gemini as a second provider that learners choose themselves, with their
own key, under exactly the same rules as Anthropic. It changes no capability, guardrail, tone, or
pipeline behavior. It amends `001-core-foundation` FR-003 ("one provider (Anthropic)") for the
product. The constitution allows it: Anthropic is the *first* provider (Architecture constraints),
and Principle VI already speaks of "the user-selected AI provider".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use Tarjuman with my own Gemini key (Priority: P1)

As a learner, during onboarding I choose Gemini as my provider, paste my Gemini key, the app checks
it, and I start a conversation. Answers stream in, the chat shows token usage and an estimated cost,
and everything else (guardrails, refusals, tone, languages) behaves as it does with Anthropic.

**Why this priority**: it is the feature. Without it, no learner (including the owner) can use the
app with a Gemini key.

**Independent Test**: on a fresh profile, choose Gemini, enter a valid Gemini key, send one in-scope
message and one out-of-scope message. The first is answered with usage and cost shown; the second is
refused with the normal refusal message.

**Acceptance Scenarios**:

1. **Given** a fresh profile, **When** I open onboarding, **Then** I can choose between Anthropic and
   Gemini before entering a key, and the key field's help text and link match the provider I chose.
2. **Given** I chose Gemini and enter a valid key, **When** I confirm, **Then** the app validates it
   with a minimal request to Gemini, stores it in the storage mode I picked, and shows it only in
   masked form.
3. **Given** I chose Gemini and enter an invalid, revoked, or wrong-provider key (for example an
   Anthropic key), **When** I confirm, **Then** the app tells me the key was rejected, stores
   nothing, and does not retry.
4. **Given** a saved Gemini key, **When** I send a message, **Then** it passes through the same
   pipeline as with Anthropic (input guard, context assembly, model, output guard, verdict line,
   metrics) and the answer streams into the chat.
5. **Given** a Gemini request fails (rate limit or quota, server error, overload, network loss),
   **When** the failure occurs, **Then** I see the message for the matching existing error
   category, partial text already shown is kept and marked incomplete, and nothing is retried
   automatically. If instead Gemini's own safety filter blocks the request or the answer, I see the
   normal refusal (any text already shown is kept) and the message is stored as refused.
   (Amended during planning: plan.md, Spec Amendments 1–2.)
6. **Given** I am using Gemini, **When** I open the model settings, **Then** I see only Gemini models,
   each with its context window and price, and the reasoning-effort control appears only for models
   that support it.

---

### User Story 2 - Switch provider later (Priority: P2)

As a learner who already uses Tarjuman, I go to settings, switch from Anthropic to Gemini (or back),
enter or confirm the key for that provider, and keep using my existing conversations.

**Why this priority**: existing users (including anyone onboarded before this feature) need a way to
reach the new provider without deleting their data.

**Independent Test**: with a profile that has an Anthropic key and one conversation, switch to
Gemini in settings, enter a Gemini key, and send a new message in the old conversation; the answer
comes from Gemini and the earlier messages are kept.

**Acceptance Scenarios**:

1. **Given** a profile created before this feature, **When** the app starts, **Then** Anthropic is
   the active provider and the saved key keeps working with no action from me.
2. **Given** I switch provider in settings, **When** I have not yet entered a key for the new
   provider, **Then** I am asked for one and cannot send messages until it is validated.
3. **Given** I switched provider, **When** I continue an existing conversation, **Then** the next
   message goes to the new provider, earlier messages are kept, and the usage record of each answer
   says which provider and model produced it.
4. **Given** I switch provider, **Then** my selected model resets to the new provider's default and
   my effort setting is kept only if the new model supports it.
5. **Given** I have validated keys for both providers, **When** I switch provider, **Then** the app
   uses the stored key of the new provider without asking for it again, and the other key stays
   stored and untouched.
6. **Given** keys for both providers, **When** I delete or replace the key of one provider,
   **Then** the other provider's key is unchanged.

---

### User Story 3 - Owner runs live checks with a Gemini key (Priority: P3)

As the project owner, I run a live smoke test and the guardrail recorder and live runner against
Gemini using the key in my local environment file. No key, request header, or environment value is
ever printed or written, and every output says which model produced it and that it is not Claude.

**Why this priority**: it gives the project its first results from a hosted, production-grade
model and a real-wire check of the Gemini adapter. It is not needed for learners to use the feature.

**Independent Test**: run the smoke test and record fixtures for one rule file with the Gemini key;
confirm they complete, carry Gemini provenance and the "not Claude" label, and contain no secret.

**Acceptance Scenarios**:

1. **Given** a Gemini key in the local environment file, **When** I run the live smoke test,
   **Then** it streams one answer through the pipeline and prints only the result and usage.
2. **Given** I record guardrail fixtures with Gemini, **When** recording finishes, **Then** every
   fixture carries provider, model, date, and the label that results are not from Claude.
3. **Given** a live guardrail run with Gemini, **When** the report is written, **Then** its first
   lines say it does not satisfy `001-core-foundation` SC-003, which applies to Claude.
4. **Given** the key is missing or rejected, **When** I run either tool, **Then** it stops with an
   actionable message that does not include the key, and writes nothing partial.

---

### Edge Cases

- The learner pastes a Gemini key while Anthropic is selected (or the reverse): the app recognizes
  the key's shape and rejects it locally, before any request, with a message naming the provider
  the key belongs to. The key is sent nowhere. A key of unknown shape is validated against the
  selected provider only. (Amended during planning: plan.md, Spec Amendment 3.)
- The learner pastes a Gemini key into the chat: the input guard detects it the same way it detects
  Anthropic keys, and the message is not sent.
- Gemini blocks a prompt or an answer with its own safety filter: the user sees the normal refusal,
  never an empty answer or a partial one that looks complete; text already shown is kept and the
  message is stored as refused.
- Gemini answers without the first-line verdict: the existing fail-closed rule refuses it.
- Gemini reports usage differently (for example, reasoning tokens counted separately): the app shows
  what is reported and the cost estimate counts every billed token category; where a figure is not
  reported it shows "unavailable", never an invented number.
- The learner's key is on a free tier with very low rate limits: rate-limit errors are shown as such,
  with no retry, and the cost shown is labelled an estimate at published paid rates.
- A conversation's context exceeds the selected Gemini model's window: the request fails with the
  existing "too large" message instead of being silently truncated.
- The learner cancels a Gemini answer mid-stream: the request stops and the partial answer is kept
  and marked incomplete.
- "Delete all my data" with Gemini (or both providers) configured: every stored key is removed and
  the check that nothing remains covers them all.
- Session-only storage mode with Gemini: the key is gone after the session ends, as with Anthropic.

## Requirements *(mandatory)*

### Functional Requirements

**Provider choice**

- **FR-001**: The system MUST offer two product providers, Anthropic and Google Gemini, and let the
  learner choose which one is active, both during onboarding and later in settings. Onboarding
  MUST ask for an explicit choice; no provider is preselected for new profiles.
- **FR-002**: Profiles created before this feature MUST keep Anthropic as the active provider with
  their existing key, and need no migration step from the learner.
- **FR-003**: Only one provider MUST be active at a time. Every model call MUST go to the active
  provider only.
- **FR-004**: The system MUST store at most one key per provider, and keys for different providers
  MUST be kept side by side. Each key has its own storage mode, masked hint, and validation date, and
  can be replaced or deleted without affecting the other. Switching provider MUST NOT delete, move,
  or re-validate the other provider's key. (Clarified 2026-10-14: option A.)

**Key handling (same rules as `001-core-foundation`)**

- **FR-005**: A Gemini key MUST be validated with a minimal live request before it is stored; an
  invalid key MUST NOT be stored, and validation MUST NOT be retried automatically.
- **FR-006**: A Gemini key MUST be stored with the same protection and the same storage-mode choice
  (persistent or session-only, no default) as the Anthropic key, displayed only in masked form
  (a recognizable prefix and the last four characters), and be replaceable and deletable.
- **FR-007**: A Gemini key MUST be sent only to Google's Gemini endpoint and an Anthropic key only to
  Anthropic's endpoint. A key MUST never be sent to the other provider.
- **FR-008**: A Gemini key MUST NOT be placed in a request address (where it could be kept in
  browser history, logs, or error reports); it travels only in a request header.
- **FR-009**: A Gemini key MUST NOT appear in model context, logs, errors, diagnostics, telemetry,
  fixtures, reports, or committed files.
- **FR-010**: The input guard MUST detect Gemini-style keys in user messages, as it does Anthropic
  keys, and block them from being sent.
- **FR-011**: The production network policy MUST allow the Gemini endpoint and nothing more; no
  other origin is added.

**Same pipeline, same behavior**

- **FR-012**: Every Gemini call MUST go through the existing pipeline and provider abstraction. There
  MUST be no second path to any provider, and the provider abstraction MUST NOT gain
  Gemini-specific features that a capability could depend on (Principle XI).
- **FR-013**: The Gemini provider MUST stream text incrementally, support cancellation, report a stop
  reason, report usage figures as Gemini reports them, and map every failure (invalid key, rate
  limit or quota, overload, too large, network) to the existing error categories. Gemini's "resource
  exhausted" answer does not say whether a rate or a quota ran out, so it maps to the rate-limit
  category. A safety block is reported as a refusal stop, not an error. (Amended during planning:
  plan.md, Spec Amendments 1–2.)
- **FR-014**: The Gemini provider MUST NOT retry automatically.
- **FR-015**: The Gemini provider MUST NOT add capability, tone, or guardrail behavior of its own.
  The verdict-line rule, output guard, safe rendering, and refusal templates apply unchanged.
- **FR-016**: The Gemini provider MUST pass the same provider contract test suite as the Anthropic
  adapter.

**Models and cost**

- **FR-017**: The Gemini model list MUST be explicit and maintained in the app (not discovered at
  run time), with each model's context window, output limit, effort support, and price per million
  tokens, plus the date the prices were checked.
- **FR-018**: The model and effort settings MUST show only the active provider's models; switching
  provider MUST reset the selected model to that provider's default.
- **FR-019**: Costs for Gemini MUST be estimated from the model table and labelled as estimates, the
  same way as for Anthropic. Every usage record MUST say which provider and model produced it.

**Learner-facing text and disclosure**

- **FR-020**: Onboarding and settings MUST explain, for the selected provider, where to get a key and
  that the key and messages are sent to that provider. For Gemini, the explanation MUST mention that
  Google's terms for free-tier keys may allow Google to use the content to improve its products.
- **FR-021**: All new user-facing strings MUST use the i18n catalogs (en and es), and new layout MUST
  use CSS logical properties and the existing design tokens.

**Owner tooling**

- **FR-022**: A live smoke test and the guardrail recorder and live runner MUST be able to run
  against Gemini with the key from the local environment file, loaded without passing through any
  agent or log, and MUST print results only.
- **FR-023**: Fixtures and reports produced with Gemini MUST carry provenance (provider, model,
  date) and the label that the model is not Claude. They MUST NOT be presented as evidence for
  `001-core-foundation` SC-003.

### Key Entities

- **Provider choice**: which provider is active for this profile. Attributes: provider identifier
  (Anthropic or Gemini). Defaults to Anthropic for existing profiles.
- **Stored credential**: an encrypted key with its provider identifier, masked hint, storage mode, and
  validation date. Already exists; this feature allows one per provider (FR-004), keyed by the
  provider identifier.
- **Gemini model entry**: a model offered for Gemini. Attributes: id, display name, context window,
  output limit, effort support and levels, input and output price, price check date.
- **Usage record**: already exists; gains (or starts using) the provider identifier next to the model.

## Threat Analysis

- **Key sent to the wrong provider**: a key typed for one provider is validated against the other.
  FR-007 binds each stored key to its provider; validation uses the selected provider only, so a
  wrong key fails at that provider and goes nowhere else.
- **Key in request addresses**: Gemini's interface accepts the key as a URL parameter, which ends up
  in history, proxies, and error reports. FR-008 forbids it.
- **Wider network surface**: adding an allowed origin widens where an injected script could send
  data. FR-011 limits it to the single Gemini endpoint; the strict script policy remains the main
  mitigation, as today.
- **Key in the chat**: a learner pastes a Gemini key into a message, which would put it into model
  context. FR-010 extends the existing detection.
- **Provider-side data use**: free-tier Gemini keys may let Google use content to improve its
  products. FR-020 discloses it; the app cannot prevent it.
- **Provider safety filters**: Gemini can block content on its side. This must surface as a refusal,
  never as an empty or partial answer that looks complete (Edge Cases, FR-013).
- **Untrusted output**: Gemini output is as untrusted as any model output and goes through the same
  output guard and renderer (FR-015).
- **Misleading evidence**: Gemini results are not Claude results. FR-023 keeps them out of
  `001-core-foundation` SC-003.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner with a Gemini key goes from a fresh profile to a streamed answer in under
  3 minutes without reading any documentation outside the app.
- **SC-002**: The provider contract suite passes for the Gemini provider with the same cases as for
  the Anthropic adapter.
- **SC-003**: The adversarial (red-team) suite and the recorded guardrail fixtures pass with Gemini
  selected, with no case weakened or removed.
- **SC-004**: In automated checks, zero requests carry a key to an origin other than its own
  provider's, and zero requests carry a key in the request address.
- **SC-005**: In automated checks, no log, error, fixture, report, or stored conversation contains a
  Gemini key.
- **SC-006**: 100% of profiles created before this feature keep working with Anthropic after the
  update, with no action from the learner.
- **SC-007**: "Delete all my data" leaves zero stored keys for any provider.
- **SC-008**: A live smoke run with the owner's Gemini key streams an answer, and 100% of fixtures
  and reports recorded with Gemini carry the model name and the "not Claude" label.

## Assumptions

- Gemini's interface can be called directly from the browser (cross-origin requests allowed) with
  the key in a header. This must be confirmed against live documentation and a live call during
  planning and recorded in `research.md`. If it is false, the feature needs a constitution review,
  because the gateway may not hold keys.
- Model ids, prices, context windows, effort support, and the free-tier data terms drift; they are
  read from live documentation during planning and recorded with a date, as for Anthropic.
- The learner's Gemini key may be free-tier or paid. The app does not detect which; it shows
  estimated cost at paid rates, labelled as an estimate.
- The tool-use path stays off for every provider, as in `001-core-foundation`.
- The owner's Gemini key lives in the git-ignored `.env` and is loaded only with `node --env-file`.
  No agent reads or prints it.
- This feature does not add more providers or a general provider marketplace; a third provider
  needs its own specification.
- The dev-only Ollama and mock providers keep their current build-time selection; this feature
  changes how the product chooses between Anthropic and Gemini only.
