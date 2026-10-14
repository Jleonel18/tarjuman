import { describe, expect, it } from "vitest";
import * as core from "../../src/index";
import { PermissionBroker } from "../../src/capabilities/permission-broker";
import { CapabilityRegistry } from "../../src/capabilities/registry";
import type { Capability } from "../../src/capabilities/types";
import { ContextAssembler } from "../../src/pipeline/context-assembler";
import { OutputGuard } from "../../src/pipeline/output-guard";
import { Pipeline } from "../../src/pipeline/pipeline";
import { SecretHandle, sealSecret } from "../../src/ports/secret-handle";

/**
 * US8-3: no capability, and no code holding only the public API, can reorder, skip, or replace a
 * pipeline stage, and nothing a capability receives carries a provider, a secret, or a stage.
 * The lint half (a `ProviderPort` import outside the allowed paths) is in
 * tests/architecture/provider-port-imports.test.ts, because it needs the repository scripts.
 */

const capabilityInput = () => ({
  id: "probe",
  version: "1.0.0",
  contractVersion: "1.0.0",
  tools: [
    {
      name: "poke",
      description: { en: "Pokes." },
      inputSchema: { type: "object", additionalProperties: false },
      requiredPermissions: [{ kind: "ui", surface: "notice" }],
      sideEffecting: true,
      handler: async () => ({ ok: true, output: null }),
    },
  ],
  permissions: [{ kind: "ui", surface: "notice" }],
  domainRules: [],
  promptFragments: { intro: { layer: "capability", text: { en: "Be brief." } } },
  i18n: {},
});

function registered(): { registry: CapabilityRegistry; capability: Readonly<Capability> } {
  const registry = new CapabilityRegistry();
  return { registry, capability: registry.register(capabilityInput()) };
}

/** Every object reachable from `root` through own properties, functions included. */
function reachable(root: unknown): unknown[] {
  const seen = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (value === null || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return;
    seen.add(value);
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) visit(descriptor.value);
    }
  };
  visit(root);
  return [...seen];
}

/** True for anything that could reach a model, a key, or a stage. */
function isForbidden(value: unknown): boolean {
  if (value instanceof SecretHandle || value instanceof Pipeline) return true;
  if (value instanceof OutputGuard || value instanceof ContextAssembler) return true;
  if (value === null || typeof value !== "object") return false;
  return "stream" in value || "validateCredential" in value || "listModels" in value;
}

const ownNames = (target: object) => Object.getOwnPropertyNames(target).sort();

describe("stages cannot be reordered, skipped, or replaced", () => {
  it("the pipeline exposes only `run`, and its prototype cannot be patched", () => {
    expect(ownNames(Pipeline.prototype)).toEqual(["constructor", "run"]);
    expect(Object.isFrozen(Pipeline.prototype)).toBe(true);
    expect(() => {
      (Pipeline.prototype as unknown as Record<string, unknown>)["run"] = () => undefined;
    }).toThrow(TypeError);
  });

  it("a pipeline instance has no own state to swap and cannot gain any", () => {
    const pipeline = new Pipeline({} as ConstructorParameters<typeof Pipeline>[0]);
    expect(Reflect.ownKeys(pipeline)).toEqual([]);
    expect(Object.isFrozen(pipeline)).toBe(true);
    expect(() => {
      (pipeline as unknown as Record<string, unknown>)["run"] = () => undefined;
    }).toThrow(TypeError);
  });

  it("the registry has no method that touches stages, and cannot be patched", () => {
    const { registry } = registered();
    expect(ownNames(CapabilityRegistry.prototype)).toEqual(["constructor", "domainRules", "get", "has", "list", "register"]);
    expect(Object.isFrozen(CapabilityRegistry.prototype)).toBe(true);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(() => {
      (registry as unknown as Record<string, unknown>)["get"] = () => undefined;
    }).toThrow(TypeError);
  });

  it("the core exports nothing that adds, orders, or hooks stages", () => {
    const names = Object.keys(core);
    expect(names.filter((name) => /stage|inject|reorder|middleware|hook|plugin|interceptor/i.test(name))).toEqual([]);
  });
});

describe("registry views are read-only", () => {
  it("lists, capabilities, tools, permissions, rules, and fragments are frozen", () => {
    const { registry, capability } = registered();
    for (const value of [registry.list(), registry.domainRules(), capability, capability.tools, capability.tools[0],
      capability.permissions, capability.promptFragments, capability.promptFragments["intro"]]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("a registered capability cannot be changed into a higher layer or a different tool afterwards", () => {
    const { registry } = registered();
    const view = registry.get("probe") as unknown as {
      promptFragments: Record<string, { layer: string }>;
      tools: { sideEffecting: boolean }[];
    };
    expect(() => {
      (view.promptFragments["intro"] as { layer: string }).layer = "security";
    }).toThrow(TypeError);
    expect(() => {
      (view.tools[0] as { sideEffecting: boolean }).sideEffecting = false;
    }).toThrow(TypeError);
    expect(() => (registry.list() as unknown[]).push({})).toThrow(TypeError);
    expect(registry.get("probe")?.promptFragments["intro"]?.layer).toBe("capability");
  });
});

describe("nothing a capability receives carries a provider, a secret, or a stage", () => {
  it("the registered capability", () => {
    expect(reachable(registered().capability).filter(isForbidden)).toEqual([]);
  });

  it("the ToolContext a tool is given", () => {
    const { capability } = registered();
    // Services the host could wrongly pass along are not part of the context.
    const leaky = {
      fetch: async () => ({ status: 200, text: "" }),
      notice: () => {},
      secret: sealSecret("sk-ant-api03-NEVER-IN-CONTEXT"),
      provider: { stream: () => undefined, validateCredential: () => undefined, listModels: () => [] },
    };
    const broker = new PermissionBroker({ capability, services: leaky, onDenial: () => {} });
    const decision = broker.authorize("poke");
    if (!decision.ok) throw new Error("expected allow");
    const ctx = broker.contextFor(decision.tool);
    expect(reachable(ctx).filter(isForbidden)).toEqual([]);
    expect(JSON.stringify(ctx)).not.toContain("NEVER-IN-CONTEXT");
  });
});
