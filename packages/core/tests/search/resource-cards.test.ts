import { describe, expect, it } from "vitest";
import { buildResourceCards, parseShowResources, type ShowResourcesItem } from "../../src/search/resource-cards";
import { TurnSearchSession } from "../../src/search/turn-search-session";
import { result, results } from "../helpers/scripted-search";

// Cards are built from search data plus the model's choice, never from model text (005 FR-013).

function sessionWith(...found: ReturnType<typeof results>[]) {
  const session = new TurnSearchSession();
  for (const batch of found) session.add(batch);
  return session;
}

/** `extra` may carry fields a real model could add (a forged title, a link); the builder must ignore them. */
const item = (id: string, extra: Record<string, unknown> = {}): ShowResourcesItem =>
  ({ id, fitNote: "Fits your level.", difficulty: "about_right", ...extra }) as ShowResourcesItem;

describe("TurnSearchSession", () => {
  it("numbers results r1… in order, continuing across searches", () => {
    const session = new TurnSearchSession();
    const first = session.add(results(8));
    const second = session.add(results(8));
    expect(first.map((r) => r.ref)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]);
    expect(second.map((r) => r.ref)).toEqual(["r9", "r10", "r11", "r12", "r13", "r14", "r15", "r16"]);
  });

  it("keeps a video returned twice under its first ref and shows it once", () => {
    const session = new TurnSearchSession();
    const shared = result();
    session.add([result(), shared]);
    const second = session.add([shared, result()]);
    expect(second.map((r) => r.ref)).toEqual(["r3"]);
    expect(session.resultFor("r2")?.externalId).toBe(shared.externalId);
  });

  it("gives the model descriptive fields only: no link, no source id, no fetch time", () => {
    const session = new TurnSearchSession();
    const [first] = session.add([result({ title: "A", descriptionExcerpt: "B" })]);
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ["audioLanguage", "channel", "descriptionExcerpt", "durationSeconds", "hasCaptions", "ref", "title", "type"].sort(),
    );
  });

  it("never numbers past r16", () => {
    const session = new TurnSearchSession();
    expect(session.add(results(20))).toHaveLength(16);
    expect(session.add(results(2))).toEqual([]);
    expect(session.resultFor("r17")).toBeUndefined();
  });

  it("knows only the refs it assigned", () => {
    const session = sessionWith(results(2));
    expect(session.resultFor("r1")).toBeDefined();
    expect(session.resultFor("r3")).toBeUndefined();
    expect(session.resultFor("watch?v=r1")).toBeUndefined();
  });
});

describe("parseShowResources", () => {
  it("reads items, trims the note, and defaults an unknown difficulty", () => {
    expect(parseShowResources({ items: [{ id: "r1", fitNote: "  A note \n here  ", difficulty: "weird" }] })).toEqual([
      { id: "r1", fitNote: "A note here", difficulty: "unknown" },
    ]);
  });

  it("caps the note at 300 characters and drops control characters", () => {
    const parsed = parseShowResources({ items: [{ id: "r1", fitNote: `a\u0000b${"x".repeat(400)}`, difficulty: "easier" }] });
    expect(parsed?.[0]?.fitNote).toHaveLength(300);
    expect(parsed?.[0]?.fitNote).not.toContain("\u0000");
  });

  it("rejects input that is not { items: [...] }, or whose items are not objects with an id", () => {
    for (const bad of [null, "r1", { items: "r1" }, { items: [] }, {}]) {
      expect(parseShowResources(bad as never)).toBeUndefined();
    }
    // An item that is not usable is skipped, not fatal.
    expect(parseShowResources({ items: [{ id: 3, fitNote: "x" }, null, "r1"] })).toEqual([]);
  });

  it("takes at most 10 items", () => {
    const items = Array.from({ length: 14 }, (_, i) => item(`r${i + 1}`));
    expect(parseShowResources({ items })).toHaveLength(10);
  });
});

describe("buildResourceCards", () => {
  const profile = { interests: ["escalada"], requestText: "videos about climbing" };

  it("builds cards only from this turn's results, and drops unknown or forged ids", () => {
    const session = sessionWith(results(3));
    const { cards, dropped } = buildResourceCards({
      session,
      items: [item("r1"), item("r9"), item("watch?v=r1"), item("r2")],
      ...profile,
    });
    expect(cards.map((c) => c.ref)).toEqual(["r1", "r2"]);
    expect(dropped).toBe(2);
  });

  it("yields one card for an id given twice", () => {
    const session = sessionWith(results(2));
    const { cards } = buildResourceCards({ session, items: [item("r1"), item("r1", { fitNote: "Again" })], ...profile });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.fitNote).toBe("Fits your level.");
  });

  it("keeps the search order whatever order the model listed them in", () => {
    const session = sessionWith(results(4));
    const { cards } = buildResourceCards({ session, items: [item("r3"), item("r1"), item("r4")], ...profile });
    expect(cards.map((c) => c.ref)).toEqual(["r1", "r3", "r4"]);
  });

  it("takes every source field from the result and every judgement from the model", () => {
    const found = result({
      title: "Real title",
      channel: "Real channel",
      durationSeconds: 125,
      hasCaptions: false,
      audioLanguage: null,
      type: "song",
      priceLabel: "free",
      accessNote: "region_restricted",
      sponsored: true,
      affiliate: false,
    });
    const session = sessionWith([found]);
    const { cards } = buildResourceCards({ session, items: [item("r1", { difficulty: "harder" })], ...profile });
    expect(cards[0]).toEqual({
      ref: "r1",
      sourceId: "youtube",
      sourceDisplay: "YouTube (youtube.com)",
      externalId: found.externalId,
      title: "Real title",
      channel: "Real channel",
      durationSeconds: 125,
      hasCaptions: false,
      audioLanguage: null,
      type: "song",
      priceLabel: "free",
      accessNote: "region_restricted",
      sponsored: true,
      affiliate: false,
      link: found.link,
      fetchedAt: found.fetchedAt,
      fitNote: "Fits your level.",
      difficulty: "harder",
    });
  });

  it("ignores any title, link, or label the model puts in an item", () => {
    const found = result({ title: "Real" });
    const session = sessionWith([found]);
    const { cards } = buildResourceCards({
      session,
      items: [item("r1", { title: "Forged", link: "https://evil.example", priceLabel: "paid", sponsored: false })],
      ...profile,
    });
    expect(cards[0]?.title).toBe("Real");
    expect(cards[0]?.link).toBe(found.link);
    expect(cards[0]?.priceLabel).toBe("free");
  });

  it("builds the link from the result, which the adapter built from the id alone", () => {
    const found = result();
    const { cards } = buildResourceCards({ session: sessionWith([found]), items: [item("r1")], ...profile });
    expect(cards[0]?.link).toBe(`https://www.youtube.com/watch?v=${found.externalId}`);
  });

  it("labels sponsored and affiliate results without moving them", () => {
    const session = sessionWith([result({ sponsored: true }), result(), result({ affiliate: true })]);
    const { cards } = buildResourceCards({ session, items: [item("r3"), item("r2"), item("r1")], ...profile });
    expect(cards.map((c) => [c.ref, c.sponsored, c.affiliate])).toEqual([
      ["r1", true, false],
      ["r2", false, false],
      ["r3", false, true],
    ]);
  });

  it("keeps an interest only when it is the learner's or part of the request", () => {
    const session = sessionWith(results(4));
    const { cards } = buildResourceCards({
      session,
      items: [
        item("r1", { interest: "Escalada" }),
        item("r2", { interest: "climbing" }),
        item("r3", { interest: "politics" }),
        item("r4"),
      ],
      ...profile,
    });
    expect(cards.map((c) => c.interest)).toEqual(["Escalada", "climbing", undefined, undefined]);
  });

  it("returns at most 10 cards", () => {
    const session = new TurnSearchSession();
    session.add(results(8));
    session.add(results(8));
    const ids = Array.from({ length: 16 }, (_, i) => item(`r${i + 1}`));
    expect(buildResourceCards({ session, items: ids, ...profile }).cards).toHaveLength(10);
  });

  it("renders a hostile fit note as is, for the UI to show as plain text", () => {
    const { cards } = buildResourceCards({
      session: sessionWith(results(1)),
      items: [item("r1", { fitNote: "[go](https://evil.example) <script>x</script>" })],
      ...profile,
    });
    expect(cards[0]?.fitNote).toBe("[go](https://evil.example) <script>x</script>");
  });
});
