import type { Collection } from "../ports/storage";
import type { Capability, Permission, ToolContext, ToolDeclaration, ToolSearchOutcome } from "./types";

export type DenialReason =
  | "undeclared_tool"
  | "undeclared_permission"
  | "host_not_allowed"
  | "collection_not_allowed"
  | "source_not_allowed"
  | "access_not_allowed";

/** The metrics event for a refused call (US8-2). It names what was refused, never the payload. */
export interface PermissionDenial {
  type: "permission_denied";
  capabilityId: string;
  toolName: string;
  permission: Permission["kind"] | "tool";
  reason: DenialReason;
}

/** Thrown into a tool handler by a `ToolContext` helper it was not allowed to use. */
export class PermissionDeniedError extends Error {
  readonly denial: PermissionDenial;

  constructor(denial: PermissionDenial) {
    super(`Permission denied: ${denial.permission} (${denial.reason})`);
    this.name = "PermissionDeniedError";
    this.denial = denial;
  }
}

/**
 * What the host can do on a tool's behalf. The broker never hands these to a tool directly: each
 * is wrapped in a check against the tool's declared permissions. A missing service means the host
 * does not offer it.
 */
export interface BrokerServices {
  fetch?: (url: string) => Promise<{ status: number; text: string }>;
  /** A `StoragePort` fits; the host may also pass a narrower view. */
  storage?: ToolContext["storage"];
  notice?: (capabilityId: string, messageKey: string) => void;
  /**
   * Runs a search on a tool's behalf. The host (the pipeline) applies consent and the switch,
   * numbers the results for the turn, and strips links; the broker only checks the permission.
   */
  search?: (
    sourceId: string,
    req: { query: string; kind: "any" | "music"; captionsOnly: boolean; targetLanguage: string },
  ) => Promise<ToolSearchOutcome>;
  /** The learner's target language. The broker puts it in every search: a tool cannot choose it. */
  targetLanguage?: string;
}

export interface PermissionBrokerDeps {
  capability: Readonly<Capability>;
  services: BrokerServices;
  /** Receives every denial as a metrics event. */
  onDenial: (denial: PermissionDenial) => void;
}

export type ToolAuthorization =
  | { ok: true; tool: Readonly<ToolDeclaration> }
  | { ok: false; denial: PermissionDenial };

/** The one source `ctx.search.videos` reaches in this contract version. */
const VIDEO_SOURCE = "youtube";

// The core has no `URL` type, so the host is read with a pattern. Only `https:` is allowed, and
// the host must be followed by a port, a path, a query, a fragment, or the end: `user@host`,
// backslashes, and other tricks that make the real host differ from the visible one never match.
const HTTPS_HOST = /^https:\/\/([a-z0-9.-]+)(?::\d{1,5})?(?:[/?#]|$)/i;

function hostOf(url: string): string | undefined {
  if (/[\s\\]/.test(url)) return undefined;
  return HTTPS_HOST.exec(url)?.[1]?.toLowerCase();
}

/**
 * Checks every tool invocation against what was declared (FR-023, US8-2). A tool gets a
 * least-privilege `ToolContext`: only the permissions that tool itself declared, not everything
 * its capability holds. The context holds no provider, secret, stage, or raw storage.
 */
export class PermissionBroker {
  readonly #deps: PermissionBrokerDeps;

  constructor(deps: PermissionBrokerDeps) {
    this.#deps = deps;
    Object.freeze(this);
  }

  /** A tool the capability did not declare is denied before anything runs. */
  authorize(toolName: string): ToolAuthorization {
    const tool = this.#deps.capability.tools.find((t) => t.name === toolName);
    if (tool) return { ok: true, tool };
    return { ok: false, denial: this.#report(toolName, "tool", "undeclared_tool") };
  }

  contextFor(tool: Readonly<ToolDeclaration>): ToolContext {
    const { capability, services } = this.#deps;
    const permissions = tool.requiredPermissions;
    const deny = (permission: Permission["kind"], reason: DenialReason): PermissionDeniedError =>
      new PermissionDeniedError(this.#report(tool.name, permission, reason));
    const unavailable = (what: string): Error => new Error(`The host offers no ${what} service.`);

    const storageCheck = (collection: Collection, access: "read" | "write"): void => {
      const storage = permissions.filter((p) => p.kind === "storage");
      if (storage.length === 0) throw deny("storage", "undeclared_permission");
      const forCollection = storage.filter((p) => p.collections.includes(collection));
      if (forCollection.length === 0) throw deny("storage", "collection_not_allowed");
      if (!forCollection.some((p) => p.access === access)) throw deny("storage", "access_not_allowed");
    };

    const ctx: ToolContext = {
      capabilityId: capability.id,
      net: Object.freeze({
        fetch: async (url: string) => {
          const network = permissions.filter((p) => p.kind === "network");
          if (network.length === 0) throw deny("network", "undeclared_permission");
          const host = hostOf(url);
          const allowed = network.some((p) => p.allowedHosts.some((h) => h.toLowerCase() === host));
          if (host === undefined || !allowed) throw deny("network", "host_not_allowed");
          if (!services.fetch) throw unavailable("network");
          return services.fetch(url);
        },
      }),
      storage: Object.freeze({
        get: async (collection: Collection, id: string) => {
          storageCheck(collection, "read");
          if (!services.storage) throw unavailable("storage");
          return services.storage.get(collection, id);
        },
        put: async (collection: Collection, value: { id: string }) => {
          storageCheck(collection, "write");
          if (!services.storage) throw unavailable("storage");
          await services.storage.put(collection, value);
        },
      }),
      search: Object.freeze({
        videos: async (req) => {
          const search = permissions.filter((p) => p.kind === "search");
          if (search.length === 0) throw deny("search", "undeclared_permission");
          if (!search.some((p) => p.sources.includes(VIDEO_SOURCE))) throw deny("search", "source_not_allowed");
          if (!services.search || services.targetLanguage === undefined) throw unavailable("search");
          // Only the three fields a tool may set are read; anything else on the object is ignored.
          return services.search(VIDEO_SOURCE, {
            query: req.query,
            kind: req.kind === "music" ? "music" : "any",
            captionsOnly: req.captionsOnly === true,
            targetLanguage: services.targetLanguage,
          });
        },
      }),
      ui: Object.freeze({
        notice: (messageKey: string) => {
          if (!permissions.some((p) => p.kind === "ui" && p.surface === "notice")) {
            throw deny("ui", "undeclared_permission");
          }
          if (!services.notice) throw unavailable("notice");
          services.notice(capability.id, messageKey);
        },
      }),
    };
    return Object.freeze(ctx);
  }

  #report(toolName: string, permission: PermissionDenial["permission"], reason: DenialReason): PermissionDenial {
    const denial: PermissionDenial = {
      type: "permission_denied",
      capabilityId: this.#deps.capability.id,
      toolName,
      permission,
      reason,
    };
    this.#deps.onDenial(denial);
    return denial;
  }
}
