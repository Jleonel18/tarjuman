# Data Model: Resource Curation

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Only new or changed entities. Everything else in `specs/001-core-foundation/data-model.md` and
`specs/004-gemini-provider/data-model.md` stands.

## Credential id (changed meaning)

004 keyed stored credentials by provider id. The key is now a **credential id**: a provider id
(`anthropic`, `gemini`, dev ids) or a search source id (`youtube`). Same record shape, same
encryption, same storage modes. No IndexedDB version change.

## KeyShape (changed)

| Pattern | Credential ids it is valid for | Mask prefix |
|---|---|---|
| `sk-ant-[A-Za-z0-9_-]{8,}` | `anthropic` | `sk-ant-` |
| `AIza[A-Za-z0-9_-]{35}` | `gemini`, `youtube` | `AIza` |
| `AQ\.[A-Za-z0-9_-]{30,}` | `gemini` | `AQ.` |

`wrong_provider` = the shape is known and the target id is not in its set. `expectedProviderId`
becomes the first id in the set (for the message). Unknown shapes are validated against the target.

## SearchSettings (new, `settings` collection, id `search`)

| Field | Type | Rule |
|---|---|---|
| `enabled` | boolean | Default `true`. When `false`, no search is made (FR-018). |
| `consent` | `{ sourceId: string; agreedAt: ISO date; termsVersion: string }[]` | A source is searched only if it has an entry. `termsVersion` is an app constant; bumping it asks again. |

Removed by "delete all my data".

## SearchRequest (new, transient)

| Field | Type | Rule |
|---|---|---|
| `query` | string | 1–120 characters after trimming; from the model's tool input. |
| `targetLanguage` | BCP 47 | From the profile, never from the model. |
| `kind` | `any` \| `music` | |
| `captionsOnly` | boolean | |
| `maxResults` | 1–10 | App constant 8. |

Never contains the key, history, or profile fields other than the target language (FR-004).

## SearchResult (new, transient, untrusted)

| Field | Type | Notes |
|---|---|---|
| `ref` | `r1`…`r10` | Turn-local id the model uses. |
| `sourceId` | `youtube` | |
| `externalId` | string | YouTube video id, `^[A-Za-z0-9_-]{11}$`. |
| `title` | string | Verbatim after entity decoding; max 200 characters. |
| `channel` | string | Verbatim; max 100 characters. |
| `descriptionExcerpt` | string | Max 200 characters; sent to the model, never shown on cards. |
| `durationSeconds` | number \| null | From `videos.list`. |
| `hasCaptions` | boolean \| null | |
| `audioLanguage` | BCP 47 \| null | `null` → card says "language not confirmed". |
| `type` | `video` \| `song` | `song` when the category is Music. |
| `priceLabel` | `free` \| `paid` \| `free_with_limits` \| `unknown` | YouTube videos: `free`. |
| `sponsored`, `affiliate` | boolean | `false` for YouTube search results (the API returns no ads). |
| `fetchedAt` | ISO date | |

Lives only for the turn, except as part of a ResourceCard.

## ResourceCard (new, stored with the assistant message)

What the learner sees. Built by the pipeline from a SearchResult plus the model's `show_resources`
item; the model never supplies title, link, or labels.

| Field | From |
|---|---|
| `sourceId`, `externalId`, `title`, `channel`, `durationSeconds`, `hasCaptions`, `audioLanguage`, `type`, `priceLabel`, `sponsored`, `affiliate`, `fetchedAt` | SearchResult |
| `link` | Built by the adapter from `externalId` (`https://www.youtube.com/watch?v=<id>`), no other parameters. |
| `fitNote` | Model; max 300 characters; rendered as plain text through the output guard (no links). |
| `difficulty` | Model; `easier` \| `about_right` \| `harder` \| `unknown`; labelled as an estimate. |
| `interest` | Model; must equal one of the profile interests or the request topic, else dropped. |

`Message` gains optional `resources: ResourceCard[]` (max 10) and `searchCount: number`.

Retention (FR-021): at app start, cards with `fetchedAt` older than 30 days have every source field
except `sourceId`, `externalId`, and `fetchedAt` removed and are marked `expired`. Opening an expired
card offers "refresh" (one `videos.list` call; success restores the fields with a new `fetchedAt`;
failure or a removed video keeps it expired).

## SavedResource (new collection `saved_resources`)

| Field | Type | Rule |
|---|---|---|
| `id` | string | `<sourceId>:<externalId>`; saving twice keeps one. |
| `card` | ResourceCard | Same labels as when found (US4-3). |
| `savedAt` | ISO date | |

Same 30-day rule as cards. Saved only by an explicit click (never by a tool). Removed by "delete all
my data". `Collection` gains `saved_resources`.

## UsageRecord (changed)

| Field | Change |
|---|---|
| `steps` | **new**, optional number: model calls in the turn. Token fields are the sum over steps. |
| `searches` | **new**, optional `{ sourceId: string; count: number }[]`. |

Cost estimate = sum of token costs of all steps; YouTube searches add no money cost and are shown
as "free daily allowance" (FR-017).

## Turn state (changed)

```
idle → model_step → (tool_calls → running_tools → model_step)* → final_step → done
```

Limits: 4 model steps, 2 `search_videos`, 1 `show_resources` per turn. Cancel at any point stops
further steps and searches; no retry.
