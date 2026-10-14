import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ThemeSwitcher } from "../src/settings/ThemeSwitcher";
import { render } from "./render";

const noop = () => {};
const VALUES = ["light", "dark", "system"];

describe("ThemeSwitcher (FR-003b, FR-004)", () => {
  it.each(["en", "es"])("renders both variants in %s with no missing catalog key", async (locale) => {
    for (const variant of ["compact", "full"] as const) {
      const { missing } = await render(createElement(ThemeSwitcher, { value: "system", onChange: noop, variant }), locale);
      expect(missing).toEqual([]);
    }
  });

  it("compact: one labeled select with the three choices, its icon hidden from assistive technology", async () => {
    const { html } = await render(createElement(ThemeSwitcher, { value: "dark", onChange: noop, variant: "compact" }));
    expect(html.match(/<select/g)).toHaveLength(1);
    const id = /<select[^>]*id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(">Theme<");
    for (const value of VALUES) expect(html).toContain(`value="${value}"`);
    expect(html).toMatch(/<option[^>]*value="dark"[^>]*selected|selected[^>]*value="dark"/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("full: a labeled radio group with three labeled radios", async () => {
    const { html } = await render(createElement(ThemeSwitcher, { value: "light", onChange: noop, variant: "full" }));
    expect(html).toMatch(/role="radiogroup"|<fieldset/);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    for (const label of ["Light", "Dark", "Follow system"]) expect(html).toContain(label);
    for (const value of VALUES) expect(html).toContain(`value="${value}"`);
    expect(html).toMatch(/<input[^>]*value="light"[^>]*checked|checked[^>]*value="light"/);
    expect(html).not.toMatch(/<input[^>]*value="dark"[^>]*checked/);
  });
});
