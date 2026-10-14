# Adding a capability

A capability is how Tarjuman learns to do something new, for example answering questions about
the language being learned, which is what `language-qa` does. A capability is a plain object that
**declares** what it adds. It does not run its own code inside the pipeline, it never receives the
provider or the user's key, and adding one requires no change to `packages/core`.

This guide walks through the test-only dummy capability in
[tests/fixtures/dummy-capability.ts](../tests/fixtures/dummy-capability.ts), which exists to prove
exactly that (SC-008). The contract is
[specs/001-core-foundation/contracts/capability-contract.md](../specs/001-core-foundation/contracts/capability-contract.md).

## 1. The declaration

```ts
import type { Capability, ToolDeclaration } from "@tarjuman/core";

const NOTICE_PERMISSION = { kind: "ui", surface: "notice" } as const;

export const dummyTool: ToolDeclaration = {
  name: "show_notice",
  description: { en: "Shows the learner a short notice." },
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
  requiredPermissions: [{ ...NOTICE_PERMISSION }],
  sideEffecting: true,
  handler: async () => ({ ok: true, output: { shown: true } }),
};

export const dummyCapability: Capability = {
  id: "dummy",
  version: "1.0.0",
  contractVersion: "1.0.0",
  tools: [dummyTool],
  permissions: [{ ...NOTICE_PERMISSION }],
  domainRules: [
    {
      id: "scope.dummy",
      version: "1.0.0",
      description: "Only helps the learner with vocabulary and short notices about it.",
      refusalTemplateKey: "refusal.out_of_scope",
      acceptCases: [{ input: "Remind me that ser means to be", locale: "en" }],
      refuseCases: [{ input: "Write me a web server", locale: "en" }],
    },
  ],
  promptFragments: { intro: { layer: "capability", text: { en: "You may show short vocabulary notices." } } },
  i18n: { en: { "capability.dummy.title": "Dummy" } },
};
```

Field by field:

| Field | What it is | Rules the registry enforces |
|-------|------------|-----------------------------|
| `id` | Unique name | kebab-case; no other capability may use it |
| `version` | Your capability's version | semver |
| `contractVersion` | The contract you were written against | exactly `"1.0.0"` |
| `promptFragments` | Instructions added to the model's prompt | `layer` must be `"capability"`. The security and domain-scope layers sit above it and cannot be touched |
| `domainRules` | What is in and out of scope | each rule needs at least one accept case and one refuse case; rule ids are unique across all capabilities |
| `i18n` | Interface strings, by locale | every key starts with `capability.<id>.` |
| `permissions` | Everything any of your tools may do | `network` (an allowlist of hosts), `storage` (collections and `read` or `write`), or `ui` (`notice`) |
| `tools` | Functions the model could ask to run | `inputSchema` sets `additionalProperties: false`; `requiredPermissions` is a subset of `permissions`; names are unique |

The prompt fragments are English instructions to the model. The language of the answer comes from
the learner's mediation language, not from your fragments.

## 2. Register it

The registry validates the declaration with Zod and keeps a frozen copy. An invalid declaration
throws a `CapabilityRegistrationError` that lists every problem.

```ts
import { CapabilityRegistry } from "@tarjuman/core";

const registry = new CapabilityRegistry();
registry.register(languageQa);
registry.register(dummyCapability);
```

In the app this happens in
[apps/web/src/composition-root.ts](../apps/web/src/composition-root.ts), which is also where the
capability's strings are added to the interface catalogs with `registerCatalog`. A real capability
lives in its own workspace package under `packages/capabilities/<name>`, like
[language-qa](../packages/capabilities/language-qa/src/index.ts), and the web app depends on it.

That is the whole change. `packages/core` does not import capabilities, and a dependency-cruiser
rule fails `pnpm lint:arch` if it ever does.

## 3. What every turn does with it

A conversation names its capability. Each turn runs through the same fixed pipeline as every
other capability: input guard, context assembly, model call, output guard, metrics. Your rules
join the core's in the domain-scope layer, your fragments form the capability layer, and the
learner's tone stays a separate layer below yours. You cannot reorder, skip, or replace a stage:
`Pipeline` and `CapabilityRegistry` are frozen and expose no API for it.

[tests/architecture/dummy-capability.test.ts](../tests/architecture/dummy-capability.test.ts) runs
a full turn of the dummy capability next to `language-qa`, with guardrails, a non-default tone,
and metrics active.

## 4. Tools and permissions

Every tool call goes through `OutputGuard.checkToolCall` in this order:

1. **Permission broker.** A tool the capability did not declare is denied, even if the learner
   confirmed it.
2. **Taint gate.** A tool with `sideEffecting: true`, in a turn that contains pasted or external
   content, waits for the learner to confirm. Text the model may have been steered by cannot act
   on its own.
3. **Run.** The handler receives a frozen `ToolContext` built from that tool's own
   `requiredPermissions`, not from everything the capability declared:
   - `ctx.net.fetch(url)`: `https` only, to a host in the allowlist.
   - `ctx.storage.get` / `put`: only the declared collections, only with the declared access.
   - `ctx.ui.notice(key)`: only with the `ui` notice permission.

Anything else throws a `PermissionDeniedError` inside the handler and emits a `permission_denied`
metrics event. The handler's result then becomes `{ ok: false, error: "permission_denied" }`. The
context never holds the provider, the key, a pipeline stage, or raw storage.

**Current limit:** no provider is asked for tools in this feature, so the pipeline never calls a
tool yet. The broker and the checks are built and tested so a future tool-call path has one place
to go through.

## 5. Guardrail rules for a shipped capability

The dummy keeps its rule inline. A shipped capability keeps each rule as a JSON file under
`packages/capabilities/<name>/rules/` and loads it with `loadRules`, like `language-qa`. The rule
files are validated against
[contracts/domain-rule.schema.json](../specs/001-core-foundation/contracts/domain-rule.schema.json).

- Changing a rule file needs a `version` bump. `pnpm lint:rules` compares it with the base branch.
- The rule and fragment text are part of what the guardrail fixtures were recorded against.
  Changing them makes `pnpm lint:rules` fail until `pnpm record:guardrails` runs again
  (see [docs/local-model.md](local-model.md)).
- The rule directories are listed in `tests/support/guardrail-setup.ts` and
  `scripts/check-rule-versions.ts`. Add yours to both so its cases join the guardrail suite.

## 6. What the app does not have yet

The web app always opens conversations with `language-qa`; there is no screen to choose a
capability. A second shipped capability would need that screen, which is outside this feature.

## Checklist

- [ ] The declaration passes `registry.register` (unit test it, like
  [registry.test.ts](../packages/core/tests/capabilities/registry.test.ts)).
- [ ] Every rule has accept and refuse cases that you would defend.
- [ ] Every tool declares only the permissions it needs, and every side-effecting tool sets
  `sideEffecting: true`.
- [ ] Strings exist in `en` and `es` under `capability.<id>.`.
- [ ] `pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm lint:rules && pnpm test` pass, with
  no change under `packages/core`.
