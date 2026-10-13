import { describe, expect, it } from "vitest";
import { baseDirection, directionRuns } from "../src/chat/bidi";

const AR = "مرحبا بالعالم";
const HE = "שלום עולם";

describe("baseDirection", () => {
  it("follows the first strong letter, as dir=auto does", () => {
    expect(baseDirection("Hello")).toBe("ltr");
    expect(baseDirection(AR)).toBe("rtl");
    expect(baseDirection(HE)).toBe("rtl");
    expect(baseDirection(`123 ... ${AR} hello`)).toBe("rtl");
    expect(baseDirection("123 ... ")).toBe("ltr");
  });
});

describe("directionRuns", () => {
  it("returns one plain run for text in a single direction", () => {
    expect(directionRuns("Hello world.")).toEqual([{ text: "Hello world.", isolate: false }]);
    expect(directionRuns(AR)).toEqual([{ text: AR, isolate: false }]);
    expect(directionRuns("")).toEqual([]);
  });

  it("isolates an Arabic run inside English text, and keeps the punctuation outside", () => {
    expect(directionRuns(`The word ${AR}, which means hello.`)).toEqual([
      { text: "The word ", isolate: false },
      { text: AR, isolate: true },
      { text: ", which means hello.", isolate: false },
    ]);
  });

  it("isolates a Hebrew run inside Spanish text", () => {
    expect(directionRuns(`La palabra ${HE} significa paz.`)).toEqual([
      { text: "La palabra ", isolate: false },
      { text: HE, isolate: true },
      { text: " significa paz.", isolate: false },
    ]);
  });

  it("isolates a Latin run inside Arabic text", () => {
    const runs = directionRuns(`${AR} Tarjuman ${AR}`);
    expect(runs.filter((r) => r.isolate).map((r) => r.text)).toEqual(["Tarjuman"]);
  });

  it("keeps digits and spaces between two same-direction words inside the run", () => {
    const runs = directionRuns(`Say ${AR} 2 ${HE} now`);
    expect(runs.filter((r) => r.isolate).map((r) => r.text)).toEqual([`${AR} 2 ${HE}`]);
  });

  it("never loses or reorders a character", () => {
    for (const text of [`a ${AR} b ${HE}!`, `${AR}: hello (${HE})`, "x", `  ${AR}  `]) {
      expect(directionRuns(text).map((r) => r.text).join("")).toBe(text);
    }
  });
});
