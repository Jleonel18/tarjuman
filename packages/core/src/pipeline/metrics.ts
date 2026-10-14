import type { ConversationService } from "../conversation/service";
import type { Effort, ModelInfo } from "../ports/provider";
import { buildUsageRecord, isContextWarning, type ReportedUsage } from "../stats/usage";
import type { TurnEvent } from "./types";

export interface MetricsInput {
  conversations: ConversationService;
  conversationId: string;
  messageId: string;
  /** The provider that served the turn (004 FR-019). */
  providerId: string;
  /** `undefined` when the provider reported nothing: nothing is invented in its place. */
  usage: ReportedUsage | undefined;
  /** `undefined` when the profile names a model the table does not know. */
  model: ModelInfo | undefined;
  configuredEffort: Effort;
  recommendedEffort: Effort;
  /** Model calls and searches of the turn (005). */
  steps?: number;
  searches?: { sourceId: string; count: number }[];
}

/**
 * Stage 5, Metrics: persists the provider-reported usage of one answer and tells the learner when
 * the conversation is nearly out of room. It reports what the provider said and never estimates
 * tokens (SC-005). It emits no events when there is nothing true to report.
 */
export async function runMetrics(input: MetricsInput): Promise<TurnEvent[]> {
  const { usage, model } = input;
  if (usage === undefined || model === undefined) return [];
  const record = await input.conversations.recordUsage(input.messageId, ({ id, createdAt }) =>
    buildUsageRecord({
      id,
      conversationId: input.conversationId,
      messageId: input.messageId,
      providerId: input.providerId,
      model,
      usage,
      configuredEffort: input.configuredEffort,
      recommendedEffort: input.recommendedEffort,
      createdAt,
      ...(input.steps !== undefined && { steps: input.steps }),
      ...(input.searches !== undefined && { searches: input.searches }),
    }),
  );
  const events: TurnEvent[] = [{ type: "usage", record }];
  if (isContextWarning(record.contextRatio)) events.push({ type: "notice", code: "context_80" });
  return events;
}
