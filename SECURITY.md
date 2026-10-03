# Security

Tarjuman handles a user's paid API key and treats text from outside as hostile by default.
Security here is structural: it comes from how the code is arranged, not from asking the model to
behave.

## Model

- **The key stays on the device.** It travels only from the user's browser to the AI provider.
  There is no Tarjuman server, proxy, or telemetry on that path.
- **The key never enters the model's context.** It is not an input to prompt assembly, so no
  prompt can make the model reveal it.
- **Stored encrypted.** On the web, with a non-extractable WebCrypto key in IndexedDB. A "this
  session only" mode keeps the key in memory.
- **Untrusted content is data, not instructions.** Pasted text and any future external content is
  labeled, isolated from the instruction layers, and has the lowest authority.
- **Output is rendered safely.** Model output becomes a restricted block tree: no images, no raw
  HTML, links inert and showing their destination.
- **Least privilege.** Capabilities declare their permissions; anything undeclared is denied.
  Network access is limited to an allowlist.
- **Delete everything in one action**, verified.

The full threat analysis is in
[specs/001-core-foundation/plan.md](specs/001-core-foundation/plan.md) under *Threat Analysis*.

## Known limits

- A compromised script running on the app's own origin could use the in-browser key even though
  it cannot export it. Mitigations: strict Content-Security-Policy, no third-party scripts, a
  locked dependency tree with audits, and the session-only option.
- Someone with full access to the user's browser profile can run the app as the user. A
  passphrase-protected mode is a possible future hardening.
- The model may still be influenced in prose by hostile pasted text. It has no tools and cannot
  see the key, which bounds the damage. Behavioral rates are measured against the real model on a
  schedule.

## Status

Early development: most of this is **designed and specified, not yet implemented**. Do not rely on
any of it for real keys until a release says otherwise.

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
