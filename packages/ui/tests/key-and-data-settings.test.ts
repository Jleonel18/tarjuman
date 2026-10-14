import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DataControls } from "../src/settings/DataControls";
import { KeySettings } from "../src/settings/KeySettings";
import { render } from "./render";

const props = {
  maskedHint: "sk-ant-…a1b2",
  storageAvailable: true,
  onReplace: async () => ({ ok: true as const, maskedHint: "sk-ant-…c3d4" }),
  onDelete: () => {},
};

describe("KeySettings", () => {
  it.each(["en", "es"])("shows the masked hint and the storage mode in %s with no missing key", async (locale) => {
    const { html, missing } = await render(createElement(KeySettings, { ...props, storageMode: "persistent" }), locale);
    expect(missing).toEqual([]);
    expect(html).toContain("sk-ant-…a1b2");
    expect(html).not.toContain('type="password"');
  });

  it("says when the key is kept for this session only", async () => {
    const { html } = await render(createElement(KeySettings, { ...props, storageMode: "session" }));
    expect(html).toContain("this session only");
  });
});

describe("DataControls", () => {
  it.each(["en", "es"])("offers delete-all behind a confirmation in %s with no missing key", async (locale) => {
    const { html, missing } = await render(
      createElement(DataControls, { onDeleteAll: async () => ({ ok: true as const }) }),
      locale,
    );
    expect(missing).toEqual([]);
    // Only the first step is on screen: the confirmation button appears after a click.
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});
