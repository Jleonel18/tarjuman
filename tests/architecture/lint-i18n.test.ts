import { describe, expect, it } from "vitest";
import { checkGroup, icuArguments } from "../../scripts/i18n-check";

const ok = { "common.save": "Save", "common.hi": "Hi {name}" };
const okEs = { "common.save": "Guardar", "common.hi": "Hola {name}" };

describe("icuArguments", () => {
  it("finds simple and plural arguments but not branch selectors", () => {
    expect(icuArguments("Hello, {name}")).toEqual(["name"]);
    expect(icuArguments("{count, plural, =0 {None} one {# item} other {# items}}")).toEqual(["count"]);
    expect(icuArguments("No arguments")).toEqual([]);
    // A single word in a branch body is text, not an argument.
    expect(icuArguments("{count, plural, =0 {None} one {One} other {Many}}")).toEqual(["count"]);
    expect(icuArguments("{n, plural, one {{name} has # item} other {{name} has # items}}")).toEqual(["n", "name"]);
    expect(icuArguments("{value, number}")).toEqual(["value"]);
    expect(icuArguments("{a} and {b, select, x {{c}} other {z}}")).toEqual(["a", "b", "c"]);
  });
});

describe("checkGroup", () => {
  it("passes when en and es match", () => {
    expect(checkGroup({ name: "ui", catalogs: { en: ok, es: okEs } })).toEqual([]);
  });

  it("reports a key missing in either language", () => {
    const problems = checkGroup({ name: "ui", catalogs: { en: { ...ok, "common.extra": "Extra" }, es: okEs } });
    expect(problems.join("\n")).toContain("common.extra: missing (present in en)");
    const reverse = checkGroup({ name: "ui", catalogs: { en: ok, es: { ...okEs, "common.only": "Solo" } } });
    expect(reverse.join("\n")).toContain("common.only: missing (present in es)");
  });

  it("reports empty values and values identical to their key", () => {
    const problems = checkGroup({
      name: "ui",
      catalogs: { en: { ...ok, "common.empty": "  " }, es: { ...okEs, "common.empty": "vacío", "common.save": "common.save" } },
    });
    const text = problems.join("\n");
    expect(text).toContain("[en] common.empty: empty value");
    expect(text).toContain("[es] common.save: value is identical to its key");
  });

  it("reports differing ICU arguments between languages", () => {
    const problems = checkGroup({ name: "ui", catalogs: { en: ok, es: { ...okEs, "common.hi": "Hola {nombre}" } } });
    expect(problems.join("\n")).toContain("ICU arguments differ");
  });

  it("reports a missing language catalog", () => {
    expect(checkGroup({ name: "ui", catalogs: { en: ok } }).join("\n")).toContain("missing es catalog");
  });

  it("requires capability keys to live in the capability namespace", () => {
    const en = { "capability.demo.title": "Demo", "common.stolen": "Nope" };
    const es = { "capability.demo.title": "Demostración", "common.stolen": "No" };
    const problems = checkGroup({ name: "capability demo", capabilityId: "demo", catalogs: { en, es } });
    expect(problems.join("\n")).toContain('key must start with "capability.demo."');
    expect(problems.filter((p) => p.includes("capability.demo.title"))).toEqual([]);
  });
});
