# Validation: 002-free-dev-provider

Results of the quickstart run (T030). Items marked **pending** need Ollama running on the owner's
machine and have not been run.

## Offline (quickstart V1, T029)

Run on 2026-10-08, branch `002-local-model-guide`, Ollama client 0.32.1 installed but not running.

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm lint:css` | pass |
| `pnpm lint:arch` | pass (134 modules, 310 dependencies) |
| `pnpm test` | pass (33 files, 399 tests) |
| Secret sweep (SC-002): `sk-ant`, `x-api-key`, `authorization` in `packages/provider-ollama`, `packages/testing/fixtures`, `tests/support` | Only test assertions that no `Authorization` header is sent, a test that a leaked bearer string is not surfaced, doc comments, and the fake `sk-ant-mock-valid-key-0000` constant documented in `fixtures/README.md`. No real-looking key (`sk-ant-` + 20 or more characters) anywhere. |
| No import of `@tarjuman/core/adapter` under `packages/provider-ollama` | pass (no matches in `src`, `tests`, `package.json`) |

## Live (needs Ollama running)

| Step | Result |
|---|---|
| V2: `pnpm test:live:ollama` | **pending** |
| V3: chat in the app with `VITE_PROVIDER=ollama`, including stopping Ollama and seeing the `unreachable` diagnostic, and the production build excluding the provider | **pending** |
| V5: follow `docs/local-model.md` from scratch, record Ollama version and total time (target: under 30 minutes, SC-001) | **pending** |
