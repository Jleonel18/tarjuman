# Contract: Capability

How functionality is added without touching the core (FR-022 – FR-024, Principle II). Version
`1.0.0`. Amending this contract requires its own specification.

```ts
interface Capability {
  id: string;                                   // kebab-case, unique
  version: string;                              // semver
  contractVersion: "1.0.0";
  tools: ToolDeclaration[];
  permissions: Permission[];                    // everything a tool may do, declared up front
  domainRules: DomainRule[];                    // each with accept + refuse cases
  promptFragments: Record<string, PromptFragment>;  // capability layer only
  i18n: Record<Locale, Record<string, string>>;     // namespaced `capability.<id>.*`
}

interface PromptFragment {
  layer: "capability";                          // the only layer a capability may target; any other value is rejected
  text: LocalizedText;
}

interface ToolDeclaration {
  name: string;
  description: LocalizedText;
  inputSchema: JsonSchema;                      // strict, additionalProperties: false
  requiredPermissions: Permission[];            // subset of capability.permissions
  sideEffecting: boolean;                       // true ⇒ taint gate applies (FR-010)
  handler(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

type Permission =
  | { kind: "network"; allowedHosts: string[] }  // egress allowlist (Principle V)
  | { kind: "storage"; collections: Collection[]; access: "read" | "write" }
  | { kind: "ui"; surface: "notice" };
```

`ToolContext` exposes only brokered, least-privilege helpers (e.g. `ctx.net.fetch` checking the
allowlist). It does **not** expose the provider, the secret, stage objects, or raw storage.

## Registry behavior

- `registry.register(capability)` validates with Zod; rejects duplicate ids, rules without
  accept/refuse cases, tools naming undeclared permissions, fragments whose `layer` is anything
  other than `"capability"` (the layers above it are security and domain scope), and mismatched
  `contractVersion`.
- Registration requires **no code change in `core`** (verified by SC-008 test).
- `PermissionBroker` checks every tool invocation against declared permissions; denial yields a
  typed error and a metrics event (US8-2).
- The registry exposes read-only views; there is no API to reorder, skip, or replace pipeline
  stages (US8-3).

## In this feature

- `language-qa` — no tools (`tools: []`), no network, no storage permissions; contributes
  fragments for vocabulary/grammar/usage/pronunciation/culture-as-language explanations, its
  domain rules, and its strings. It exists to exercise guardrails, hierarchy, tone, and stats.
- `dummy` — test-only capability defined under `tests/`, with one side-effecting tool, used to
  prove SC-008, permission denial, and taint-gating.

## Test obligations

- Registry validation matrix; permission denial; dummy registration with zero core diff;
  dependency-cruiser rule that `core` imports no capability package.
