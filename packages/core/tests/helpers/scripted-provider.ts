import type {
  AbortSignalLike,
  ModelInfo,
  ModelRequest,
  ProviderErrorCode,
  ProviderPort,
  StopReason,
  StreamEvent,
  ValidationResult,
} from "../../src/ports/provider";
import type { SecretHandle } from "../../src/ports/secret-handle";

export type Step =
  | { type: "text"; delta: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "stop"; reason: StopReason }
  | { type: "error"; code: ProviderErrorCode; retryAfterSeconds?: number }
  /** Blocks until the signal aborts, then ends the stream with `stop: aborted`. */
  | { type: "wait_for_abort" };

/**
 * Minimal scripted ProviderPort for core tests. `@tarjuman/testing` depends on core, so core
 * tests cannot import its MockProvider without a cycle; this keeps core self-contained.
 */
export class ScriptedProvider implements ProviderPort {
  readonly id = "scripted";
  readonly calls: ModelRequest[] = [];

  constructor(private readonly script: Step[]) {}

  get streamCalls(): number {
    return this.calls.length;
  }

  listModels(): ModelInfo[] {
    return [];
  }

  async validateCredential(): Promise<ValidationResult> {
    return { ok: true };
  }

  async *stream(req: ModelRequest, _secret: SecretHandle, signal: AbortSignalLike): AsyncGenerator<StreamEvent> {
    this.calls.push(req);
    for (const step of this.script) {
      if (step.type === "wait_for_abort") {
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        yield { type: "stop", reason: "aborted" };
        return;
      }
      yield step;
    }
  }
}

/** Core has no DOM typings, so tests build their own AbortSignalLike. */
export function createTestAbort(): { signal: AbortSignalLike; abort(): void } {
  let aborted = false;
  const listeners = new Set<() => void>();
  const signal: AbortSignalLike = {
    get aborted() {
      return aborted;
    },
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  };
  return {
    signal,
    abort() {
      aborted = true;
      for (const listener of [...listeners]) listener();
    },
  };
}
