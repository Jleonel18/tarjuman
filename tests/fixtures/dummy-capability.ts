import type { Capability, ToolDeclaration } from "@tarjuman/core";

/**
 * Test-only capability (T104). It lives under `tests/` on purpose: nothing in `packages/` may
 * depend on it. It has one side-effecting tool, so the taint gate (FR-010) has something to gate,
 * and one domain rule with accept and refuse cases. Reused by User Story 8 (SC-008).
 */

const NOTICE_PERMISSION = { kind: "ui", surface: "notice" } as const;

export const DUMMY_TOOL_NAME = "show_notice";

export const dummyTool: ToolDeclaration = {
  name: DUMMY_TOOL_NAME,
  description: { en: "Shows the learner a short notice." },
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
  requiredPermissions: [{ ...NOTICE_PERMISSION }],
  sideEffecting: true,
  handler: async () => ({ ok: true, output: { shown: true } }),
};

export const dummyCapability: Capability = {
  id: "dummy",
  version: "1.0.0",
  contractVersion: "1.0.0",
  tools: [dummyTool],
  permissions: [{ ...NOTICE_PERMISSION }],
  domainRules: [
    {
      id: "scope.dummy",
      version: "1.0.0",
      description: "Only helps the learner with vocabulary and short notices about it.",
      refusalTemplateKey: "refusal.out_of_scope",
      acceptCases: [{ input: "Remind me that ser means to be", locale: "en" }],
      refuseCases: [{ input: "Write me a web server", locale: "en" }],
    },
  ],
  promptFragments: { intro: { layer: "capability", text: { en: "You may show short vocabulary notices." } } },
  i18n: { en: { "capability.dummy.title": "Dummy" } },
};
