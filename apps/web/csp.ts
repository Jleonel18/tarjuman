/**
 * Content-Security-Policy for the web app (Principle V, plan.md threat analysis).
 *
 * Production is strict: only same-origin scripts and styles, no inline anything, no remote
 * images, and `connect-src` limited to this origin and the AI provider. Because the API key is
 * handled in this page, an injected script is the main residual risk, and this policy is the
 * mitigation (see SECURITY.md).
 *
 * Development needs more: Vite injects an inline preamble script and uses a WebSocket for HMR.
 * That relaxed policy is used only by the dev server. The e2e suite runs against the production
 * build so it tests the policy that ships.
 */

/**
 * Origins the user's key may be sent to. Must match `ANTHROPIC_API_ORIGIN` in
 * `@tarjuman/provider-anthropic`; `tests/csp.test.ts` fails if they drift apart.
 */
export const PROVIDER_ORIGINS = ["https://api.anthropic.com"] as const;

export type CspMode = "production" | "development";

export function buildCsp(mode: CspMode): string {
  const dev = mode === "development";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    "style-src": dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    "img-src": ["'self'"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...PROVIDER_ORIGINS, ...(dev ? ["ws://localhost:*", "http://localhost:*"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
    "frame-src": ["'none'"],
    "worker-src": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** Directives that are only honored as an HTTP header, not in a `<meta>` tag. */
export const HEADER_ONLY_DIRECTIVES = "frame-ancestors 'none'";
