import { z } from "zod";
import { CAPABILITY_CONTRACT_VERSION } from "./types";

const SEMVER = /^\d+\.\d+\.\d+$/;
const KEBAB_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const RULE_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;

const collection = z.enum(["profile", "settings", "conversations", "messages", "usage"]);

export const permissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("network"), allowedHosts: z.array(z.string().min(1)) }).strict(),
  z
    .object({
      kind: z.literal("storage"),
      collections: z.array(collection).min(1),
      access: z.enum(["read", "write"]),
    })
    .strict(),
  z.object({ kind: z.literal("ui"), surface: z.literal("notice") }).strict(),
]);

const localizedText = z.record(z.string().min(1), z.string().min(1));

const ruleCase = z
  .object({
    input: z.string().min(1),
    locale: z.string().min(1),
    profile: z
      .object({ mediation: z.string().optional(), target: z.string().optional() })
      .strict()
      .optional(),
    note: z.string().optional(),
  })
  .strict();

/** A rule with no accept and refuse cases is invalid (FR-026). */
export const domainRuleSchema = z
  .object({
    id: z.string().regex(RULE_ID),
    version: z.string().regex(SEMVER),
    description: z.string().min(10),
    refusalTemplateKey: z.string().min(1),
    acceptCases: z.array(ruleCase).min(1),
    refuseCases: z.array(ruleCase).min(1),
    clarifyCases: z.array(ruleCase).optional(),
  })
  .strict();

const toolSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    description: localizedText,
    inputSchema: z.record(z.string(), z.unknown()).refine((s) => s["additionalProperties"] === false, {
      message: "Tool inputSchema must set additionalProperties: false",
    }),
    requiredPermissions: z.array(permissionSchema),
    sideEffecting: z.boolean(),
    handler: z.custom<(...args: never[]) => unknown>((v) => typeof v === "function", {
      message: "Tool handler must be a function",
    }),
  })
  .strict();

/** The only layer a capability may target; any other value is rejected (FR-008). */
const fragmentSchema = z.object({ layer: z.literal("capability"), text: localizedText }).strict();

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const capabilitySchema = z
  .object({
    id: z.string().regex(KEBAB_ID),
    version: z.string().regex(SEMVER),
    contractVersion: z.literal(CAPABILITY_CONTRACT_VERSION),
    tools: z.array(toolSchema),
    permissions: z.array(permissionSchema),
    domainRules: z.array(domainRuleSchema),
    promptFragments: z.record(z.string().min(1), fragmentSchema),
    i18n: z.record(z.string().min(1), z.record(z.string(), z.string())),
  })
  .strict()
  .superRefine((cap, ctx) => {
    // Tools may only require permissions the capability declared up front (FR-023).
    cap.tools.forEach((tool, ti) => {
      tool.requiredPermissions.forEach((needed, pi) => {
        if (!cap.permissions.some((declared) => sameJson(declared, needed))) {
          ctx.addIssue({
            code: "custom",
            path: ["tools", ti, "requiredPermissions", pi],
            message: `Tool "${tool.name}" requires a permission the capability did not declare`,
          });
        }
      });
    });

    const toolNames = new Set<string>();
    cap.tools.forEach((tool, ti) => {
      if (toolNames.has(tool.name)) {
        ctx.addIssue({ code: "custom", path: ["tools", ti, "name"], message: `Duplicate tool "${tool.name}"` });
      }
      toolNames.add(tool.name);
    });

    // i18n keys must live under this capability's namespace so capabilities cannot collide.
    const prefix = `capability.${cap.id}.`;
    for (const [locale, catalog] of Object.entries(cap.i18n)) {
      for (const key of Object.keys(catalog)) {
        if (!key.startsWith(prefix)) {
          ctx.addIssue({
            code: "custom",
            path: ["i18n", locale, key],
            message: `i18n key must start with "${prefix}"`,
          });
        }
      }
    }
  });
