import { z } from "zod";
import { SHIPPED_UI_LOCALES } from "../i18n/locales";
import { CONFIGURABLE_EFFORTS, DEFAULT_EFFORT, DEFAULT_TONE_ID, LEVELS } from "./types";
import type { Effort, LearnerProfile } from "./types";

export const MAX_INTERESTS = 10;
export const MAX_INTEREST_LENGTH = 60;

/** The user-editable part of a profile; `id` and the timestamps belong to the storage layer. */
export type ProfileInput = Omit<LearnerProfile, "id" | "createdAt" | "updatedAt">;

export interface ProfileIssue {
  path: string;
  /** Stable machine code. Never includes the rejected value (it may be user text). */
  code: string;
}

export type ProfileValidation = { ok: true; value: ProfileInput } | { ok: false; issues: ProfileIssue[] };

export interface ProfileValidationOptions {
  /** Ids from the provider model table; core cannot import it. */
  knownModelIds: readonly string[];
}

// Shape check only (e.g. "ja", "es-MX", "zh-Hant-TW"); the registry is not consulted so that
// low-resource languages are never rejected.
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const languageTag = z.string().regex(LANGUAGE_TAG);

const interest = z
  .string()
  .refine((s) => s.trim().length > 0, { message: "blank" })
  .refine((s) => [...s].length <= MAX_INTEREST_LENGTH, { message: "too_long" });

function buildSchema(knownModelIds: readonly string[]) {
  return z
    .object({
      uiLanguage: z.enum(SHIPPED_UI_LOCALES),
      mediationLanguage: languageTag,
      targetLanguage: languageTag,
      level: z.enum(LEVELS as [string, ...string[]]),
      interests: z.array(interest).max(MAX_INTERESTS),
      toneId: z.string().min(1).default(DEFAULT_TONE_ID),
      configuredEffort: z.enum(CONFIGURABLE_EFFORTS as [string, ...string[]]).default(DEFAULT_EFFORT),
      modelId: z.string().refine((id) => knownModelIds.includes(id), { message: "unknown_model" }),
    })
    .superRefine((value, ctx) => {
      if (value.mediationLanguage.toLowerCase() === value.targetLanguage.toLowerCase()) {
        ctx.addIssue({ code: "custom", message: "same_as_mediation", path: ["targetLanguage"] });
      }
    });
}

export function validateProfile(input: unknown, options: ProfileValidationOptions): ProfileValidation {
  const parsed = buildSchema(options.knownModelIds).safeParse(input);
  if (parsed.success) {
    return {
      ok: true,
      value: {
        ...parsed.data,
        level: parsed.data.level as ProfileInput["level"],
        configuredEffort: parsed.data.configuredEffort as Effort,
      },
    };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code === "custom" ? issue.message : issue.code,
    })),
  };
}
