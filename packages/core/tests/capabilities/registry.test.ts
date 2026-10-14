import { describe, expect, it } from "vitest";
import { CapabilityRegistrationError, CapabilityRegistry } from "../../src/capabilities/registry";

const text = (s: string) => ({ en: s });
const rule = (id: string) => ({
  id,
  version: "1.0.0",
  description: "Keeps answers on language learning.",
  refusalTemplateKey: "refusal.out_of_scope",
  acceptCases: [{ input: "What does ser mean?", locale: "en" }],
  refuseCases: [{ input: "Write me an HTML app", locale: "en" }],
});

function validCapability(overrides: Record<string, unknown> = {}) {
  return {
    id: "demo",
    version: "1.0.0",
    contractVersion: "1.0.0",
    tools: [],
    permissions: [],
    domainRules: [rule("scope.demo")],
    promptFragments: { intro: { layer: "capability", text: text("Explain clearly.") } },
    i18n: { en: { "capability.demo.title": "Demo" } },
    ...overrides,
  };
}

function rejects(candidate: unknown, registry = new CapabilityRegistry()) {
  try {
    registry.register(candidate);
  } catch (error) {
    expect(error).toBeInstanceOf(CapabilityRegistrationError);
    return (error as CapabilityRegistrationError).message;
  }
  throw new Error("expected registration to be rejected");
}

describe("CapabilityRegistry.register", () => {
  it("accepts a valid capability and returns a frozen copy", () => {
    const registry = new CapabilityRegistry();
    const input = validCapability();
    const registered = registry.register(input);
    expect(registered.id).toBe("demo");
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.domainRules[0])).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(registry.get("demo")).toBe(registered);
  });

  it("rejects duplicate capability ids and duplicate rule ids", () => {
    const registry = new CapabilityRegistry();
    registry.register(validCapability());
    expect(rejects(validCapability(), registry)).toContain("already registered");
    expect(rejects(validCapability({ id: "other", i18n: { en: { "capability.other.title": "Other" } } }), registry)).toContain("scope.demo");
  });

  it("rejects a rule with no accept or no refuse cases", () => {
    expect(rejects(validCapability({ domainRules: [{ ...rule("scope.a"), acceptCases: [] }] }))).toContain("acceptCases");
    expect(rejects(validCapability({ domainRules: [{ ...rule("scope.a"), refuseCases: [] }] }))).toContain("refuseCases");
  });

  it("rejects a tool that needs a permission the capability did not declare", () => {
    const tool = {
      name: "lookup",
      description: text("Looks things up."),
      inputSchema: { type: "object", additionalProperties: false },
      requiredPermissions: [{ kind: "network", allowedHosts: ["example.com"] }],
      sideEffecting: false,
      handler: async () => ({ ok: true, output: null }),
    };
    expect(rejects(validCapability({ tools: [tool] }))).toContain("did not declare");
    const ok = validCapability({ tools: [tool], permissions: [{ kind: "network", allowedHosts: ["example.com"] }] });
    expect(() => new CapabilityRegistry().register(ok)).not.toThrow();
  });

  it("rejects prompt fragments that target any layer other than capability", () => {
    for (const layer of ["security", "domain_scope", "tone"]) {
      expect(rejects(validCapability({ promptFragments: { x: { layer, text: text("hi") } } }))).toContain("promptFragments");
    }
  });

  it("rejects a mismatched contractVersion", () => {
    expect(rejects(validCapability({ contractVersion: "2.0.0" }))).toContain("contractVersion");
  });

  it("rejects i18n keys outside the capability's namespace", () => {
    expect(rejects(validCapability({ i18n: { en: { "common.title": "x" } } }))).toContain("capability.demo.");
  });

  it("rejects tool schemas that allow additional properties", () => {
    const tool = {
      name: "lookup",
      description: text("Looks things up."),
      inputSchema: { type: "object" },
      requiredPermissions: [],
      sideEffecting: false,
      handler: async () => ({ ok: true, output: null }),
    };
    expect(rejects(validCapability({ tools: [tool] }))).toContain("additionalProperties");
  });
});

/** T141: each invalid declaration in the contract is rejected on its own; the valid one registers. */
describe("registry validation matrix (US8)", () => {
  const tool = (requiredPermissions: unknown[]) => ({
    name: "lookup",
    description: text("Looks things up."),
    inputSchema: { type: "object", additionalProperties: false },
    requiredPermissions,
    sideEffecting: false,
    handler: async () => ({ ok: true, output: null }),
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["a rule without accept cases", { domainRules: [{ ...rule("scope.a"), acceptCases: [] }] }, "acceptCases"],
    ["a rule without refuse cases", { domainRules: [{ ...rule("scope.a"), refuseCases: [] }] }, "refuseCases"],
    [
      "a tool naming an undeclared permission",
      { tools: [tool([{ kind: "storage", collections: ["usage"], access: "read" }])] },
      "did not declare",
    ],
    [
      "a tool naming a narrower variant of a declared permission",
      {
        tools: [tool([{ kind: "network", allowedHosts: ["other.example"] }])],
        permissions: [{ kind: "network", allowedHosts: ["example.com"] }],
      },
      "did not declare",
    ],
    ["a fragment in the security layer", { promptFragments: { x: { layer: "security", text: text("hi") } } }, "promptFragments"],
    ["a fragment in the scope layer", { promptFragments: { x: { layer: "domain_scope", text: text("hi") } } }, "promptFragments"],
    ["a fragment with no layer", { promptFragments: { x: { text: text("hi") } } }, "promptFragments"],
    ["an unknown contractVersion", { contractVersion: "1.2.0" }, "contractVersion"],
    ["a missing contractVersion", { contractVersion: undefined }, "contractVersion"],
  ])("rejects %s", (_name, overrides, message) => {
    expect(rejects(validCapability(overrides))).toContain(message);
  });

  it("rejects a duplicate id", () => {
    const registry = new CapabilityRegistry();
    registry.register(validCapability({ domainRules: [] }));
    expect(rejects(validCapability({ domainRules: [] }), registry)).toContain("already registered");
  });

  it("registers a valid capability with a tool and the permissions it needs", () => {
    const permissions = [
      { kind: "network", allowedHosts: ["example.com"] },
      { kind: "ui", surface: "notice" },
    ];
    const registry = new CapabilityRegistry();
    const registered = registry.register(validCapability({ tools: [tool(permissions)], permissions }));
    expect(registered.tools.map((t) => t.name)).toEqual(["lookup"]);
    expect(registry.list().map((c) => c.id)).toEqual(["demo"]);
  });
});

/** 005: contract 1.1.0 (contracts/capability-contract-1.1.md). Every addition is optional. */
describe("contract 1.1.0", () => {
  const SEARCH = { kind: "search", sources: ["youtube"] };
  const presentation = (overrides: Record<string, unknown> = {}) => ({
    name: "show_things",
    description: text("Shows things."),
    inputSchema: { type: "object", additionalProperties: false },
    requiredPermissions: [],
    sideEffecting: false,
    presentation: "resources",
    ...overrides,
  });
  const search = (overrides: Record<string, unknown> = {}) => ({
    name: "search_things",
    description: text("Searches."),
    inputSchema: { type: "object", additionalProperties: false },
    requiredPermissions: [SEARCH],
    sideEffecting: false,
    handler: async () => ({ ok: true, output: null }),
    ...overrides,
  });
  const v11 = (overrides: Record<string, unknown> = {}) => validCapability({ contractVersion: "1.1.0", ...overrides });

  it("accepts 1.0.0 and 1.1.0, and language-qa style declarations are unchanged", () => {
    const registry = new CapabilityRegistry();
    expect(registry.register(validCapability()).contractVersion).toBe("1.0.0");
    expect(registry.register(v11({ id: "other", domainRules: [], i18n: {} })).contractVersion).toBe("1.1.0");
  });

  it("accepts a search permission, a presentation tool without a handler, and all_conversations", () => {
    const registry = new CapabilityRegistry();
    const registered = registry.register(
      v11({
        permissions: [SEARCH],
        tools: [search(), presentation()],
        availability: "all_conversations",
      }),
    );
    expect(registered.availability).toBe("all_conversations");
    expect(registered.tools.find((t) => t.name === "show_things")?.presentation).toBe("resources");
  });

  it("defaults availability to the capability's own conversations", () => {
    expect(new CapabilityRegistry().register(v11()).availability).toBeUndefined();
  });

  it.each([
    ["availability", { availability: "all_conversations" }],
    ["a search permission", { permissions: [SEARCH], tools: [search()] }],
    ["a presentation tool", { tools: [presentation()] }],
  ])("rejects %s in a 1.0.0 capability", (_name, overrides) => {
    expect(rejects(validCapability(overrides))).toMatch(/1\.1\.0|contractVersion/);
  });

  it.each([
    ["a side-effecting presentation tool", presentation({ sideEffecting: true }), "presentation"],
    ["a presentation tool with permissions", presentation({ requiredPermissions: [SEARCH] }), "presentation"],
  ])("rejects %s", (_name, tool, message) => {
    expect(rejects(v11({ permissions: [SEARCH], tools: [tool] }))).toContain(message);
  });

  it("requires a handler on every tool that is not a presentation tool", () => {
    const noHandler = search({ handler: undefined });
    expect(rejects(v11({ permissions: [SEARCH], tools: [noHandler] }))).toContain("handler");
  });

  it("rejects an unknown presentation kind and an unknown availability", () => {
    expect(rejects(v11({ tools: [presentation({ presentation: "popup" })] }))).toContain("presentation");
    expect(rejects(v11({ availability: "everywhere" }))).toContain("availability");
  });

  it("requires a search permission to list at least one known source id", () => {
    expect(rejects(v11({ permissions: [{ kind: "search", sources: [] }] }))).toContain("sources");
    expect(rejects(v11({ permissions: [{ kind: "search", sources: ["vimeo"] }] }))).toContain("vimeo");
    const registry = new CapabilityRegistry({ searchSources: ["vimeo"] });
    expect(() => registry.register(v11({ permissions: [{ kind: "search", sources: ["vimeo"] }] }))).not.toThrow();
  });

  it("rejects a second all_conversations capability", () => {
    const registry = new CapabilityRegistry();
    registry.register(v11({ availability: "all_conversations" }));
    const second = v11({
      id: "second",
      domainRules: [],
      i18n: {},
      availability: "all_conversations",
    });
    expect(rejects(second, registry)).toContain("all_conversations");
    expect(() => registry.register(v11({ id: "third", domainRules: [], i18n: {} }))).not.toThrow();
  });

  it("forTurn returns the conversation's capability, then the all_conversations one", () => {
    const registry = new CapabilityRegistry();
    registry.register(validCapability());
    registry.register(v11({ id: "curation", domainRules: [], i18n: {}, availability: "all_conversations" }));
    expect(registry.forTurn("demo").map((c) => c.id)).toEqual(["demo", "curation"]);
    // The all_conversations capability itself is not listed twice.
    expect(registry.forTurn("curation").map((c) => c.id)).toEqual(["curation"]);
    // An unknown conversation capability contributes nothing, but the shared one still applies.
    expect(registry.forTurn("missing").map((c) => c.id)).toEqual(["curation"]);
  });

  it("forTurn without an all_conversations capability returns just the conversation's", () => {
    const registry = new CapabilityRegistry();
    registry.register(validCapability());
    expect(registry.forTurn("demo").map((c) => c.id)).toEqual(["demo"]);
    expect(registry.forTurn("missing")).toEqual([]);
  });
});
