# Quickstart: Resource Curation

How to check the feature end to end. Contracts: [provider-tool-calls](contracts/provider-tool-calls.md),
[search-port](contracts/search-port.md), [capability-contract-1.1](contracts/capability-contract-1.1.md),
[resource-curation-capability](contracts/resource-curation-capability.md).

## Prerequisites

- `pnpm install`
- For live checks only: a Google Cloud API key (`AIza…`) with **YouTube Data API v3** enabled, as
  `YOUTUBE_API_KEY` in the git-ignored `.env`. Your Gemini `AQ.` key does not work for YouTube
  (research R6). Never print it; tools load it with `node --env-file=.env`.

  How to get one: console.cloud.google.com → create or pick a project → "APIs & Services" →
  enable "YouTube Data API v3" → Credentials → Create credentials → API key → restrict it to
  YouTube Data API v3 (and, for the app, to your site's address). Free: 100 searches per day.

## V1. Automated checks (no key, no network)

```bash
pnpm typecheck && pnpm lint && pnpm lint:css && pnpm lint:arch && pnpm lint:i18n && pnpm lint:rules && pnpm test
pnpm test:redteam
pnpm test:e2e
```

Expected: all green. Among them:

- Adapters: Gemini and Anthropic tool-call mapping (call, `continuation` round trip, tool result
  shape); YouTube request shape (no `key=`), error table, parsing and caps, entity decoding.
- Pipeline: step loop and limits (4 steps, 2 searches, 1 `show_resources`), verdict from the final
  step, cards built from search data only, prose links not matching a card become plain text, usage
  summed over steps, cancel mid-search, no retries.
- Registry: 1.0.0 and 1.1.0 capabilities, search permission denial.
- Storage: search key stored under `youtube` beside AI keys; `deleteAll` removes it, saved resources,
  and search settings; 30-day expiry purge.
- Red-team (FR-023): injected instructions in titles and descriptions, invented links, non-YouTube
  links, tracking parameters, oversized fields, lyrics, side effect in a tainted turn.
- CSP: `connect-src` is `'self'`, the two AI origins, `https://www.googleapis.com`, nothing else.
- e2e (mock provider + mock search): consent dialog, cards, open link, save, saved list, search off,
  missing key message.

## V2. Learner flow with real keys (manual, SC-001 to SC-003)

1. `pnpm --filter @tarjuman/web build && pnpm --filter @tarjuman/web preview`; use Gemini as today.
2. Settings → Internet search: paste the YouTube key. Expected: "Key saved: AIza…xxxx".
3. In chat: "Find me videos about climbing". Expected: the consent dialog with YouTube Terms and
   Google Privacy links; after "Agree", "Searching YouTube…", then up to 8 cards, each "YouTube ·
   channel", with labels and a fit note; no thumbnails.
4. Open two links: they open the right videos in a new tab. Save one; it appears in Saved resources.
5. Ask "songs in Spanish like Shakira". Expected: cards of type song; no full lyrics in the reply.
6. Network panel: requests with the YouTube key go only to `www.googleapis.com`, key only in
   `x-goog-api-key`; no request carries history or the AI key.
7. Repeat step 3 with 20 requests across 3 target languages and note how many links work and fit
   (SC-002, SC-003) in `checklists/validation.md`.

## V3. Fallbacks (manual)

- Search off in settings → resource request → "search unavailable (turned off)", no request.
- Remove the YouTube key → "search unavailable (no key)", with a link to settings.
- `VITE_PROVIDER=ollama` dev build → "search unavailable (this model cannot search)".

## V4. Owner live smoke test

```bash
pnpm test:live:youtube
```

Expected: one validation call and one search for a fixed query in Spanish; prints only result
count, the first title, and quota-relevant status. A 403 `quotaExceeded` is reported, not retried.
