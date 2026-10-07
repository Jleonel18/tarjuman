import { z } from "zod";

/**
 * Where a set of live-model results came from (specs/002-free-dev-provider,
 * contracts/fixture-provenance.md). Results recorded with a non-Claude model prove pipeline
 * mechanics only and never count as evidence for 001 SC-003.
 *
 * The schemas are strict: an unknown field is a load error, so a key or a header can never ride
 * along in a provenance record.
 */

export function nonClaudeLabel(modelId: string): string {
  return `Recorded with a non-Claude model (${modelId}). Proves pipeline mechanics only; not evidence for 001 SC-003.`;
}

const base = z.strictObject({
  providerId: z.enum(["ollama", "anthropic", "synthetic"]),
  modelId: z.string().min(1),
  runtimeVersion: z.string().min(1).nullable(),
  recordedAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  isClaude: z.boolean(),
  label: z.string().min(1),
});

type Checked = Pick<z.infer<typeof base>, "providerId" | "modelId" | "isClaude" | "label">;

function check(value: Checked, ctx: z.RefinementCtx): void {
  if (value.isClaude !== (value.providerId === "anthropic")) {
    ctx.addIssue({ code: "custom", path: ["isClaude"], message: "isClaude must be true exactly when providerId is anthropic." });
  }
  // A synthetic record states its own source instead, so only an Ollama run has a fixed label.
  if (value.providerId === "ollama" && value.label !== nonClaudeLabel(value.modelId)) {
    ctx.addIssue({ code: "custom", path: ["label"], message: "An Ollama recording must use nonClaudeLabel(modelId)." });
  }
}

export const FixtureProvenance = base.superRefine(check);
export type FixtureProvenance = z.infer<typeof FixtureProvenance>;

/** A provenance before it is written: `recordedAt` is filled in at write time. */
export const FixtureProvenanceDraft = base.omit({ recordedAt: true }).superRefine(check);
export type FixtureProvenanceDraft = z.infer<typeof FixtureProvenanceDraft>;

/** Loads a provenance record. Missing or invalid provenance is an error, never a silent default. */
export function parseProvenance(json: unknown): FixtureProvenance {
  const result = FixtureProvenance.safeParse(json);
  if (!result.success) {
    // Paths and messages only: the rejected values are never echoed.
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new Error(`Invalid fixture provenance. ${issues.join("; ")}`);
  }
  return result.data;
}
