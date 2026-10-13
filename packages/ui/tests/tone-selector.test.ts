import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ToneSelector } from "../src/settings/ToneSelector";
import { render } from "./render";

const noop = () => {};

describe("ToneSelector", () => {
  it.each(["en", "es"])("shows the three tones in %s with no missing catalog key", async (locale) => {
    const { html, missing } = await render(
      createElement(ToneSelector, { toneId: "warm", onChange: noop }),
      locale,
    );
    expect(missing).toEqual([]);
    for (const id of ["warm", "neutral", "formal"]) expect(html).toContain(`value="${id}"`);
  });

  it("marks the current tone as selected and can be disabled", async () => {
    const { html } = await render(createElement(ToneSelector, { toneId: "formal", disabled: true, onChange: noop }));
    expect(html).toMatch(/<option[^>]*value="formal"[^>]*selected|selected[^>]*value="formal"/);
    expect(html).toContain("disabled");
  });
});
