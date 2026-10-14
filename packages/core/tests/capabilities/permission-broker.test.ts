import { describe, expect, it } from "vitest";
import {
  PermissionBroker,
  PermissionDeniedError,
  type BrokerServices,
  type PermissionDenial,
} from "../../src/capabilities/permission-broker";
import { CapabilityRegistry } from "../../src/capabilities/registry";
import type { Capability, Permission, ToolContext, ToolDeclaration } from "../../src/capabilities/types";

const NETWORK: Permission = { kind: "network", allowedHosts: ["dictionary.example", "API.Words.example"] };
const READ_MESSAGES: Permission = { kind: "storage", collections: ["messages"], access: "read" };
const WRITE_SETTINGS: Permission = { kind: "storage", collections: ["settings"], access: "write" };
const NOTICE: Permission = { kind: "ui", surface: "notice" };

function tool(name: string, requiredPermissions: Permission[]): ToolDeclaration {
  return {
    name,
    description: { en: "A test tool." },
    inputSchema: { type: "object", additionalProperties: false },
    requiredPermissions,
    sideEffecting: false,
    handler: async () => ({ ok: true, output: null }),
  };
}

/** A capability whose `everything` tool holds every permission and `bare` holds none. */
function capability(): Readonly<Capability> {
  const all = [NETWORK, READ_MESSAGES, WRITE_SETTINGS, NOTICE];
  return new CapabilityRegistry().register({
    id: "brokered",
    version: "1.0.0",
    contractVersion: "1.0.0",
    tools: [tool("everything", all), tool("bare", [])],
    permissions: all,
    domainRules: [],
    promptFragments: {},
    i18n: {},
  });
}

function world() {
  const denials: PermissionDenial[] = [];
  const fetched: string[] = [];
  const stored: unknown[] = [];
  const notices: string[] = [];
  const services: BrokerServices = {
    fetch: async (url) => {
      fetched.push(url);
      return { status: 200, text: "ok" };
    },
    storage: {
      get: async (collection, id) => ({ collection, id }),
      put: async (_collection, value) => {
        stored.push(value);
      },
    },
    notice: (capabilityId, key) => notices.push(`${capabilityId}:${key}`),
  };
  const broker = new PermissionBroker({ capability: capability(), services, onDenial: (d) => denials.push(d) });
  const ctx = (name: string): ToolContext => {
    const decision = broker.authorize(name);
    if (!decision.ok) throw new Error(`unexpected denial of ${name}`);
    return broker.contextFor(decision.tool);
  };
  return { broker, ctx, denials, fetched, stored, notices };
}

async function denied(action: Promise<unknown>): Promise<PermissionDenial> {
  const error = await action.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PermissionDeniedError);
  return (error as PermissionDeniedError).denial;
}

describe("PermissionBroker.authorize", () => {
  it("allows a declared tool", () => {
    const { broker, denials } = world();
    const decision = broker.authorize("everything");
    expect(decision.ok && decision.tool.name).toBe("everything");
    expect(denials).toEqual([]);
  });

  it("denies a tool the capability did not declare, with a typed denial and a metrics event", () => {
    const { broker, denials } = world();
    const decision = broker.authorize("delete_everything");
    const expected: PermissionDenial = {
      type: "permission_denied",
      capabilityId: "brokered",
      toolName: "delete_everything",
      permission: "tool",
      reason: "undeclared_tool",
    };
    expect(decision).toEqual({ ok: false, denial: expected });
    expect(denials).toEqual([expected]);
  });
});

describe("ToolContext: undeclared permissions", () => {
  it("denies every helper to a tool that declared no permission, and reports each denial", async () => {
    const { ctx, denials, fetched, stored, notices } = world();
    const bare = ctx("bare");
    expect((await denied(bare.net.fetch("https://dictionary.example/word"))).reason).toBe("undeclared_permission");
    expect((await denied(bare.storage.get("messages", "m1"))).reason).toBe("undeclared_permission");
    expect((await denied(bare.storage.put("settings", { id: "s" }))).reason).toBe("undeclared_permission");
    expect(() => bare.ui.notice("capability.brokered.hint")).toThrow(PermissionDeniedError);
    expect(denials.map((d) => [d.toolName, d.permission, d.reason])).toEqual([
      ["bare", "network", "undeclared_permission"],
      ["bare", "storage", "undeclared_permission"],
      ["bare", "storage", "undeclared_permission"],
      ["bare", "ui", "undeclared_permission"],
    ]);
    expect([fetched, stored, notices]).toEqual([[], [], []]);
  });

  it("checks the tool's own permissions, not everything the capability declared (least privilege)", async () => {
    const { broker, denials } = world();
    // The capability holds a network permission, but this tool did not ask for it.
    const decision = broker.authorize("bare");
    if (!decision.ok) throw new Error("expected allow");
    await denied(broker.contextFor(decision.tool).net.fetch("https://dictionary.example/"));
    expect(denials).toHaveLength(1);
  });
});

describe("ToolContext.net.fetch", () => {
  it("reaches an allowed host over https", async () => {
    const { ctx, fetched } = world();
    expect(await ctx("everything").net.fetch("https://dictionary.example/define?w=ser")).toEqual({ status: 200, text: "ok" });
    expect(await ctx("everything").net.fetch("https://api.words.example:8443/v1")).toEqual({ status: 200, text: "ok" });
    expect(fetched).toEqual(["https://dictionary.example/define?w=ser", "https://api.words.example:8443/v1"]);
  });

  it.each([
    "https://evil.example/",
    "https://dictionary.example.evil.example/",
    "https://sub.dictionary.example/",
    "https://dictionary.example@evil.example/",
    "https://dictionary.example\\@evil.example/",
    "http://dictionary.example/",
    "//dictionary.example/",
    "javascript:alert(1)",
    "dictionary.example",
    "",
  ])("denies %j and never calls the network", async (url) => {
    const { ctx, denials, fetched } = world();
    const denial = await denied(ctx("everything").net.fetch(url));
    expect(denial).toMatchObject({ permission: "network", reason: "host_not_allowed", toolName: "everything" });
    expect(denials).toHaveLength(1);
    expect(fetched).toEqual([]);
  });
});

describe("ToolContext.storage", () => {
  it("reads and writes only the declared collections with the declared access", async () => {
    const { ctx, stored } = world();
    const tools = ctx("everything");
    expect(await tools.storage.get("messages", "m1")).toEqual({ collection: "messages", id: "m1" });
    await tools.storage.put("settings", { id: "s1" });
    expect(stored).toEqual([{ id: "s1" }]);
  });

  it("denies a collection that was not declared", async () => {
    const { ctx, denials } = world();
    expect(await denied(ctx("everything").storage.get("profile", "profile"))).toMatchObject({
      permission: "storage",
      reason: "collection_not_allowed",
    });
    expect(denials).toHaveLength(1);
  });

  it("denies an access mode that was not declared", async () => {
    const { ctx, stored } = world();
    // `messages` is declared read-only and `settings` write-only.
    expect((await denied(ctx("everything").storage.put("messages", { id: "m1" }))).reason).toBe("access_not_allowed");
    expect((await denied(ctx("everything").storage.get("settings", "s1"))).reason).toBe("access_not_allowed");
    expect(stored).toEqual([]);
  });
});

describe("ToolContext.ui.notice", () => {
  it("shows a notice for a tool that declared the surface, tagged with the capability", () => {
    const { ctx, notices } = world();
    ctx("everything").ui.notice("capability.brokered.saved");
    expect(notices).toEqual(["brokered:capability.brokered.saved"]);
  });
});

describe("ToolContext shape", () => {
  it("is frozen and holds only the brokered helpers", () => {
    const { ctx } = world();
    const tools = ctx("everything");
    expect(Object.isFrozen(tools)).toBe(true);
    expect(Object.keys(tools).sort()).toEqual(["capabilityId", "net", "storage", "ui"]);
    expect(Object.keys(tools.net)).toEqual(["fetch"]);
    expect(Object.keys(tools.storage).sort()).toEqual(["get", "put"]);
    expect(Object.keys(tools.ui)).toEqual(["notice"]);
    expect(tools.capabilityId).toBe("brokered");
  });
});
