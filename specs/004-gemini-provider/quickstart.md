# Quickstart: Gemini Provider

How to check the feature end to end. Contracts: [gemini-provider](contracts/gemini-provider.md),
[multi-provider-core](contracts/multi-provider-core.md).

## Prerequisites

- `pnpm install`
- For live checks only: `GEMINI_API_KEY` in the git-ignored `.env` (an `AIza…` or `AQ.…` key from
  Google AI Studio). Never print it; tools load it with `node --env-file=.env`.

## V1. Automated checks (no key, no network)

```bash
pnpm typecheck && pnpm lint && pnpm lint:css && pnpm lint:arch && pnpm lint:i18n && pnpm test
pnpm test:redteam
pnpm test:e2e
```

Expected: all green. Among them:

- Gemini adapter: contract suite, request shape, error and finish-reason tables (SC-002).
- Pipeline: `stop: refusal` after partial text stores `refused`; unknown provider id → `bad_request`.
- Credential store: two providers side by side; removing one leaves the other; IndexedDB v1 →
  v2 upgrade keeps an existing Anthropic key (SC-006); `deleteAll` leaves no key (SC-007).
- `KeyManager`: a Gemini-shaped key entered for Anthropic (and the reverse) → `wrong_provider`,
  and the stubbed validator is never called (SC-004).
- Red-team: `AIza…` and `AQ.…` keys in chat are withheld (FR-010).
- CSP: `connect-src` is `'self'`, the Anthropic origin, the Gemini origin, and nothing else.
- e2e (mock providers): choose a provider in onboarding; switch in settings with and without a
  stored key for the other provider; delete all data.

## V2. Learner flow with a real Gemini key (manual, SC-001)

1. `pnpm --filter @tarjuman/web build && pnpm --filter @tarjuman/web preview`, open the app in a
   fresh browser profile.
2. Onboarding: choose **Gemini**, paste your key, choose a storage mode, save. Expected: "Key saved:
   AQ.…xxxx" (or `AIza…xxxx`), and the Gemini disclosure text was visible.
3. Ask an in-scope question in the target language. Expected: a streamed answer, tokens and an
   estimated cost under the message.
4. Ask something out of scope (for example, to write code). Expected: the normal refusal.
5. In the browser's network panel: every request with your key goes to
   `generativelanguage.googleapis.com`, the key is only in the `x-goog-api-key` header, and no URL
   contains `key=`.

Time from step 2 to the first answer: target under 3 minutes.

## V3. Switching provider (manual)

1. In settings, switch to Anthropic. Expected: asked for an Anthropic key; messages cannot be sent
   until one is validated. The Gemini key is still listed as stored.
2. Paste the Gemini key into the Anthropic field. Expected: "This looks like a Gemini key…", and
   the network panel shows no request.
3. Switch back to Gemini. Expected: no key prompt; the old conversation continues and the new
   answer's usage says Gemini.

## V4. Existing profile keeps working (SC-006)

Covered by the IndexedDB upgrade test in V1. Manual variant: on `main`, onboard with the mock
provider; switch to this branch's build; reload. Expected: no onboarding, the key is still in use,
the active provider is the first one.

## V5. Owner live smoke test (SC-008)

```bash
pnpm test:live:gemini
```

Expected: one validation call and one short streamed answer on `gemini-3.5-flash-lite`; the output
shows only the answer text, usage, and stop reason. A 429 or 503 is reported as such, not retried.

Recording guardrail fixtures with Gemini:

```bash
TARJUMAN_PROVIDER=gemini node --env-file=.env --import tsx scripts/record-guardrails.ts
```

Expected: every fixture carries `providerId: gemini`, the model id, the date, and the "not Claude"
label. These fixtures are not 001 SC-003 evidence. Recording replaces the current (Ollama)
fixtures, so do it only when you want Gemini to be the recorded reference.
