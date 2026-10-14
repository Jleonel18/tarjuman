# Contract: `resource-curation` Capability

Package `@tarjuman/capability-resource-curation` (`packages/capabilities/resource-curation`).
Contract 1.1.0, `availability: "all_conversations"`.

## Permissions

`[{ kind: "search", sources: ["youtube"] }]`. No network, storage, or UI permissions.

## Tools

| Tool | Input (strict) | Side effects | Behavior |
|---|---|---|---|
| `search_videos` | `query` (1–120 chars), `kind` (`any`\|`music`), `captionsOnly?` | none | `ctx.search.videos`; returns `{ results: [{ ref, title, channel, descriptionExcerpt, durationSeconds, hasCaptions, audioLanguage, type }] }` or `{ error: code }`. |
| `show_resources` | `items` (1–10): `id` (`r\d+`), `fitNote` (1–300), `difficulty`, `interest?` | none | `presentation: "resources"`. |

## Prompt fragment (capability layer, en + es)

States: when the learner asks for material in the target language, search with short queries in
the target language built from the request or, without a topic, from the profile interests; at most
two searches; then call `show_resources` with the results that fit, keeping their order; write a
short reply that does not restate titles or write links (cards show them); never invent resources;
quote at most two lines of lyrics; if search is unavailable, say so and why, and do not suggest
specific videos from memory. When tools are not offered, the fragment variant says search is
unavailable (reason code supplied by the app: off, no consent, no key, model without tools).

## Domain rules (versioned, with accept/refuse cases)

- `curation.resource-requests@1.0.0`: accept requests for target-language material on any topic;
  refuse requests for downloads, pirated copies, full lyrics, or non-language-learning searches
  ("cheap flights"). Clarify when no topic is given and the profile has no interests.

## UI (packages/ui)

- `ResourceCards`: list of cards (title, "YouTube · channel", type, duration, captions, language,
  price label, sponsored/affiliate labels when true, difficulty "(estimate)", fit note, "Open on
  YouTube" link with `target="_blank" rel="noopener noreferrer"`, Save button). No images.
  Logical properties; titles in any script with `dir="auto"`.
- `SearchConsentDialog` (FR-018): what is sent, YouTube Terms and Google Privacy Policy links, the
  in-app privacy statement, Agree / Cancel.
- Settings → "Internet search": on/off, YouTube key (entry, masked hint, replace, remove, help on
  creating a Google Cloud key with YouTube Data API v3 enabled and a referrer restriction).
- "Saved resources" screen: list, remove, expired state with Refresh.
- Message footer: "Searches: n (YouTube, free daily allowance)" next to tokens and cost.
- All strings in `capability.resource-curation.*` and app catalogs (en, es).
