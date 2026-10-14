# Contract: Capability, version 1.1.0 (amendment)

Amends `specs/001-core-foundation/contracts/capability-contract.md` (1.0.0). Every addition is
optional, so a 1.0.0 capability (`language-qa`) is still valid unchanged. Rationale:
[research.md](../research.md) R10. Principle II requires this amendment to be approved before any
capability depends on it.

```ts
type Permission =
  | …1.0.0…
  | { kind: "search"; sources: string[] };              // NEW: which search sources a tool may use

interface ToolContext {
  …1.0.0…
  readonly search: {                                  // NEW, brokered
    videos(req: { query: string; kind: "any" | "music"; captionsOnly?: boolean }): Promise<ToolSearchOutcome>;
  };
}

interface ToolDeclaration {
  …1.0.0…
  presentation?: "resources";                         // NEW: input becomes the `resources` event; no handler run
}

interface Capability {
  …1.0.0…
  contractVersion: "1.0.0" | "1.1.0";
  availability?: "own_conversations" | "all_conversations";   // NEW, default own_conversations
}
```

- `ctx.search.videos` is denied (typed error + metrics event) unless the tool declared
  `{ kind: "search", sources: ["youtube"] }`. The broker fills `targetLanguage` from the profile;
  the tool cannot set it. The result the tool sees has `ref`s and no key, no URLs.
- A `presentation` tool must have `sideEffecting: false` and needs no handler (registry rejects a
  presentation tool with permissions).
- `all_conversations` capabilities add their fragments, rules, and tools to every turn, below the
  conversation's own capability in the capability layer. At most one such capability per build in
  this feature (registry check), to keep prompts predictable.
- Registry validation matrix extended; "register with zero core diff" (001 SC-008) still holds for
  1.1.0 capabilities.

## Additions made while implementing (need owner approval)

- `PromptFragment.whenSearch?: ("available" | "off" | "no_key" | "model_cannot_search")[]`. A
  fragment is included only when the turn's search state is listed (absent: always; no state given:
  state-bound fragments are left out). This is how "the fragment tells the model why search is
  unavailable" (provider-tool-calls.md) is expressed as data instead of code in the core.
- `CapabilityRegistry` takes `{ searchSources }` (default `["youtube"]`) so a `search` permission
  can only name known sources, and gains `forTurn(conversationCapabilityId)`.
- A 1.0.0 capability that uses a 1.1.0 feature (availability, a search permission, a presentation
  tool) is rejected, so the version means something.
- `ToolDeclaration.handler` is optional (required unless the tool is a presentation tool).

