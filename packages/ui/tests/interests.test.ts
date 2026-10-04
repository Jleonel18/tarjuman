import { describe, expect, it } from "vitest";
import { addInterest, removeInterest } from "../src/onboarding/interests";

describe("addInterest", () => {
  it("adds a trimmed interest", () => {
    expect(addInterest(["music"], "  cooking ")).toEqual({ ok: true, interests: ["music", "cooking"] });
  });

  it("rejects blank text", () => {
    expect(addInterest([], "   ")).toEqual({ ok: false, reason: "blank" });
  });

  it("allows exactly 60 characters and rejects 61", () => {
    expect(addInterest([], "a".repeat(60)).ok).toBe(true);
    expect(addInterest([], "a".repeat(61))).toEqual({ ok: false, reason: "too_long" });
  });

  it("counts characters, not UTF-16 units", () => {
    expect(addInterest([], "食".repeat(60)).ok).toBe(true);
  });

  it("allows 10 interests and rejects the 11th", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `topic ${i}`);
    expect(addInterest(ten.slice(0, 9), "last").ok).toBe(true);
    expect(addInterest(ten, "one more")).toEqual({ ok: false, reason: "too_many" });
  });

  it("rejects a duplicate ignoring case", () => {
    expect(addInterest(["Cooking"], "cooking")).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("removeInterest", () => {
  it("removes only the named interest", () => {
    expect(removeInterest(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
