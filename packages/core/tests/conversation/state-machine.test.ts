import { beforeEach, describe, expect, it } from "vitest";
import { ConversationService } from "../../src/conversation/service";
import type { Message } from "../../src/conversation/types";
import { makeClock, MemoryStorage } from "../helpers/memory-storage";

let storage: MemoryStorage;
let service: ConversationService;

const LANGS = { mediation: "es", target: "ja" };

beforeEach(() => {
  storage = new MemoryStorage();
  service = new ConversationService({ storage, ...makeClock() });
});

async function newConversation() {
  return service.create({ capabilityId: "language-qa", languageSnapshot: LANGS });
}

async function storedMessage(id: string) {
  return storage.get<Message>("messages", id);
}

describe("ConversationService: create, list, open", () => {
  it("snapshots the languages and starts with a placeholder title", async () => {
    const c = await newConversation();
    expect(c.languageSnapshot).toEqual(LANGS);
    expect(c.capabilityId).toBe("language-qa");
    expect(c.title).toBe("");
  });

  it("lists newest-updated first", async () => {
    const a = await newConversation();
    const b = await newConversation();
    await service.addUserMessage(a.id, [{ trust: "user", text: "hola" }]);
    const list = await service.list();
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it("opens a conversation with its messages in order", async () => {
    const c = await newConversation();
    const u = await service.addUserMessage(c.id, [{ trust: "user", text: "What is は?" }]);
    const a = await service.beginAssistantMessage(c.id);
    const opened = await service.open(c.id);
    expect(opened?.messages.map((m) => m.id)).toEqual([u.id, a.id]);
  });

  it("returns undefined for an unknown conversation", async () => {
    expect(await service.open("missing")).toBeUndefined();
  });

  it("refuses to add messages to an unknown conversation", async () => {
    await expect(service.addUserMessage("missing", [{ trust: "user", text: "x" }])).rejects.toThrow();
  });
});

describe("ConversationService: titles", () => {
  it("derives the title from the first user message only", async () => {
    const c = await newConversation();
    await service.addUserMessage(c.id, [{ trust: "user", text: "What does ser mean?" }]);
    await service.addUserMessage(c.id, [{ trust: "user", text: "And estar?" }]);
    expect((await service.open(c.id))?.conversation.title).toBe("What does ser mean?");
  });

  it("truncates a long first message", async () => {
    const c = await newConversation();
    await service.addUserMessage(c.id, [{ trust: "user", text: "word ".repeat(100) }]);
    const title = (await service.open(c.id))?.conversation.title ?? "";
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it("never builds a title from untrusted material", async () => {
    const c = await newConversation();
    await service.addUserMessage(c.id, [
      { trust: "untrusted", text: "pasted article text" },
      { trust: "user", text: "Explain this" },
    ]);
    expect((await service.open(c.id))?.conversation.title).toBe("Explain this");
  });

  it("lets the user rename, and a rename survives later messages", async () => {
    const c = await newConversation();
    await service.addUserMessage(c.id, [{ trust: "user", text: "first" }]);
    await service.rename(c.id, "My Japanese notes");
    await service.addUserMessage(c.id, [{ trust: "user", text: "second" }]);
    expect((await service.open(c.id))?.conversation.title).toBe("My Japanese notes");
  });
});

describe("message state machine", () => {
  it("streaming → complete, with text persisted incrementally", async () => {
    const c = await newConversation();
    const m = await service.beginAssistantMessage(c.id);
    expect(m.status).toBe("streaming");

    await service.appendText(m.id, "Hola, ");
    expect((await storedMessage(m.id))?.segments[0]?.text).toBe("Hola, ");
    await service.appendText(m.id, "mundo");
    expect((await storedMessage(m.id))?.segments[0]?.text).toBe("Hola, mundo");

    const done = await service.finish(m.id, "complete");
    expect(done.status).toBe("complete");
    expect((await storedMessage(m.id))?.status).toBe("complete");
  });

  it("streaming → interrupted keeps the partial text", async () => {
    const c = await newConversation();
    const m = await service.beginAssistantMessage(c.id);
    await service.appendText(m.id, "partial");
    await service.finish(m.id, "interrupted");
    const stored = await storedMessage(m.id);
    expect(stored?.status).toBe("interrupted");
    expect(stored?.segments[0]?.text).toBe("partial");
  });

  it("streaming → refused records the verdict and rule ids", async () => {
    const c = await newConversation();
    const m = await service.beginAssistantMessage(c.id);
    await service.finish(m.id, "refused", { verdict: "refuse", ruleIds: ["scope.language-learning@1.0.0"] });
    const stored = await storedMessage(m.id);
    expect(stored?.status).toBe("refused");
    expect(stored?.verdict).toBe("refuse");
    expect(stored?.ruleIds).toEqual(["scope.language-learning@1.0.0"]);
  });

  it("rejects every transition out of a final state", async () => {
    for (const first of ["complete", "interrupted", "refused"] as const) {
      const c = await newConversation();
      const m = await service.beginAssistantMessage(c.id);
      await service.finish(m.id, first);
      await expect(service.finish(m.id, "complete")).rejects.toThrow();
      await expect(service.finish(m.id, "interrupted")).rejects.toThrow();
      await expect(service.appendText(m.id, "late text")).rejects.toThrow();
    }
  });

  it("cannot finish into `streaming`", async () => {
    const c = await newConversation();
    const m = await service.beginAssistantMessage(c.id);
    await expect(service.finish(m.id, "streaming" as never)).rejects.toThrow();
  });

  it("starts user messages as complete", async () => {
    const c = await newConversation();
    const u = await service.addUserMessage(c.id, [{ trust: "user", text: "hi" }]);
    expect(u.status).toBe("complete");
    expect(u.author).toBe("user");
  });
});

describe("retry", () => {
  it("creates a new streaming message and keeps the interrupted one marked incomplete", async () => {
    const c = await newConversation();
    const first = await service.beginAssistantMessage(c.id);
    await service.appendText(first.id, "cut off");
    await service.finish(first.id, "interrupted");

    const retry = await service.retry(first.id);
    expect(retry.id).not.toBe(first.id);
    expect(retry.status).toBe("streaming");
    expect(retry.segments).toEqual([]);

    const kept = await storedMessage(first.id);
    expect(kept?.status).toBe("interrupted");
    expect(kept?.segments[0]?.text).toBe("cut off");
  });

  it("only works on interrupted messages", async () => {
    const c = await newConversation();
    const m = await service.beginAssistantMessage(c.id);
    await expect(service.retry(m.id)).rejects.toThrow();
    await service.finish(m.id, "complete");
    await expect(service.retry(m.id)).rejects.toThrow();
  });
});

describe("delete", () => {
  it("removes the conversation, its messages, and its usage records only", async () => {
    const keep = await newConversation();
    const drop = await newConversation();
    const keptMsg = await service.addUserMessage(keep.id, [{ trust: "user", text: "keep" }]);
    await service.addUserMessage(drop.id, [{ trust: "user", text: "drop" }]);
    const reply = await service.beginAssistantMessage(drop.id);
    await service.finish(reply.id, "complete");
    await storage.put("usage", { id: "u-drop", conversationId: drop.id });
    await storage.put("usage", { id: "u-keep", conversationId: keep.id });

    await service.delete(drop.id);

    expect(await service.open(drop.id)).toBeUndefined();
    expect(await storage.query("messages", { index: "conversationId", equals: drop.id })).toEqual([]);
    expect(await storage.query("usage", { index: "conversationId", equals: drop.id })).toEqual([]);
    expect(await storedMessage(keptMsg.id)).toBeDefined();
    expect(await storage.get("usage", "u-keep")).toBeDefined();
    expect((await service.list()).map((c) => c.id)).toEqual([keep.id]);
  });

  it("is a no-op for an unknown conversation", async () => {
    await expect(service.delete("missing")).resolves.toBeUndefined();
  });
});
