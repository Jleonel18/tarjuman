# YouTube Data API fixtures

**Provenance: synthetic, shaped after the documented responses** of `search.list`, `videos.list`
and `videoCategories.list` (005 research R6). None is a live capture: the owner has no YouTube key
yet. Ids, titles, channels, and error texts are made up. `SECRET-SERVER-TEXT` marks server text
that must never reach a result or an error. Replace them with real shapes once `pnpm
test:live:youtube` has run, and change this note when you do.

- `search-list.json`: four hits, one with an invalid id and one that `videos.list` no longer returns.
- `videos-list.json`: the details, in a different order than the search, with entities, a regional
  restriction, an age rating, the Music category, and ISO 8601 durations.
- `videos-list-odd.json`: oversized fields, a bad language code, a key-shaped title, `P0D`, `P1DT1H`.
- `categories-list.json`: the cheap call used to validate a key.
- `errors.json`: status and body per error case, all with server text that must stay hidden.

No key, conversation, or personal data belongs here.
