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
  /**
   * Model ids per provider the build offers, from the providers' tables (core cannot import them).
   * A provider id is valid when it is a key here; a model id when it is in that provider's list.
   */
  modelsByProvider: Readonly<Record<string, readonly string[]>>;
}

/** A profile as read from storage; one saved before 004 has no `providerId`. */
export type StoredProfile = Omit<LearnerProfile, "providerId"> & { providerId?: string };

/** Profiles saved before 004 used Anthropic, the only provider then (004 FR-002). */
export const LEGACY_PROVIDER_ID = "anthropic";

/** Reads a stored profile, filling in the provider for one saved before 004. */
export function readStoredProfile(stored: StoredProfile | undefined): LearnerProfile | undefined {
  if (stored === undefined) return undefined;
  return { ...stored, providerId: stored.providerId ?? LEGACY_PROVIDER_ID };
}

// Shape check only (e.g. "ja", "es-MX", "zh-Hant-TW"); the registry is not consulted so that
// low-resource languages are never rejected.
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const languageTag = z.string().regex(LANGUAGE_TAG);

const interest = z
  .string()
  .refine((s) => s.trim().length > 0, { message: "blank" })
  .refine((s) => [...s].length <= MAX_INTEREST_LENGTH, { message: "too_long" });

function buildSchema(modelsByProvider: Readonly<Record<string, readonly string[]>>) {
  const offered = (providerId: string) => Object.hasOwn(modelsByProvider, providerId);
  return z
    .object({
      uiLanguage: z.enum(SHIPPED_UI_LOCALES),
      mediationLanguage: languageTag,
      targetLanguage: languageTag,
      level: z.enum(LEVELS as [string, ...string[]]),
      interests: z.array(interest).max(MAX_INTERESTS),
      toneId: z.string().min(1).default(DEFAULT_TONE_ID),
      configuredEffort: z.enum(CONFIGURABLE_EFFORTS as [string, ...string[]]).default(DEFAULT_EFFORT),
      providerId: z.string().refine(offered, { message: "unknown_provider" }),
      modelId: z.string(),
    })
    .superRefine((value, ctx) => {
      // The model must belong to the chosen provider (004 FR-018); an unknown provider is
      // reported on its own field and not again here.
      if (offered(value.providerId) && !modelsByProvider[value.providerId]!.includes(value.modelId)) {
        ctx.addIssue({ code: "custom", message: "unknown_model", path: ["modelId"] });
      }
      if (value.mediationLanguage.toLowerCase() === value.targetLanguage.toLowerCase()) {
        ctx.addIssue({ code: "custom", message: "same_as_mediation", path: ["targetLanguage"] });
      }
    });
}

export function validateProfile(input: unknown, options: ProfileValidationOptions): ProfileValidation {
  const parsed = buildSchema(options.modelsByProvider).safeParse(input);
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
