import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/memory-storage";
import { FakeLocalStorage, throwingLocalStorage } from "./fake-local-storage";

describe("MemoryStorage", () => {
  it("puts, gets, queries by index, and deletes", async () => {
    const storage = new MemoryStorage();
    await storage.put("messages", { id: "m1", conversationId: "c1" });
    await storage.put("messages", { id: "m2", conversationId: "c2" });
    expect(await storage.get("messages", "m1")).toEqual({ id: "m1", conversationId: "c1" });
    expect(await storage.query("messages", { index: "conversationId", equals: "c2" })).toEqual([
      { id: "m2", conversationId: "c2" },
    ]);
    expect(await storage.query("messages")).toHaveLength(2);
    await storage.delete("messages", "m1");
    expect(await storage.get("messages", "m1")).toBeUndefined();
  });

  it("returns copies, so callers cannot change stored data by mutating a result", async () => {
    const storage = new MemoryStorage();
    await storage.put("profile", { id: "profile", interests: ["a"] });
    const read = await storage.get<{ id: string; interests: string[] }>("profile", "profile");
    read?.interests.push("b");
    expect(await storage.get("profile", "profile")).toEqual({ id: "profile", interests: ["a"] });
  });

  it("clearAll leaves nothing, and a new instance starts empty (a reload forgets everything)", async () => {
    const storage = new MemoryStorage();
    await storage.put("profile", { id: "profile" });
    await storage.clearAll();
    expect(await storage.query("profile")).toEqual([]);
    expect(await new MemoryStorage().query("profile")).toEqual([]);
  });

  it("clearAll removes every tarjuman.* key from localStorage and leaves other keys alone (FR-003a)", async () => {
    const local = new FakeLocalStorage({ "tarjuman.theme": "light", "tarjuman.future": "x", "other-app": "keep" });
    await new MemoryStorage({ localStorage: local }).clearAll();
    expect([...local.items.keys()]).toEqual(["other-app"]);
  });

  it("clearAll treats blocked localStorage as empty", async () => {
    await expect(new MemoryStorage({ localStorage: throwingLocalStorage }).clearAll()).resolves.toBeUndefined();
  });

  it("reports itself available and holds no credential until one is put", async () => {
    const storage = new MemoryStorage();
    expect(await storage.isAvailable()).toBe(true);
    expect(await storage.getCredentialRecord("anthropic")).toBeUndefined();
    expect(await storage.listCredentialRecords()).toEqual([]);
    await storage.deleteCredentialRecord("anthropic");
  });
});
