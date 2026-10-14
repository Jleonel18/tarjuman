# Security

Tarjuman handles a user's paid API key and treats text from outside as hostile by default.
Security here is structural: it comes from how the code is arranged, not from asking the model to
behave.

## Model

- **The key stays on the device.** It travels only from the user's browser to the AI provider the
  user chose (Anthropic or Google Gemini). There is no Tarjuman server, proxy, or telemetry on that
  path. Each key is bound to its provider: a key that looks like another provider's is refused
  before any request, and the network policy allows only the two providers' API origins.
- **Gemini keys go in a header only.** Gemini's API also accepts the key in the URL; Tarjuman never
  does that, because URLs end up in history, proxies, and error reports.
- **The key never enters the model's context.** It is not an input to prompt assembly, so no
  prompt can make the model reveal it.
- **Stored encrypted.** On the web, with a non-extractable WebCrypto key in IndexedDB. A "this
  session only" mode keeps the key in memory.
- **Untrusted content is data, not instructions.** Pasted text and any future external content is
  labeled, isolated from the instruction layers, and has the lowest authority.
- **Output is rendered safely.** Model output becomes a restricted block tree: no images, no raw
  HTML, links inert and showing their destination.
- **Least privilege.** Capabilities declare their permissions; anything undeclared is denied by a
  permission broker. A tool gets only its own declared permissions, and network access is limited
  to an allowlist of `https` hosts.
- **Delete everything in one action**, verified. That includes the search key, the saved
  resources, and the search choices.
- **Search results are data from an untrusted source** (feature 005). A video title or description
  can say anything. Results are validated and capped twice (by the YouTube adapter and again by the
  search broker), key-shaped text in them is withheld, and they reach the model fenced as
  `untrusted_data`; a side-effecting tool after a search waits for the learner. The cards, with
  their titles, links, and labels, are built by the app from the search data. The model only picks
  ids and writes a note, so it cannot invent a resource or a link.
- **Links.** A card carries one link, built from a validated video id with no other parameter. In a
  turn that searched, a link the model writes in prose is clickable only if it equals a card's link;
  anything else is shown as text with its destination. Links open in a new tab with `noopener
  noreferrer` and no referrer.
- **The search key** is a Google Cloud key for the YouTube Data API. It goes in a request header
  only (never in a URL), to `https://www.googleapis.com` only, which is the one origin the network
  policy gained. It is entered, stored, and deleted exactly like the model key, and a model key
  typed for search (or the reverse) is refused before any request. Searching asks for consent
  first, naming what is sent and linking YouTube's terms and Google's privacy policy; the learner
  can turn search off.
- **What a search sends:** the query words, the language being learned, and the key. Not the
  conversation, the profile, or the model key. The query is written by the model, so its length is
  limited and a key shape in it is refused, but its content cannot be fully controlled (accepted
  and recorded in the feature's research notes).
- **YouTube data is not kept longer than 30 days**, in conversations or in saved resources: an old
  card is reduced to its id and fetch time at every start.

The full threat analysis is in
[specs/001-core-foundation/plan.md](specs/001-core-foundation/plan.md) under *Threat Analysis*.

## Known limits

- A compromised script running on the app's own origin could use the in-browser key even though
  it cannot export it. Mitigations: strict Content-Security-Policy, no third-party scripts, a
  locked dependency tree with audits, and the session-only option.
- Someone with full access to the user's browser profile can run the app as the user. A
  passphrase-protected mode is a possible future hardening.
- With a free-tier Gemini key, Google's terms allow it to use what is sent to improve its products.
  The app says so when the learner picks Gemini; it cannot prevent it.
- The model may still be influenced in prose by hostile pasted text or by a hostile video title.
  It cannot see the key, its only tools are a search and a list of ids, and a side-effecting tool
  after untrusted content waits for the learner, which bounds the damage. Behavioral rates have so far been measured only against a
  local non-Claude model; runs against Claude are planned.

## Status

Everything in the model above is **implemented and covered by tests**, including a structural
adversarial suite of 63 cases that runs on every pull request. It has **not been released or
independently reviewed**, the final security review is still open, and the Anthropic adapter has
never been run against the live API (the Gemini adapter has, once: research of feature 004). Do not rely on it for real keys until a release says
otherwise.

## Reporting a vulnerability

Please do **not** open a public issue for anything that could expose a key or user data.

Contact the maintainer privately through the email on the maintainer's GitHub profile
([Jleonel18](https://github.com/Jleonel18)) and include steps to reproduce. A dedicated security
contact will replace this once the project has a public release.

Prompt-injection or guardrail bypasses that do **not** expose secrets can be reported through
normal issues; each one becomes a permanent test case (schema in
[specs/001-core-foundation/contracts/adversarial-case.schema.json](specs/001-core-foundation/contracts/adversarial-case.schema.json)).

## Developer hygiene

- Never commit `.env*` (only `.env.example`). `.gitignore` already excludes them.
- The `TARJUMAN_TEST_KEY` used by developer tooling should be a throwaway key with a low spend
  limit, never a personal production key.
- Do not paste real keys into issues, logs, fixtures, or test cases.
