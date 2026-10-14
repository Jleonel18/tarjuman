import type { LanguageCode } from "../profile/types";
import type { StoredResourceCard } from "../search/resource-card";

/**
 * How much authority a piece of text carries (FR-007). User-typed text is `user`; pasted material
 * and any external content is `untrusted`; only app-authored instructions are `trusted`.
 */
export type Trust = "trusted" | "user" | "untrusted";

export interface Segment {
  trust: Trust;
  text: string;
}

export type MessageStatus = "complete" | "streaming" | "interrupted" | "refused";

/** Domain verdict parsed from the model's first line (research R8). */
export type Verdict = "accept" | "refuse" | "clarify";

export type MessageAuthor = "user" | "assistant" | "system";

export interface Message {
  id: string;
  conversationId: string;
  /** `system` is for app-generated notices only (e.g. a key-shape warning). */
  author: MessageAuthor;
  segments: Segment[];
  status: MessageStatus;
  verdict: Verdict | null;
  /** Rule ids with versions, e.g. "scope.language-learning@1.0.0". */
  ruleIds: string[];
  usageId: string | null;
  createdAt: string;
  /** Resource cards shown with this answer, at most 10 (005). Aged by the 30-day retention rule. */
  resources?: StoredResourceCard[];
  /** How many searches this turn made. A turn with searches renders its prose links strictly (FR-013). */
  searchCount?: number;
}

export interface Conversation {
  id: string;
  title: string;
  /** Owning capability, e.g. "language-qa". */
  capabilityId: string;
  /** Languages at creation, so history renders correctly after settings change. */
  languageSnapshot: { mediation: LanguageCode; target: LanguageCode };
  createdAt: string;
  updatedAt: string;
}
