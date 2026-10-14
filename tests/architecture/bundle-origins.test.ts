import { describe, expect, it } from "vitest";
import { bundleOriginProblems, type BundleFile } from "../../scripts/bundle-origins";

// The logic behind `pnpm check:bundle-origins` (001 T105, FR-040, research R18): the production
// bundle may reference only its own origin and the AI provider. CSP is what enforces it in the
// browser; this check catches drift before it ships, such as a font from a CDN or a tracker.

const PROVIDER = ["https://api.anthropic.com", "https://generativelanguage.googleapis.com", "https://www.googleapis.com"];
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com https://www.googleapis.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'self'";

const html = (head = "", csp = CSP): BundleFile => ({
  path: "index.html",
  content: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp.replace(/'/g, "&#39;")}">${head}<script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"></head><body></body></html>`,
});
const js = (content: string): BundleFile => ({ path: "assets/app.js", content });
const css = (content: string): BundleFile => ({ path: "assets/app.css", content });
const LINKS = ["https://www.youtube.com", "https://policies.google.com"];
const check = (...files: BundleFile[]) => bundleOriginProblems(files, { providerOrigins: PROVIDER, linkOrigins: LINKS });

describe("bundleOriginProblems", () => {
  it("accepts a bundle that talks only to itself and the providers", () => {
    expect(check(html(), js('fetch("https://api.anthropic.com/v1/messages")'), css("a{color:red}"))).toEqual([]);
    expect(check(html(), js('fetch("https://generativelanguage.googleapis.com/v1beta/models")'), css(""))).toEqual([]);
  });

  it("accepts the YouTube Data API origin (005)", () => {
    expect(check(html(), js('fetch("https://www.googleapis.com/youtube/v3/search")'), css(""))).toEqual([]);
  });

  it("rejects another Google host: only the exact API origins are allowed (004 FR-011, 005)", () => {
    for (const host of ["aistudio.google.com", "youtube.googleapis.com", "console.cloud.google.com", "m.youtube.com"]) {
      const problems = check(html(), js(`fetch("https://${host}/x")`), css(""));
      expect(problems, host).toEqual([expect.stringContaining(host)]);
    }
  });

  it("accepts a link origin in the JavaScript, where a click can only navigate to it (005)", () => {
    const code = 'const link="https://www.youtube.com/watch?v="; const terms="https://policies.google.com/privacy";';
    expect(check(html(), js(code), css(""))).toEqual([]);
    // Without being declared as a link origin, the same strings are a problem.
    expect(bundleOriginProblems([html(), js(code), css("")], { providerOrigins: PROVIDER })).not.toEqual([]);
  });

  it("never accepts a link origin in the HTML, the CSS, or the CSP", () => {
    expect(check(html('<img src="https://www.youtube.com/x.png">'), js(""), css(""))).not.toEqual([]);
    expect(check(html(), js(""), css("a{background:url(https://www.youtube.com/x.png)}"))).not.toEqual([]);
    expect(check(html("", CSP.replace("connect-src 'self'", "connect-src 'self' https://www.youtube.com")), js(""), css(""))).not.toEqual([]);
  });

  it("accepts the documentation and namespace strings libraries carry, which are never fetched", () => {
    const inert = 'const ns="http://www.w3.org/2000/svg"; const doc="https://react.dev/errors/418";';
    expect(check(html(), js(inert), css(""))).toEqual([]);
  });

  it("rejects an unknown origin in the JavaScript", () => {
    const problems = check(html(), js('fetch("https://tracker.example/collect")'), css(""));
    expect(problems).toEqual([expect.stringContaining("tracker.example")]);
    expect(problems[0]).toContain("assets/app.js");
  });

  it("rejects a remote font, image, or import in the CSS", () => {
    for (const rule of [
      '@import url("https://fonts.googleapis.com/css2?family=Inter");',
      "a{background:url(https://cdn.example/x.png)}",
      "a{background:url(//cdn.example/x.png)}",
      '@font-face{src:url("https://fonts.gstatic.com/x.woff2")}',
      '@import "https://cdn.example/x.css";',
    ]) {
      expect(check(html(), js(""), css(rule)), rule).not.toEqual([]);
    }
  });

  it("accepts same-origin url() references in the CSS", () => {
    expect(check(html(), js(""), css('@font-face{src:url("/assets/inter.woff2")}'))).toEqual([]);
  });

  it("rejects a remote script, stylesheet, or image in index.html", () => {
    for (const head of [
      '<script src="https://cdn.example/x.js"></script>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
      '<link rel="stylesheet" href="//cdn.example/x.css">',
      '<img src="https://cdn.example/x.png">',
      '<link rel="preconnect" href="https://fonts.gstatic.com">',
    ]) {
      expect(check(html(head), js(""), css("")), head).not.toEqual([]);
    }
  });

  it("rejects a CSP that lets the page talk to another origin", () => {
    expect(check(html("", CSP.replace("connect-src 'self'", "connect-src 'self' https://tracker.example")), js(""), css(""))).not.toEqual([]);
    expect(check(html("", CSP.replace("img-src 'self'", "img-src 'self' https:")), js(""), css(""))).not.toEqual([]);
    expect(check(html("", CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")), js(""), css(""))).not.toEqual([]);
    expect(check(html("", CSP.replace("connect-src 'self' https://api.anthropic.com", "connect-src *")), js(""), css(""))).not.toEqual([]);
  });

  it("rejects a bundle with no CSP at all", () => {
    expect(check({ path: "index.html", content: "<html></html>" }, js(""), css(""))).not.toEqual([]);
  });

  it("reports every problem, not only the first", () => {
    const problems = check(html(), js('"https://a.example" "https://b.example"'), css("a{background:url(https://c.example/x)}"));
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});
