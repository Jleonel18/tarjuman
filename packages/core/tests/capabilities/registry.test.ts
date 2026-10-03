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
