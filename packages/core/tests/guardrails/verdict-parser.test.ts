import { describe, expect, it } from "vitest";
import { VerdictParser } from "../../src/guardrails/verdict-parser";

/** Feeds chunks in order and returns what the parser released, plus the final result. */
function run(chunks: string[]) {
  const parser = new VerdictParser();
  const pushes = chunks.map((chunk) => parser.push(chunk));
  const end = parser.finish();
  return { pushes, end, text: pushes.map((p) => p.text).join("") + end.text };
}

describe("VerdictParser: the first line", () => {
  it.each([
    ["ACCEPT", "accept"],
    ["REFUSE", "refuse"],
    ["CLARIFY", "clarify"],
  ] as const)("reads %s and strips the line from the text", (word, verdict) => {
    const { end, text } = run([`${word}\nHola, ser describe identidad.`]);
    expect(end.verdict).toBe(verdict);
    expect(text).toBe("Hola, ser describe identidad.");
  });

  it.each(["accept", "Accept", "aCCePt", "refuse", "Refuse", "clarify", "Clarify"])("ignores case: %s", (word) => {
    const { end } = run([`${word}\nbody`]);
    expect(end.verdict).toBe(word.toLowerCase());
  });

  it("ignores spaces and tabs around the word, and a CRLF line ending", () => {
    expect(run(["  ACCEPT  \nbody"]).end.verdict).toBe("accept");
    expect(run(["\tREFUSE\t\nbody"]).end.verdict).toBe("refuse");
    const crlf = run(["CLARIFY\r\nWhich language?"]);
    expect(crlf.end.verdict).toBe("clarify");
    expect(crlf.text).toBe("Which language?");
  });

  it("skips whitespace before the first line, including blank lines", () => {
    const { end, text } = run(["\n\n  ACCEPT\nHi"]);
    expect(end.verdict).toBe("accept");
    expect(text).toBe("Hi");
  });

  it("keeps the rest of the answer exactly as written, even when it repeats a verdict word", () => {
    const { end, text } = run(["ACCEPT\nREFUSE\n\n  indented\nlast"]);
    expect(end.verdict).toBe("accept");
    expect(text).toBe("REFUSE\n\n  indented\nlast");
  });

  it("accepts a verdict with no body when the stream ends without a newline", () => {
    const { end, text } = run(["REFUSE"]);
    expect(end.verdict).toBe("refuse");
    expect(text).toBe("");
  });
});

describe("VerdictParser: streaming", () => {
  it("reports no verdict and releases no text until the first line is complete", () => {
    const parser = new VerdictParser();
    expect(parser.push("ACC")).toEqual({ verdict: null, text: "" });
    expect(parser.push("EPT")).toEqual({ verdict: null, text: "" });
    expect(parser.push("  ")).toEqual({ verdict: null, text: "" });
  });

  it("resolves a first line split across chunks and releases the rest as it arrives", () => {
    const { pushes, end, text } = run(["AC", "CEP", "T\nHo", "la", " mundo"]);
    expect(pushes.map((p) => p.verdict)).toEqual([null, null, "accept", "accept", "accept"]);
    expect(pushes.map((p) => p.text)).toEqual(["", "", "Ho", "la", " mundo"]);
    expect(end.verdict).toBe("accept");
    expect(text).toBe("Hola mundo");
  });

  it("waits when a CRLF is split between its two characters", () => {
    const { pushes, text } = run(["ACCEPT\r", "\nHola"]);
    expect(pushes[0]).toEqual({ verdict: null, text: "" });
    expect(pushes[1]).toEqual({ verdict: "accept", text: "Hola" });
    expect(text).toBe("Hola");
  });

  it("gives the same result for any way of splitting the stream", () => {
    const whole = "  Clarify \r\nWhich language do you mean?\nREFUSE";
    for (let cut = 0; cut <= whole.length; cut += 1) {
      const split = run([whole.slice(0, cut), whole.slice(cut)]);
      expect(split.end.verdict).toBe("clarify");
      expect(split.text).toBe("Which language do you mean?\nREFUSE");
    }
    const oneChar = run([...whole]);
    expect(oneChar.end.verdict).toBe("clarify");
    expect(oneChar.text).toBe("Which language do you mean?\nREFUSE");
  });
});

describe("VerdictParser: a missing or malformed first line fails closed to refuse", () => {
  it.each([
    ["prose instead of a verdict", "Sure! Here is how ser works.\nIt describes identity."],
    ["a word that only starts like a verdict", "ACCEPTED\nbody"],
    ["a verdict followed by other words", "ACCEPT: yes\nbody"],
    ["a verdict in Markdown", "**ACCEPT**\nbody"],
    ["two verdicts on one line", "ACCEPT REFUSE\nbody"],
    ["a verdict in another language", "ACEPTAR\nbody"],
  ])("refuses %s and shows none of the text", (_name, response) => {
    const { end, text } = run([response]);
    expect(end.verdict).toBe("refuse");
    expect(text).toBe("");
  });

  it("refuses an empty response and a response of only whitespace", () => {
    expect(run([]).end.verdict).toBe("refuse");
    expect(run([""]).end.verdict).toBe("refuse");
    expect(run(["  \n\t \n"]).end.verdict).toBe("refuse");
  });

  it("refuses a stream that ends inside a partial verdict", () => {
    const { end, text } = run(["ACC"]);
    expect(end.verdict).toBe("refuse");
    expect(text).toBe("");
  });

  it("decides as soon as the line can no longer be a verdict, without waiting for a newline", () => {
    const parser = new VerdictParser();
    expect(parser.push("Sure")).toEqual({ verdict: "refuse", text: "" });
    expect(parser.push(", here is a long answer with no line break")).toEqual({ verdict: "refuse", text: "" });
    expect(parser.finish()).toEqual({ verdict: "refuse", text: "" });
  });

  it("keeps showing nothing after it has failed closed, even if a verdict word follows", () => {
    const { pushes, end } = run(["Hello\n", "ACCEPT\n", "more text"]);
    expect(pushes.map((p) => p.verdict)).toEqual(["refuse", "refuse", "refuse"]);
    expect(pushes.map((p) => p.text)).toEqual(["", "", ""]);
    expect(end).toEqual({ verdict: "refuse", text: "" });
  });
});

describe("VerdictParser: finish", () => {
  it("returns the same verdict the pushes reported, with no extra text once the line was read", () => {
    const parser = new VerdictParser();
    parser.push("CLARIFY\nWhich one?");
    expect(parser.finish()).toEqual({ verdict: "clarify", text: "" });
  });
});

// A turn that used tools may have written its verdict in a tool step and not again in the final
// step (seen live with Gemini, 005 research R15). The pipeline then passes that verdict as the
// fallback; the final step's own verdict line still wins when it has one.
describe("VerdictParser: a fallback verdict from a tool step", () => {
  function withFallback(chunks: string[], fallback: "accept" | "refuse" | "clarify") {
    const parser = new VerdictParser({ fallback });
    const pushes = chunks.map((chunk) => parser.push(chunk));
    const end = parser.finish();
    return { end, text: pushes.map((p) => p.text).join("") + end.text };
  }

  it("uses the fallback when the first line is not a verdict, and releases the whole text", () => {
    const { end, text } = withFallback(["He seleccionado ", "estos videos.\nSegunda línea."], "accept");
    expect(end.verdict).toBe("accept");
    expect(text).toBe("He seleccionado estos videos.\nSegunda línea.");
  });

  it("prefers the final step's own verdict line", () => {
    expect(withFallback(["REFUSE\n"], "accept").end.verdict).toBe("refuse");
    const { end, text } = withFallback(["ACCEPT\nAquí tienes."], "refuse");
    expect(end.verdict).toBe("accept");
    expect(text).toBe("Aquí tienes.");
  });

  it("still waits while the first line could become a verdict", () => {
    const parser = new VerdictParser({ fallback: "accept" });
    expect(parser.push("ACC")).toEqual({ verdict: null, text: "" });
    expect(parser.push("EPT\nok")).toEqual({ verdict: "accept", text: "ok" });
  });

  it("uses the fallback for an empty final step", () => {
    expect(withFallback([], "accept")).toEqual({ end: { verdict: "accept", text: "" }, text: "" });
  });

  it("carries a refusal too: no text is released", () => {
    const { end, text } = withFallback(["Here is the HTML app you asked for."], "refuse");
    expect(end.verdict).toBe("refuse");
    expect(text).toBe("");
  });
});
