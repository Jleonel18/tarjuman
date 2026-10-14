# Contract: Search Port and the YouTube Adapter

New core port. Rationale: [research.md](../research.md) R6, R7, R9.

```ts
interface SearchPort {
  readonly id: string;                                // "youtube"
  readonly termsVersion: string;                      // bump → consent asked again
  validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult>;
  search(req: SearchRequest, secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome>;
  details(externalIds: string[], secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome>;
}

type SearchOutcome =
  | { ok: true; results: SearchResult[] }            // data-model.md, without `ref`
  | { ok: false; code: SearchErrorCode };

type SearchErrorCode =
  | "invalid_credential" | "not_enabled" | "quota_exhausted"
  | "rate_limited" | "network" | "bad_request" | "unknown";
```

## SearchBroker (core)

- The only holder of `SearchPort` instances (lint:arch extends the ProviderPort name check).
- `run(sourceId, req, signal)`: checks search enabled and consent for `sourceId` (`disabled`,
  `no_consent`, with no request made); rejects a `query` longer than 120 characters or containing a
  key shape (`bad_request`, no request made); loads the key with `credentials.load(sourceId)`
  (missing → `invalid_credential`); calls the port. Returns results without `ref`s; the pipeline's
  per-turn `TurnSearchSession` numbers and deduplicates them (provider-tool-calls.md). Never
  retries. Never passes the key anywhere else.
- Used by the `PermissionBroker` to back `ToolContext.search`, and by the app for card refresh.

## YouTube adapter (`@tarjuman/search-youtube`)

- Native `fetch`, origin `https://www.googleapis.com`, key only in `x-goog-api-key`. No `key=`
  anywhere (tested).
- `search`: `GET /youtube/v3/search?part=snippet&type=video&maxResults=8&safeSearch=strict&q=…&relevanceLanguage=…`
  (+ `videoCategoryId=10` for `music`, `videoCaption=closedCaption` for `captionsOnly`), then one
  `GET /youtube/v3/videos?part=snippet,contentDetails&id=…`. Results keep the search order.
  `contentDetails.regionRestriction` → `accessNote: region_restricted`;
  `contentDetails.contentRating.ytRating = ytAgeRestricted` → `accessNote: age_restricted`.
- `validateCredential`: `GET /youtube/v3/videoCategories?part=id&regionCode=US`.
- Errors: read only the status and allow-listed `reason`s: `400 API_KEY_INVALID|keyInvalid` →
  `invalid_credential`; `403 accessNotConfigured|SERVICE_DISABLED` → `not_enabled`;
  `403 quotaExceeded|dailyLimitExceeded` → `quota_exhausted`; `403` other → `invalid_credential`;
  `429` → `rate_limited`; fetch failure → `network`; else `unknown`. Server text never surfaces.
- Parsing with Zod; ids must match `^[A-Za-z0-9_-]{11}$` or the item is dropped; HTML entities
  decoded by a fixed table; lengths capped (data-model.md); ISO 8601 durations parsed.
- `SecretStreamFilter`-equivalent check: no response field is returned if it contains the key.
- CSP `connect-src` gains exactly `https://www.googleapis.com`.

## Mock (`@tarjuman/testing`)

`MockSearchPort` with scripted outcomes, including hostile fixtures (injected instructions in
titles and descriptions, invalid ids, oversized fields, entity tricks). Used by unit, red-team, and
e2e tests; no test reaches the network except the owner's opt-in live test.
