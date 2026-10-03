import type { StoragePort } from "../ports/storage";
import type { LanguageCode } from "../profile/types";
import type { Conversation, Message, MessageStatus, Segment, Verdict } from "./types";

const MAX_TITLE_LENGTH = 80;

export interface ConversationServiceDeps {
  storage: StoragePort;
  /** Injected so the core needs neither `crypto` nor a real clock. Returns an ISO datetime. */
  now: () => string;
  newId: () => string;
}

export interface CreateConversationInput {
  capabilityId: string;
  languageSnapshot: { mediation: LanguageCode; target: LanguageCode };
}

export interface OpenConversation {
  conversation: Conversation;
  messages: Message[];
}

export type FinalStatus = Exclude<MessageStatus, "streaming">;

export interface FinishDetails {
  verdict?: Verdict;
  ruleIds?: string[];
}

/**
 * Conversations and their messages (FR-005). A message starts `streaming` and ends in exactly
 * one final state; a retry never rewrites an interrupted message, it starts a new one.
 */
export class ConversationService {
  readonly #storage: StoragePort;
  readonly #now: () => string;
  readonly #newId: () => string;
  #lastStamp = "";

  constructor(deps: ConversationServiceDeps) {
    this.#storage = deps.storage;
    this.#now = deps.now;
    this.#newId = deps.newId;
  }

  async create(input: CreateConversationInput): Promise<Conversation> {
    const stamp = this.#stamp();
    const conversation: Conversation = {
      id: this.#newId(),
      title: "",
      capabilityId: input.capabilityId,
      languageSnapshot: { ...input.languageSnapshot },
      createdAt: stamp,
      updatedAt: stamp,
    };
    await this.#storage.put("conversations", conversation);
    return conversation;
  }

  /** Most recently updated first. */
  async list(): Promise<Conversation[]> {
    const all = await this.#storage.query<Conversation>("conversations");
    return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  async open(id: string): Promise<OpenConversation | undefined> {
    const conversation = await this.#storage.get<Conversation>("conversations", id);
    if (!conversation) return undefined;
    return { conversation, messages: await this.#messages(id) };
  }

  async rename(id: string, title: string): Promise<Conversation> {
    const clean = title.trim();
    if (clean === "") throw new Error("A conversation title cannot be blank.");
    const conversation = await this.#requireConversation(id);
    return this.#saveConversation({ ...conversation, title: clean.slice(0, MAX_TITLE_LENGTH) });
  }

  /** Removes the conversation, its messages, and its usage records (cascade). */
  async delete(id: string): Promise<void> {
    const query = { index: "conversationId", equals: id };
    for (const message of await this.#storage.query<Message>("messages", query)) {
      await this.#storage.delete("messages", message.id);
    }
    for (const usage of await this.#storage.query<{ id: string }>("usage", query)) {
      await this.#storage.delete("usage", usage.id);
    }
    await this.#storage.delete("conversations", id);
  }

  async addUserMessage(conversationId: string, segments: Segment[]): Promise<Message> {
    const conversation = await this.#requireConversation(conversationId);
    const message = this.#newMessage(conversationId, "user", segments, "complete");
    await this.#storage.put("messages", message);
    const title = conversation.title === "" ? deriveTitle(segments) : conversation.title;
    await this.#saveConversation({ ...conversation, title });
    return message;
  }

  async beginAssistantMessage(conversationId: string): Promise<Message> {
    const conversation = await this.#requireConversation(conversationId);
    const message = this.#newMessage(conversationId, "assistant", [], "streaming");
    await this.#storage.put("messages", message);
    await this.#saveConversation(conversation);
    return message;
  }

  /** Persists each delta as it arrives, so an interruption loses nothing already shown. */
  async appendText(messageId: string, delta: string): Promise<Message> {
    const message = await this.#requireStreaming(messageId);
    const [first, ...rest] = message.segments;
    // Model output is not app-authored, so it never carries `trusted` authority.
    const segments: Segment[] = first
      ? [{ ...first, text: first.text + delta }, ...rest]
      : [{ trust: "untrusted", text: delta }];
    const updated = { ...message, segments };
    await this.#storage.put("messages", updated);
    return updated;
  }

  async finish(messageId: string, status: FinalStatus, details: FinishDetails = {}): Promise<Message> {
    if ((status as MessageStatus) === "streaming") throw new Error("A message cannot finish as streaming.");
    const message = await this.#requireStreaming(messageId);
    const updated: Message = {
      ...message,
      status,
      verdict: details.verdict ?? message.verdict,
      ruleIds: details.ruleIds ?? message.ruleIds,
    };
    await this.#storage.put("messages", updated);
    await this.#saveConversation(await this.#requireConversation(message.conversationId));
    return updated;
  }

  /** The interrupted message stays as it is, marked incomplete; the retry is a new message. */
  async retry(messageId: string): Promise<Message> {
    const message = await this.#requireMessage(messageId);
    if (message.status !== "interrupted") throw new Error("Only an interrupted message can be retried.");
    return this.beginAssistantMessage(message.conversationId);
  }

  /** Strictly increasing, so messages created in the same millisecond keep their order. */
  #stamp(): string {
    let stamp = this.#now();
    if (stamp <= this.#lastStamp) stamp = new Date(Date.parse(this.#lastStamp) + 1).toISOString();
    this.#lastStamp = stamp;
    return stamp;
  }

  #newMessage(
    conversationId: string,
    author: Message["author"],
    segments: Segment[],
    status: MessageStatus,
  ): Message {
    return {
      id: this.#newId(),
      conversationId,
      author,
      segments,
      status,
      verdict: null,
      ruleIds: [],
      usageId: null,
      createdAt: this.#stamp(),
    };
  }

  async #messages(conversationId: string): Promise<Message[]> {
    const rows = await this.#storage.query<Message>("messages", { index: "conversationId", equals: conversationId });
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  }

  async #saveConversation(conversation: Conversation): Promise<Conversation> {
    const updated = { ...conversation, updatedAt: this.#stamp() };
    await this.#storage.put("conversations", updated);
    return updated;
  }

  async #requireConversation(id: string): Promise<Conversation> {
    const conversation = await this.#storage.get<Conversation>("conversations", id);
    if (!conversation) throw new Error("Conversation not found.");
    return conversation;
  }

  async #requireMessage(id: string): Promise<Message> {
    const message = await this.#storage.get<Message>("messages", id);
    if (!message) throw new Error("Message not found.");
    return message;
  }

  async #requireStreaming(id: string): Promise<Message> {
    const message = await this.#requireMessage(id);
    if (message.status !== "streaming") throw new Error("The message is no longer streaming.");
    return message;
  }
}

/** First user-typed text only; pasted material is never used as a title. */
function deriveTitle(segments: Segment[]): string {
  const text = segments.find((s) => s.trust === "user")?.text.replace(/\s+/g, " ").trim() ?? "";
  if (text.length <= MAX_TITLE_LENGTH) return text;
  return `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}
