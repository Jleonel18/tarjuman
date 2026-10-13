/**
 * The logic behind `pnpm check:bundle-origins` (001 T105, FR-040, research R18). The browser
 * enforces the CSP; this catches a change that would need the CSP loosened, before it ships.
 * Pure: it reads nothing, so it is tested without a build.
 */

export interface BundleFile {
  /** Relative to the build directory, e.g. `assets/index-abc.js`. */
  path: string;
  content: string;
}

export interface BundleCheckOptions {
  /** Origins the user's key may be sent to, e.g. `https://api.anthropic.com`. */
  providerOrigins: readonly string[];
}

/**
 * Hosts that appear in third-party code as plain strings: XML namespace identifiers and links in
 * library error messages. They are never fetched (the CSP would block it), so they are accepted;
 * anything else needs a human to look at it. Keep this list short.
 */
const INERT_HOSTS = new Set([
  "www.w3.org", // XML and SVG namespace identifiers
  "json-schema.org", // `$schema` identifiers
  "react.dev", // error-message links in React
  "react.i18next.com", // error-message links in react-i18next
  "docs.anthropic.com", // links in the Anthropic SDK's messages
  "platform.claude.com",
  "github.com",
  "docs.expo.dev",
]);

const ABSOLUTE_ORIGIN = /\bhttps?:\/\/[A-Za-z0-9.-]+(?::\d+)?/g;

/** Every problem found in the built bundle, one line each. An empty list means it is clean. */
export function bundleOriginProblems(files: readonly BundleFile[], options: BundleCheckOptions): string[] {
  const providerHosts = new Set(options.providerOrigins.map(hostOf));
  const problems: string[] = [];
  let sawHtml = false;

  for (const file of files) {
    if (file.path.endsWith(".html")) {
      sawHtml = true;
      problems.push(...htmlProblems(file, options));
    } else if (file.path.endsWith(".css")) {
      problems.push(...cssProblems(file));
    } else if (/\.(?:m?js|cjs)$/.test(file.path)) {
      for (const origin of new Set(file.content.match(ABSOLUTE_ORIGIN) ?? [])) {
        const host = hostOf(origin);
        if (!providerHosts.has(host) && !INERT_HOSTS.has(host)) {
          problems.push(`${file.path}: references the origin ${origin}`);
        }
      }
    }
  }
  if (!sawHtml) problems.push("no index.html was found in the bundle");
  return problems;
}

function hostOf(origin: string): string {
  return origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
}

function htmlProblems(file: BundleFile, options: BundleCheckOptions): string[] {
  const problems: string[] = [];
  const html = file.content;

  for (const match of html.matchAll(/\b(?:src|href|srcset|data|action|poster)\s*=\s*["']([^"']*)["']/gi)) {
    const target = match[1] ?? "";
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) problems.push(`${file.path}: loads ${target} from outside the app`);
  }

  const meta = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']*)["']/i);
  if (!meta) return [...problems, `${file.path}: has no Content-Security-Policy`];
  const csp = decodeEntities(meta[1] ?? "");
  const allowed = new Set(["'self'", "'none'", ...options.providerOrigins]);
  for (const directive of csp.split(";").map((d) => d.trim()).filter(Boolean)) {
    const [name, ...sources] = directive.split(/\s+/);
    for (const source of sources) {
      if (name === "connect-src" ? !allowed.has(source) : source !== "'self'" && source !== "'none'") {
        problems.push(`${file.path}: CSP ${name} allows ${source}`);
      }
    }
  }
  return problems;
}

function cssProblems(file: BundleFile): string[] {
  const problems: string[] = [];
  const remote = /^(?:https?:)?\/\//i;
  for (const match of file.content.matchAll(/url\(\s*["']?([^"')\s]+)/gi)) {
    if (remote.test(match[1] ?? "")) problems.push(`${file.path}: loads ${match[1]} from outside the app`);
  }
  for (const match of file.content.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
    if (remote.test(match[1] ?? "")) problems.push(`${file.path}: imports ${match[1]} from outside the app`);
  }
  return problems;
}

function decodeEntities(text: string): string {
  return text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

