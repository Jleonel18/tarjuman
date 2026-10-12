import type { ToolDeclaration } from "../capabilities/types";
import type { Segment } from "../conversation/types";

export interface TaintCheck {
  tool: Pick<ToolDeclaration, "name" | "sideEffecting">;
  /** Every segment that went into the turn: the user's text and any pasted or external material. */
  segments: readonly Segment[];
  /** Set only by an explicit user action in the UI, never by anything the model wrote. */
  userConfirmed?: boolean | undefined;
}

export type TaintDecision = { outcome: "allow" } | { outcome: "needs_confirmation"; toolName: string };

/**
 * FR-010: a side-effecting tool call in a turn that contains any `untrusted` segment waits for the
 * user. Text the model could have been steered by must not be able to act on its own.
 */
export function checkTaint({ tool, segments, userConfirmed }: TaintCheck): TaintDecision {
  if (!tool.sideEffecting) return { outcome: "allow" };
  if (!segments.some((s) => s.trust === "untrusted")) return { outcome: "allow" };
  if (userConfirmed === true) return { outcome: "allow" };
  return { outcome: "needs_confirmation", toolName: tool.name };
}
