import type { PermissionDenial } from "../capabilities/permission-broker";
import type { Verdict } from "../conversation/types";
import type { AbortSignalLike, ProviderErrorCode } from "../ports/provider";
import type { ResourceCard } from "../search/resource-card";
import type { UsageRecord } from "../stats/types";

/**
 * Pipeline contract (contracts/pipeline.md). Stage order is fixed in the implementation and is
 * not part of this public surface: InputGuard, ContextAssembler, ModelCall, OutputGuard, Metrics.
 */

export interface UntrustedMaterial {
  source: "user_paste" | "external";
  text: string;
}

export interface TurnInput {
  conversationId: string;
  capabilityId: string;
  userText: string;
  untrustedMaterial?: UntrustedMaterial[];
}

export type NoticeCode =
  | "context_80"
  | "interrupted"
  | "provider_refusal"
  /** A later search failed after an earlier one worked: the cards come from what was found (005). */
  | "search_incomplete"
  /** A search was refused for its key: missing, rejected, or the API not enabled (005 FR-010). */
  | "search_key_error"
  /** The source's daily allowance ran out (005). */
  | "search_quota";

/**
 * `consent_required`: the model asked to search a source the learner has not agreed to. Nothing was
 * sent and nothing is kept; the app asks, and on agreement sends the same message as a new turn (005).
 */
export type TurnStatus = "complete" | "interrupted" | "refused" | "consent_required";

export type TurnEvent =
  /** The input guard found a key-shaped string and withheld it from the model. */
  | { type: "guard_warning"; code: "key_shape_detected" }
  | { type: "verdict"; verdict: Verdict; ruleIds: string[] }
  /** Already passed through the OutputGuard. */
  | { type: "render"; blocks: SafeBlock[] }
  | { type: "usage"; record: UsageRecord }
  | { type: "notice"; code: NoticeCode }
  /** A tool is running and the learner waits (005): "Searching…". */
  | { type: "status"; code: "searching" }
  /** The resource cards of the answer, once, after the last step and only for an accepted answer. */
  | { type: "resources"; cards: ResourceCard[] }
  /** A tool call was refused by the permission broker. Metrics only; it names no payload. */
  | { type: "permission_denied"; denial: PermissionDenial }
  | { type: "done"; status: TurnStatus; /** Set with `consent_required`. */ sourceId?: string }
  | { type: "error"; code: ProviderErrorCode; retryAfterSeconds?: number };

export interface Pipeline {
  /** Emits exactly one `done` or `error` per turn. */
  run(turn: TurnInput, signal: AbortSignalLike): AsyncIterable<TurnEvent>;
}

/**
 * The only shapes model output can take once rendered. Deliberately absent: images, raw HTML,
 * scripts, iframes, styles, and event handlers. Remote resources can therefore never auto-load.
 */
export type SafeInline =
  | { type: "text"; text: string }
  | { type: "emphasis"; children: SafeInline[] }
  | { type: "strong"; children: SafeInline[] }
  | { type: "code"; text: string }
  | {
      /** Inert until the user acts; `destinationDisplay` is the real, visible destination. */
      type: "link";
      children: SafeInline[];
      destination: string;
      destinationDisplay: string;
    }
  | { type: "break" };

export type SafeBlock =
  | { type: "paragraph"; children: SafeInline[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: SafeInline[] }
  | { type: "list"; ordered: boolean; items: SafeBlock[][] }
  | { type: "blockquote"; children: SafeBlock[] }
  | { type: "code_block"; language?: string; text: string }
  | { type: "table"; header: SafeInline[][]; rows: SafeInline[][][] };
