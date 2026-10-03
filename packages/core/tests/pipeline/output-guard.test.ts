import { describe, expect, it } from "vitest";
import { OutputGuard, renderSafeBlocks } from "../../src/pipeline/output-guard";

const json = (value: unknown) => JSON.stringify(value);

describe("renderSafeBlocks", () => {
  it("renders paragraphs, emphasis, strong, and inline code", () => {
    const blocks = renderSafeBlocks("Use *ser* for **identity**, e.g. `soy`.");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Use " },
          { type: "emphasis", children: [{ type: "text", text: "ser" }] },
          { type: "text", text: " for " },
          { type: "strong", children: [{ type: "text", text: "identity" }] },
          { type: "text", text: ", e.g. " },
          { type: "code", text: "soy" },
          { type: "text", text: "." },
        ],
      },
    ]);
  });

  it("renders headings, lists, blockquotes, code blocks, and tables", () => {
    const blocks = renderSafeBlocks(
      ["# Title", "", "- one", "- two", "", "> quoted", "", "```js", "x()", "```", "", "| a | b |", "|---|---|", "| 1 | 2 |"].join("\n"),
    );
    expect(blocks.map((b) => b.type)).toEqual(["heading", "list", "blockquote", "code_block", "table"]);
    const table = blocks[4];
    expect(table?.type === "table" && table.header).toHaveLength(2);
    expect(table?.type === "table" && table.rows).toHaveLength(1);
  });

  it("turns raw HTML into literal text", () => {
    const blocks = renderSafeBlocks('<script>alert(1)</script> and <img src=x onerror=alert(1)>');
    const out = json(blocks);
    expect(out).toContain("<script>");
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
    expect(out).not.toContain('"type":"image"');
  });

  it("never produces an image node and keeps only the alt text", () => {
    const blocks = renderSafeBlocks("![a cat](https://evil.example/track.png)");
    expect(json(blocks)).not.toContain("evil.example");
    expect(json(blocks)).toContain("a cat");
    expect(json(blocks)).not.toContain("image");
  });

  it("keeps safe links with their real destination visible", () => {
    const blocks = renderSafeBlocks("[docs](https://example.com/a?b=1)");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            children: [{ type: "text", text: "docs" }],
            destination: "https://example.com/a?b=1",
            destinationDisplay: "https://example.com/a?b=1",
          },
        ],
      },
    ]);
  });

  it("drops the link, not the words, for unsafe schemes", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "vbscript:x", "//evil.example"]) {
      const out = json(renderSafeBlocks(`[click](${href})`));
      expect(out, href).not.toContain('"type":"link"');
      expect(out, href).toContain("click");
    }
  });

  it("does not linkify bare URLs", () => {
    expect(json(renderSafeBlocks("see https://example.com now"))).not.toContain('"type":"link"');
  });
});

describe("OutputGuard (streaming)", () => {
  it("returns the AST of everything received so far", () => {
    const guard = new OutputGuard();
    expect(json(guard.push("Hola "))).toContain("Hola");
    expect(json(guard.push("mundo"))).toContain("Hola mundo");
  });

  it("keeps a half-received code fence as a code block", () => {
    const guard = new OutputGuard();
    const blocks = guard.push("```\nlet x");
    expect(blocks[0]?.type).toBe("code_block");
  });
});
