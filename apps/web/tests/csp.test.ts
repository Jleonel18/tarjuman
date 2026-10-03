import { ANTHROPIC_API_ORIGIN } from "@tarjuman/provider-anthropic";
import { describe, expect, it } from "vitest";
import { PROVIDER_ORIGINS, buildCsp } from "../csp";

function directive(csp: string, name: string): string[] {
  const entry = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  return entry ? entry.slice(name.length + 1).split(/\s+/) : [];
}

describe("production CSP", () => {
  const csp = buildCsp("production");

  it("allows only same-origin scripts and styles, with nothing inline or eval", () => {
    expect(directive(csp, "script-src")).toEqual(["'self'"]);
    expect(directive(csp, "style-src")).toEqual(["'self'"]);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("starts from default-src 'self' and blocks remote images", () => {
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "img-src")).toEqual(["'self'"]);
  });

  it("limits connections to this origin and the AI provider, and nothing else", () => {
    expect(directive(csp, "connect-src")).toEqual(["'self'", ANTHROPIC_API_ORIGIN]);
  });

  it("stays in sync with the provider adapter's origin", () => {
    expect(PROVIDER_ORIGINS).toEqual([ANTHROPIC_API_ORIGIN]);
  });

  it("denies plugins, base-uri changes, forms, and frames", () => {
    for (const name of ["object-src", "base-uri", "form-action", "frame-src"]) {
      expect(directive(csp, name)).toEqual(["'none'"]);
    }
  });

  it("has no wildcard or http: sources", () => {
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).not.toMatch(/\shttp:(\s|;|$)/);
  });
});

describe("development CSP", () => {
  const csp = buildCsp("development");

  it("is relaxed only where Vite needs it", () => {
    expect(directive(csp, "script-src")).toContain("'unsafe-inline'");
    expect(directive(csp, "connect-src")).toContain("ws://localhost:*");
  });

  it("still never allows remote images or arbitrary origins", () => {
    expect(directive(csp, "img-src")).toEqual(["'self'"]);
    expect(csp).not.toContain("https://*");
  });
});
