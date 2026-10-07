import { sealSecret } from "@tarjuman/core";
import type { StreamEvent } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import type { OllamaDiagnostic } from "../src/errors";
import { OllamaProvider } from "../src/ollama-provider";

/**
 * Opt-in smoke test against a real local Ollama (`pnpm test:live:ollama`). It is free, but it is
 * not part of the default run or CI. See docs/local-model.md for setup.
 */

// This package's tsconfig has no Node types on purpose (its src is browser code). This test runs
// only under Node, so it declares the one global it reads instead of widening the config.
declare const process: { env: Record<string, string | undefined> };

const BASE_URL = (process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434").replace(/\/+$/, "");
const MODEL_ID = process.env["OLLAMA_MODEL"] ?? "gemma3:4b";

async function isReachable(): Promise<boolean> {
  try {
    return (await fetch(`${BASE_URL}/v1/models`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

const reachable = await isReachable();
if (!reachable) {
  console.warn(
    `Skipping the Ollama live test: nothing answered at ${BASE_URL}/v1/models (diagnostic "unreachable"). ` +
      "See docs/local-model.md#unreachable.",
  );
}

describe.skipIf(!reachable)(`OllamaProvider against a real runtime (${MODEL_ID})`, () => {
  it("streams one short answer with text, usage, and a stop", async () => {
    const diagnostics: OllamaDiagnostic[] = [];
    const provider = new OllamaProvider({ baseUrl: BASE_URL, diagnose: (d) => diagnostics.push(d) });
    const events: StreamEvent[] = [];
    for await (const event of provider.stream(
      {
        modelId: MODEL_ID,
        layers: [{ id: "security", text: "You are a friendly assistant." }],
        messages: [{ role: "user", content: "Say hola." }],
        maxTokens: 32,
      },
      sealSecret("ollama"),
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(diagnostics).toEqual([]);
    expect(events.filter((e) => e.type === "text").length).toBeGreaterThanOrEqual(1);
    const usage = events.filter((e) => e.type === "usage");
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ outputTokens: expect.any(Number) });
    expect((usage[0] as { outputTokens: number }).outputTokens).toBeGreaterThan(0);
    const last = events.at(-1);
    expect(last?.type).toBe("stop");
    expect(["end", "max_tokens"]).toContain((last as { reason: string }).reason);
  });
});
