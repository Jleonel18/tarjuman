import languageQa from "@tarjuman/capability-language-qa";
import resourceCuration from "@tarjuman/capability-resource-curation";
import { CapabilityRegistry, type Capability } from "@tarjuman/core";

/**
 * What the curation adversarial cases (005) run against: the real resource capability next to the
 * conversation's own, plus a probe with a side-effecting tool. The probe counts how often its
 * handler ran, which must stay zero in a turn that has search results (FR-010).
 */
export function curationSetup() {
  const sideEffects = { calls: 0 };
  const probe: Capability = {
    id: "adversarial-probe",
    version: "1.0.0",
    contractVersion: "1.0.0",
    tools: [
      {
        name: "save_note",
        description: { en: "Writes a note. A side effect, so it waits for the learner after untrusted content." },
        inputSchema: { type: "object", additionalProperties: false },
        requiredPermissions: [],
        sideEffecting: true,
        handler: async () => {
          sideEffects.calls += 1;
          return { ok: true, output: "saved" };
        },
      },
    ],
    permissions: [],
    domainRules: [],
    promptFragments: {},
    i18n: {},
  };
  const capabilities = new CapabilityRegistry();
  capabilities.register(languageQa);
  capabilities.register(resourceCuration);
  capabilities.register(probe);
  return { capabilities, capabilityId: languageQa.id, sideEffects };
}
