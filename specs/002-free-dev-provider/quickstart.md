# Quickstart: Free Dev Provider

Validation guide for this feature. The step-by-step setup for developers lives in
`docs/local-model.md` (a deliverable of this feature, FR-012); this file only lists how to prove the
feature works.

## Prerequisites

- Node 22 or 24, pnpm, `pnpm install` done.
- Ollama installed and running (`ollama --version` prints a version).
- Model pulled: `ollama pull gemma3:4b` (or `gemma3:1b` on weak hardware).
- Context length set to 32 768 (`OLLAMA_CONTEXT_LENGTH`, see the guide).
- **No Anthropic key anywhere.** `.env` may be absent.

## V1. Offline checks (no Ollama needed; run in CI)

```bash
pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm test
```

Expected:
- The provider contract suite passes for `ollama` (SC-004).
- dependency-cruiser passes with the new rules; a deliberate import of `@tarjuman/core/adapter`
  from `packages/provider-ollama` fails `lint:arch`.
- The production-build test passes: no Ollama adapter code or `localhost:11434` in the production
  bundle even with `VITE_PROVIDER=ollama` (SC-005).

## V2. Live smoke test (Ollama running)

```bash
pnpm test:live:ollama
```

Expected: one short streamed answer, a `usage` event with non-zero counts, a clean `stop`. With
Ollama stopped: the test skips and prints the `unreachable` diagnostic.

## V3. Chat in the app (US1)

```bash
VITE_PROVIDER=ollama pnpm --filter @tarjuman/web dev
```

1. Complete onboarding; on the key screen enter `ollama` (placeholder, never sent).
2. Ask "What is the difference between ser and estar?".
3. Expected: the answer streams; token counts appear; cost shows as zero.
4. Stop Ollama and send another message: the app shows the normal network error; the developer
   console shows the `unreachable` diagnostic pointing to the guide (SC-006).
5. `pnpm --filter @tarjuman/web build && pnpm --filter @tarjuman/web preview`: the provider is not
   available (production build uses Anthropic only).

## V4. Tools without a key (US2, after 001 T079/T080 exist)

```bash
pnpm record:guardrails      # TARJUMAN_PROVIDER defaults to ollama
pnpm test:live:guardrails
```

Expected:
- `packages/testing/fixtures/guardrails/provenance.json` names `ollama`, the model, the Ollama
  version, and `isClaude: false`.
- The live report's first line is the non-Claude label; it ends with "001 SC-003: unverified".
- `grep -r "sk-ant" packages/testing/fixtures` finds nothing (SC-002).

V4 is validated when Phase 4 of 001 implements T079/T080; this feature delivers the selector and
provenance they use.

## V5. Setup guide (US3)

Follow `docs/local-model.md` on a machine without Ollama and time it: under 30 minutes to a
streamed answer (SC-001).
