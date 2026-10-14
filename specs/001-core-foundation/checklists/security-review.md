# Security review: Core Foundation

**Task**: T153
**Date**: 2026-10-13
**Scope**: the whole feature on `main` at `daaf41e`, plus the uncommitted Phase 11 work

## How it was done

The `/security-review` command could not run: it diffs against `origin/HEAD`, which is not set in
this clone, and a diff against the remote would only show unpublished commits, not the feature.
The review was done by hand over the security-relevant code instead:

- key entry, storage, replacement, deletion, and delete-all (`packages/core/src/credentials`,
  `packages/storage-web`)
- the Anthropic adapter's client options, error mapping, and secret scrubbing
  (`packages/provider-anthropic`)
- the input guard's key detection and the untrusted-block escaping (`packages/core/src/pipeline`)
- the output guard, `SafeBlock` rendering, and `InertLink` (`packages/ui/src/chat`)
- the Content-Security-Policy and how it is applied (`apps/web/csp.ts`, `vite.config.ts`)
- the permission broker, the tool-call check, and the frozen registry and pipeline
- the dev and test switches (`VITE_PROVIDER`, `?locale=`, `?mockLatencyMs=`) and the workflows

The automated gates in [validation.md](validation.md) all pass, including the structural
adversarial suite (57 cases, 0 key disclosures, 0 remote-resource elements).

A production build without `VITE_PROVIDER` was checked by hand: it contains no mock key, no mock
test hook, and no Ollama endpoint. A regression test for the mock now sits next to the existing
Ollama one in `apps/web/tests/prod-excludes-dev-provider.test.ts`.

## Findings

No high or medium severity issue was found. Findings below are low severity or latent.

| # | Severity | Finding | Suggested action |
|---|----------|---------|------------------|
| 1 | Low | **Delete-all with a second tab open.** The other tab's connection is closed so the database can be dropped, but that tab keeps its screen state and any session-only key in memory, and its next write recreates the database. The emptiness check is correct at the moment it runs and cannot see what happens afterwards. | Tell other tabs to reset (for example with a `BroadcastChannel`), or warn in the confirmation step that other open Tarjuman tabs must be closed. Needs a spec decision. |
| 2 | Low (latent) | **Broker `net.fetch` and redirects.** The allowlist checks the requested URL. A host `fetch` that follows redirects could reach a host outside the allowlist. Nothing calls it today: no tool runs, no fetch service is wired, and the CSP `connect-src` would block any origin other than this app and the provider anyway. | When a network capability is added: pass a fetch that uses `redirect: "error"`, add its hosts to `connect-src`, and consider pinning the port. |
| 3 | Low | **`frame-ancestors` is header-only.** The production CSP is a `<meta>` tag, and browsers ignore `frame-ancestors` there. Only `vite preview` sends it as a header. A static host that does not send it would allow framing (clickjacking of, for example, "delete all my data", which is behind a confirmation step). | Document in the deployment notes that the host must send `Content-Security-Policy` with `frame-ancestors 'none'` (or `X-Frame-Options: DENY`). |
| 4 | Low | **Third-party actions pinned by tag.** `nightly-live.yml` runs `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node` by major tag in a job that holds `TARJUMAN_TEST_KEY`. The secret is only set on the two test steps, which limits exposure. | Pin those actions to commit SHAs before the secret is configured. |
| 5 | Info | **Behavior against Claude is unmeasured.** The Anthropic adapter has never run against the live API, and the guardrail and behavioral suites have only run against a local non-Claude model. The nightly job skips while no key exists. | Run the nightly suites once a test key exists; treat SC-003 as open until then. |

Checked with no finding: the key never enters a `ModelRequest` (type-level assertion and
structural tests); `maxRetries: 0`; adapter errors are mapped to codes and scrubbed; the key regex
also catches keys wrapped in invisible characters; untrusted text is entity-escaped so it cannot
close its block; output has no image node, raw HTML is text, and links are limited to
`http(s)`/`mailto` with `noopener noreferrer` and a visible destination; no `dangerouslySetInnerHTML`
or `innerHTML`; storage encrypts the persistent key with a non-extractable AES-GCM key bound to the
provider id; `ToolContext` and capabilities carry no provider, secret, or stage.

## Threat Analysis: are the residual risks still accurate?

Checked against [plan.md](../plan.md) → Threat Analysis.

| Threat | Residual risk in the plan | Still accurate? |
|--------|---------------------------|-----------------|
| Prompt injection via pasted text | Model may still be swayed in prose; bounded because it has no tools and cannot see the key | **Yes.** No provider is asked for tools, and a future tool must pass the broker and the taint gate. |
| Key disclosure through the model | None for the model path | **Yes.** |
| Key typed into chat | Novel key formats | **Yes.** Detection covers the `sk-ant-` family and long key-alphabet tokens. |
| Exfiltration via rendered output | Users clicking a visible link deliberately | **Yes.** |
| Same-origin script compromise | A compromised script can use the in-browser key; session-only offered | **Yes.** Add finding 3 (framing depends on the host's headers). |
| Local data theft | Full profile access can run the app; passphrase mode deferred | **Yes.** |
| Silent cost multiplication | None | **Yes.** |
| Rule regression | Live-model drift caught by the nightly job, not per PR | **Not today.** The nightly job exists but skips without a test key, so drift is currently not caught at all. |
| Capability overreach | Bugs in the broker; covered by dummy-capability tests | **Yes.** Add finding 2 for when network tools arrive. |

**Missing from the table:** dev and test providers reaching a production build. Mitigation: the
Ollama branch is guarded by `import.meta.env.DEV` and the mock by `VITE_PROVIDER=mock`; both are
dropped from a normal production build, which two build tests now check. Residual risk: deploying
the e2e build by mistake (it accepts a fixed mock key).

These are proposed changes to `plan.md`. They are reported here and not applied, because the plan
is a reviewed Spec Kit artifact.
