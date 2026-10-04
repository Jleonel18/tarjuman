# Contract: Fixture Provenance

Applies to every artifact produced against a live model: guardrail fixtures (001 T079), live
guardrail reports (001 T080), and the adapter's own captured SSE fixtures (research R10).

1. Every fixture set and report carries a `FixtureProvenance` (data-model.md). Missing provenance is
   a load error.
2. When `isClaude` is false:
   - Reports print `label` as their **first line**, before any rate.
   - Rates are printed as "informational (non-Claude)" and the report ends with
     "001 SC-003: unverified (no Claude run)".
   - No test may assert SC-003 thresholds against these results. The per-PR suite (T070) asserts
     mechanics only: verdict parsed, refusal rendered in the mediation language, status set.
3. When `isClaude` is true, behavior is exactly as 001 specifies (SC-003 thresholds enforced).
4. Provenance never contains a key, header, base URL credential, or environment value other than
   the model id and runtime version.
5. Hand-written fixtures use `providerId: "synthetic"` and state their source (e.g. "from
   documentation").
