import type { Verdict } from "../conversation/types";
import type { AbortSignalLike, ProviderErrorCode } from "../ports/provider";
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

export type NoticeCode = "context_80" | "interrupted" | "provider_refusal";

export type TurnStatus = "complete" | "interrupted" | "refused";

export type TurnEvent =
  /** The input guard found a key-shaped string and withheld it from the model. */
  | { type: "guard_warning"; code: "key_shape_detected" }
  | { type: "verdict"; verdict: Verdict; ruleIds: string[] }
  /** Already passed through the OutputGuard. */
  | { type: "render"; blocks: SafeBlock[] }
  | { type: "usage"; record: UsageRecord }
  | { type: "notice"; code: NoticeCode }
  | { type: "done"; status: TurnStatus }
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
