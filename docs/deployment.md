# Deploying Tarjuman

Tarjuman is a static site: build it once, then serve `apps/web/dist/` from any static host. There is
no server code. This page lists what the host must do so the security model still holds in
production. Background: [SECURITY.md](../SECURITY.md) and
[specs/001-core-foundation/checklists/security-review.md](../specs/001-core-foundation/checklists/security-review.md)
(findings 3 and the dev-provider row).

## Build

```bash
pnpm install
pnpm --filter @tarjuman/web build      # no VITE_PROVIDER, no VITE_PSEUDO_LOCALE
pnpm check:bundle-origins              # the bundle reaches only the allowed origins
```

Never deploy the end-to-end build. Playwright builds with `VITE_PROVIDER=mock`, which accepts the
fixed mock key `sk-ant-mock-valid-key-0000` and carries test doubles. `VITE_PROVIDER=ollama` is
stripped from production builds, but do not set it either.

## Required response headers

The build puts the Content-Security-Policy in a `<meta>` tag. Browsers ignore `frame-ancestors` in
a `<meta>` tag, so **framing protection depends on the host**. Without it, another site could frame
the app and trick a learner into clicking, for example, "Delete all my data".

The host must send, on every HTML response:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` (for older browsers) |

Sending only `frame-ancestors 'none'` in the header is enough: the `<meta>` policy still applies, and
the browser enforces both policies. If you prefer to send the full policy as a header too, use
`buildCsp("production")` from [apps/web/csp.ts](../apps/web/csp.ts) plus `HEADER_ONLY_DIRECTIVES`,
exactly as `vite preview` does in [apps/web/vite.config.ts](../apps/web/vite.config.ts). Keep the two
in step: a header that is looser than the `<meta>` tag does not loosen it, but a stricter one can
break the app (for example a `connect-src` without the provider and search origins).

### Examples

Netlify or Cloudflare Pages, file `apps/web/public/_headers` (copied into `dist/` by the build):

```text
/*
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
```

nginx:

```nginx
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header X-Frame-Options "DENY" always;
```

## Check after deploying

```bash
curl -sI https://your-host.example/ | grep -iE 'content-security-policy|x-frame-options'
```

Both headers must appear. Then open the app and confirm that the browser console shows no CSP
violations during onboarding and one chat turn.
