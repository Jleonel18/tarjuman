import { describe, expect, it } from "vitest";
import { pseudoRtl, pseudoRtlCatalog } from "../src/pseudo-rtl";

const RLM = "‏";
const RLE = "‫";
const PDF = "‬";

describe("pseudoRtl", () => {
  it("wraps in RLM + RLE ... PDF so the base direction is right-to-left", () => {
    const out = pseudoRtl("Save changes");
    expect(out.startsWith(RLM + RLE)).toBe(true);
    expect(out.endsWith(PDF)).toBe(true);
  });

  it("reverses word order so the text still reads left to right under RTL", () => {
    expect(pseudoRtl("Save all changes")).toContain("changes all Save");
  });

  it("lengthens the string by at least 30 percent", () => {
    const input = "Interface language settings";
    expect(pseudoRtl(input).length).toBeGreaterThanOrEqual(Math.ceil(input.length * 1.3));
  });

  it("keeps ICU arguments intact", () => {
    const out = pseudoRtl("Hello, {name}");
    expect(out).toContain("{name}");
  });

  it("keeps plural selectors and arguments but transforms branch text", () => {
    const input = "{count, plural, =0 {No items} one {# item} other {# items}}";
    const out = pseudoRtl(input);
    // The only ICU argument is still `count`; selectors (one, other) are not mistaken for args.
    expect(out.match(/\{\s*([A-Za-z_][\w.]*)\s*(?=[,}])/g)).toEqual(["{count"]);
    expect(out).toContain("{count, plural, =0 {");
    expect(out).toContain("items No");
    // Logical "item #" displays as "# item" under a right-to-left base direction.
    expect(out).toContain("one {item #}");
    expect(out).toContain("other {");
  });

  it("is deterministic", () => {
    expect(pseudoRtl("Cancel")).toBe(pseudoRtl("Cancel"));
  });

  it("does not break unbalanced braces", () => {
    expect(() => pseudoRtl("Broken {oops")).not.toThrow();
  });

  it("transforms every value of a catalog and keeps the keys", () => {
    const out = pseudoRtlCatalog({ "common.save": "Save", "common.cancel": "Cancel" });
    expect(Object.keys(out)).toEqual(["common.save", "common.cancel"]);
    expect(out["common.save"]!.startsWith(RLM + RLE)).toBe(true);
  });
});
