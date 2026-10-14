# Research: Resource Curation

**Feature**: [spec.md](spec.md) | **Date**: 2026-10-14

Phase 0 of the plan. R1–R5 led the owner to change FR-010 to option B (2026-10-14). R6 onward
resolve the design for option B.

## R1. Anthropic web search (server tool)

Source: platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool, read 2026-10-14.
Not verified live (no Anthropic key; see `001-core-foundation` research).

- Tool versions: `web_search_20250305` (basic), `web_search_20260209` (dynamic filtering through
  code execution, default `allowed_callers: ["code_execution_20260120"]`), `web_search_20260318`
  (adds `response_inclusion`). Basic search needs `allowed_callers: ["direct"]` on the newer versions.
- Parameters: `max_uses` (hard cap per request), `allowed_domains` **or** `blocked_domains`,
  `user_location`.
- Results arrive as `server_tool_use` (the query) and `web_search_tool_result` blocks with `url`,
  `title`, `page_age`, `encrypted_content`. Errors come inside a 200 response
  (`too_many_requests`, `max_uses_exceeded`, `unavailable`, …). Long turns may stop with
  `pause_turn`.
- Citations are always on (`url`, `title`, `cited_text` up to 150 characters). "When displaying API
  outputs directly to end users, citations must be included to the original source." Reprocessed
  output: "display citations as appropriate".
- Price: **$10 per 1,000 searches**, plus tokens; results count as input tokens on later turns.
  Usage reports `usage.server_tool_use.web_search_requests`. Failed searches are not billed.
- Enabled per organization by default; an admin can disable it (then a 400).
- Fit with Tarjuman: good. Result URLs and titles are structured data that Tarjuman can check links
  against (FR-013). Terms ask only for citations, which the resource cards are.

## R2. Gemini Grounding with Google Search

Sources: ai.google.dev/gemini-api/docs/google-search, /pricing, /terms, read 2026-10-14.

- Request: `tools: [{ googleSearch: {} }]` on `generateContent` / `streamGenerateContent`. All
  current models support it.
- Pricing: **free tier: "Not available"** for `gemini-3.8-flash` and `gemini-3.5-flash-lite` (only
  testable inside AI Studio). Paid tier: 5,000 free search requests per month shared across Gemini 3+
  models, then **$14 per 1,000**. Billed per search query the model decides to run.
- Terms (Grounding with Google Search section), quoted:
  - "You will only use Grounding with Google Search in an application that is owned and operated by
    you and will only display the Grounded Results with the associated Search Suggestion(s) to the
    end user who submitted the prompt."
  - You "will not modify, or intersperse any other content with, the Grounded Results or Search
    Suggestions" and "will not place any interstitial content between any Link or Search Suggestions
    and the associated destination page".
  - You will not "cache, frame, syndicate, resell, analyze, train on, or otherwise learn from
    Grounded Results or Search Suggestions" (storage for chat history up to two years is allowed).
- Search Suggestions are an HTML and CSS snippet (`searchEntryPoint.renderedContent`) that must be
  shown with the results.

## R3. Live check with the owner's Gemini key (2026-10-14)

Script in the session scratchpad, loaded with `node --env-file=.env`, printing structure only.

| Request | Model | Result |
|---|---|---|
| No tools | `gemini-3.5-flash-lite` | 200, streamed answer (key works) |
| `googleSearch` | `gemini-3.5-flash-lite` | **429 `RESOURCE_EXHAUSTED`** on the first call |
| `googleSearch` | `gemini-3.8-flash` | **429 `RESOURCE_EXHAUSTED`** on the first call |

Consistent with R2: the owner's key is on the free tier, where grounding is not available. Grounding
would need billing enabled on the key's Google Cloud project (paid tier). That would also change the
data terms in the learner's favor: paid-tier prompts are not used to improve Google products.

## R4. Constitution and project-rule conflicts found

1. **Gemini grounding vs Principle X (respect terms of service) and the curation design.** The spec
   (FR-005, FR-006, FR-013, FR-016) needs Tarjuman to rank, label, annotate, and remove links from
   what the model returns. Gemini's terms forbid modifying or interspersing content with Grounded
   Results and forbid analyzing them. Using Gemini search as the spec describes would break those
   terms; using it within the terms means showing Gemini's answer unchanged, which drops the
   guarantees in FR-006, FR-013, and FR-016.
2. **Search Suggestions vs the rendering rules.** The required HTML snippet cannot be shown without
   inserting third-party HTML (forbidden: no `innerHTML`, no auto-loaded remote resources, strict
   CSP). A sandboxed frame might work but adds a new origin and a frame to the CSP; not studied yet.
3. **"Owned and operated by you"** is unclear for a BYOK app where the learner brings the key. Not a
   blocker on its own, but it adds legal doubt.
4. **The owner cannot use option A today**: no Anthropic key, and the Gemini key is free tier.

None of these apply to Anthropic's web search.

## R5. Owner decision: option B (2026-10-14)

The clarified answer to FR-010 (option A, provider's own search) works well for Anthropic and badly
for Gemini. Options:

| Option | What it means | For the owner today |
|---|---|---|
| **A1. Anthropic search only** | Implement the search port with an Anthropic adapter. Gemini, Ollama, and mock get the "search unavailable" fallback. | Unusable (no Anthropic key). Testable only with mocks. |
| **A2. A1 + Gemini within its terms** | Also a Gemini adapter that shows Gemini's grounded answer unchanged, with Search Suggestions in an isolated frame; Tarjuman's ranking, labels, and link checks do not apply to it, and the UI says so. Needs a paid-tier key. | Usable after enabling billing (5,000 searches/month free, then $14/1,000; tokens become paid). Weaker guarantees. |
| **B. Dedicated search services** (revisits the Q1 answer) | The app calls search services itself, behind the same port: YouTube Data API for videos (free key, 100 searches/day per project), and podcast/music catalog searches where their terms allow. Results are structured, so Tarjuman ranks and labels them and the model only writes fit notes. A gateway may be needed for services without browser access. | Usable with a free Google Cloud key for YouTube. More work: one adapter per service, keys per service, possibly the gateway. |
| **A1 + B later** | Ship A1 now, add B in a later feature. | Nothing usable until B. |

Recommendation: **B, starting with YouTube only** (videos are the most important resource type for
comprehensible input), with Anthropic web search (A1) as a second adapter for the general web.
Reasons: it works for the owner with a free key, its terms allow showing structured results as cards,
it keeps every guarantee in the spec, and it does not depend on any AI provider's search (Principle
XI). Each additional service (songs, podcasts) is checked for its own terms before it is added.

**Decision (owner, 2026-10-14): B.** This feature ships YouTube only. Anthropic web search (A1) and
other sources are follow-ups, each with its own terms check; they are not built here.

## R6. YouTube Data API: access, keys, errors (live, 2026-10-14)

- **Browser access works.** A preflight from `http://localhost:4173` asking for `x-goog-api-key`
  returns `access-control-allow-origin` echoing the origin and allows the header. The key goes in
  the `x-goog-api-key` header, never `?key=` (same rule as Gemini, 004).
- **The owner's `AQ.` key is not accepted**: `401 UNAUTHENTICATED`, reason `CREDENTIALS_MISSING`.
  `AQ.` keys are Gemini-only auth keys. The learner needs a Google Cloud API key (`AIza…`, 39
  characters) with "YouTube Data API v3" enabled. The same `AIza` key can serve Gemini and YouTube if
  both APIs are enabled on its project.
- **Errors** (observed and documented): invalid key → `400`, reason `API_KEY_INVALID`; no key →
  `403`; API not enabled on the project → `403` `accessNotConfigured` / `SERVICE_DISABLED`; key
  restrictions (referrer) → `403`; daily allowance used up → `403` `quotaExceeded`. Only the HTTP
  status and the allow-listed `reason` strings are read; server messages are never shown or logged.
- **Quota** (developers.google.com/youtube/v3/determine_quota_cost, read 2026-10-14): a project
  gets **100 `search.list` calls per day** and 10,000 units per day for other methods (`videos.list`
  = 1 unit). No money is charged. Decision: at most **2 searches per turn** (cost and quota cap), one
  `videos.list` call per search for details.
- **Requests used**:
  - `search.list` with `part=snippet`, `type=video`, `maxResults` ≤ 10, `q`, `relevanceLanguage`
    (target language), `safeSearch=strict`, optional `videoCategoryId=10` (music) and
    `videoCaption=closedCaption`.
  - `videos.list` with `part=snippet,contentDetails` for the found ids: duration, caption flag,
    `defaultAudioLanguage`, category (music → type `song`). Used for fit and difficulty, and to
    refresh stored data after 30 days.
  - Validation: `videoCategories.list?part=id&regionCode=US` (1 unit, no search spent).
- **Titles and descriptions are HTML-escaped text** (`&#39;`, `&amp;`). They are decoded as text by
  a fixed entity table, never parsed as HTML.
- Not verified live yet (no `AIza` key with YouTube enabled): a real search response. Fixtures are
  synthetic, shaped after the documented response, and labelled so (as 004 did before its live run).

## R7. YouTube API Services terms (developers.google.com/youtube/terms/developer-policies, read 2026-10-14)

| Rule (quoted or summarized) | How Tarjuman complies |
|---|---|
| "must not modify or replace the text, images, information, or other content of, the search results" | Titles and channel names shown verbatim (after entity decoding). Tarjuman's fit note and labels are visibly separate. **Order kept as returned** (FR-006 amendment); Tarjuman only chooses which results to show. Omitting results is our reading of the rule, not an explicit permission; flagged in Complexity Tracking. |
| "must not merge or intermix results from sources other than YouTube and present them as YouTube search results" | Only one source in this feature; every card says "YouTube". |
| Pages showing YouTube content must show "YouTube Brand Features" | The text name "YouTube" on every card and in the notice. No logo (would need a bundled asset under the brand guidelines; not needed for text attribution). |
| Non-Authorized Data may be stored "not longer than 30 calendar days" | Cards and saved resources keep `fetchedAt`; after 30 days the data is purged at app start and refreshed on demand with `videos.list` (FR-021). The model's prose may mention a title; see R12 residual risk. |
| Users must agree to a privacy policy; show a link to YouTube's Terms of Service | First-search consent (FR-018) shows links to `https://www.youtube.com/t/terms` and `https://policies.google.com/privacy` and a short in-app privacy statement; searching needs "I agree". |
| Embedded player rules | No embedded player in this feature: links only (FR-008 allows either). No frame in the CSP. |

## R8. Tool calling: the path the pipeline never had

The model must decide when to search and with what terms, and must pick results by id. That is tool
calling. The core already has the stages (`PermissionBroker`, `checkTaint`, `OutputGuard.checkToolCall`)
but `ProviderPort` cannot carry a tool call or a tool result. Findings:

- **Gemini (live, 2026-10-14, `gemini-3.5-flash-lite`, free key):** `functionDeclarations` work on the
  free tier. The call arrives as a `functionCall` part with `id`, `name`, `args`, and a
  `thoughtSignature`. Sending the call back **without** the signature fails: `400 Function call is
  missing a thought_signature`. With it, the follow-up answer streams. The result goes back as a
  `functionResponse` part (`name`, `id`, `response` object).
- **The same live run shows why FR-013 matters:** given a fake result `{id: "r1", title: …}`, the
  model wrote a Markdown link `https://www.youtube.com/watch?v=r1`, an invented URL. Cards must be
  built from search data, never from model text.
- **Anthropic (docs, not live):** `tools: [{name, description, input_schema}]`; streamed
  `content_block_start` with `tool_use` (`id`, `name`) and `input_json_delta`; `stop_reason:
  "tool_use"`; results sent as a user `tool_result` block (`tool_use_id`, `content`). The adapter
  sends `output_config.effort` but no `thinking`, so no thinking blocks need to be echoed; if that
  changes, they become opaque continuation data like Gemini's signature.
- **Ollama and mock:** mock gets scripted tool calls. Ollama (dev only) is not given tools in this
  feature; resource requests there get the "search unavailable" fallback.

**Decision:** amend `ProviderPort` (core contract) minimally:
- `StreamEvent` gains `{ type: "tool_call"; id; name; input: JsonValue; continuation?: string }`.
  `continuation` is opaque adapter data (Gemini's `thoughtSignature`) that the pipeline passes back
  untouched within the turn and never stores, shows, or logs.
- `ProviderMessage` becomes a union: today's `{role, content}` plus
  `{ role: "assistant"; content; toolCalls: ToolCallRecord[] }` and
  `{ role: "tool"; toolCallId; name; content }` (content = a labeled untrusted block, R10).
- `ModelRequest.tools` is filled (it exists, "empty in this feature" until now).
- Type-level proof that no new field can carry a `SecretHandle` is extended.

Alternatives rejected: a pipeline-driven "search first, then ask the model" turn (needs a second
verdict protocol to know when to search, and cannot let the model refine terms); provider-side
search (R2, R4).

## R9. Where the search key lives and who may use it

- A new port `SearchPort` (core), next to `ProviderPort`: `id`, `validateCredential(secret)`,
  `search(request, secret, signal)`, `details(ids, secret, signal)`. Adapters: `@tarjuman/search-youtube`
  (product) and a scripted mock in `@tarjuman/testing`.
- Only the adapter unseals the key (dependency-cruiser "may unseal" list gains the package). Only a
  new core `SearchBroker` holds a `SearchPort`; capabilities never see the port or the key.
- The search key is stored by the existing `CredentialStore` under id `youtube`. 004 keyed records
  by provider id; the id space becomes "credential id" (any provider or search source). No schema
  change, no IndexedDB upgrade. `DataController.deleteAll` checks every offered credential id.
- **Key shapes:** `AIza…` is a Google Cloud key and is valid for both `gemini` and `youtube`. The
  KeyShape table changes from "pattern → one owner" to "pattern → set of credential ids"; a key is
  `wrong_provider` only when its shape is known and the target id is not in its set (`sk-ant-` for
  YouTube, `AQ.` for YouTube, `AIza` for Anthropic). The input guard already detects `AIza` in chat.

## R10. Turn loop and the capability contract (amendment 1.0.0 → 1.1.0)

- **Loop:** model step → zero or more `tool_call`s → for each: `OutputGuard.checkToolCall`
  (authorize, taint gate) → handler with a brokered `ToolContext` → result appended as a `tool`
  message → next step. Limits per turn: **4 model steps**, **2 `search_videos` calls**, **1
  `show_resources` call**. Exceeding a limit ends the loop: the tool gets an error result and the
  model must answer. No step is retried.
- **Verdict:** the verdict line is read from the **final** step's text. Text of earlier steps (if
  any) is not shown. While tools run, the UI shows "Searching YouTube…" (a `TurnEvent` status).
- **Consent:** tools are offered without consent; a search attempt without consent ends the turn as
  `consent_required` and the app asks, then re-sends the learner's message as a new turn. Offering
  no tools until consent was rejected: the app cannot know a message is a resource request before
  the model says so, so the dialog would never appear.
- **Taint:** after a search result enters the turn, the turn is tainted (segments with `untrusted`
  trust). `show_resources` and `search_videos` are not side-effecting, so they run; any
  side-effecting tool would need confirmation (none in this feature).
- **Tools of `resource-curation`:**
  - `search_videos({ query, kind: "any" | "music", captionsOnly?: boolean })` → result set with
    turn-wide ids `r1…r16` (numbering continues across the turn's searches; repeats of the same
    video are dropped), no URLs, descriptions cut to 200 characters, wrapped in an `untrusted_data`
    block.
  - `show_resources({ items: [{ id, fitNote, difficulty: "easier" | "about_right" | "harder" |
    "unknown", interest? }] })` → validated against the turn's result ids. The pipeline emits a
    `resources` `TurnEvent` built from **search data** (title, channel, link, duration, labels) plus
    the model's note and difficulty. Unknown ids are dropped. Order = source order (R7).
- **Contract 1.1.0 amendments** (capability contract, `001-core-foundation/contracts/capability-contract.md`):
  1. `Permission` gains `{ kind: "search"; sources: string[] }`.
  2. `ToolContext` gains `search: { videos(req): Promise<SearchOutcome> }`, brokered: denied unless
     the tool declared the source; the broker loads the key and calls `SearchBroker`.
  3. `ToolDeclaration` gains optional `presentation: "resources"`: a tool whose validated input is
     turned into the `resources` event instead of being executed for a result.
  4. `Capability` gains optional `availability: "own_conversations" | "all_conversations"`
     (default `own_conversations`). `resource-curation` is `all_conversations`, so its tools,
     fragments, and rules join every chat turn (FR-024: chat only, no separate screen).
  The 1.0.0 shape stays valid (all additions optional), so `language-qa` needs no change.
- **Principle II process:** the constitution says the contract is amended "first through its own
  specification". This plan puts the amendment in `contracts/capability-contract-1.1.md` for owner
  approval before any capability code (see plan.md, Spec Amendments). If the owner wants a separate
  spec, the amendment and R8 move to their own feature first.

## R11. Output guard: links in a curation turn

- In a turn that called `search_videos`, any link in the model's prose is rendered as plain text
  (destination shown, not clickable) unless its URL is exactly a link of a result in this turn.
  Cards carry the only clickable links (FR-013).
- Card links are built by the adapter as `https://www.youtube.com/watch?v=<id>` from a validated id
  (`^[A-Za-z0-9_-]{11}$`); no other parameter is ever added (FR-014). They open with
  `rel="noopener noreferrer"` and `target="_blank"`.
- Lyrics: no lyrics source exists in this feature; the model may quote from memory. The
  `resource-curation` prompt fragment and a domain rule limit quotes to two lines, and the
  adversarial suite checks it with the mock (FR-007). A full-lyrics request is refused (FR-020).

## R12. Residual risks (accepted, recorded)

- The model's prose may repeat a YouTube title, which then lives in conversation history past 30
  days. Mitigation: the fragment tells the model not to restate titles (the cards show them). Not
  enforceable by code; accepted.
- Omitting YouTube results (R7) is an interpretation of the terms, not an explicit permission.
- Difficulty is a model estimate from metadata (title, duration, captions, channel), not from the
  content.
- The search query is written by the model, so "no conversation history in search terms" (FR-004)
  cannot be fully enforced. Structural limits: 120 characters, key-shape check before sending, and
  the fragment's instruction; SC-005 is checked with scripted queries. Accepted.
- `relevanceLanguage` is a hint; YouTube may return videos in other languages. `videos.list`
  `defaultAudioLanguage` is used when present; otherwise the card says the language is unconfirmed.
