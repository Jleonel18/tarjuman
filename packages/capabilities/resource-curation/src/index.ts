import { loadRules, type Capability } from "@tarjuman/core";
import resourceRequests from "../rules/curation.resource-requests.json";
import { FRAGMENTS } from "./fragments";
import en from "./i18n/en.json";
import es from "./i18n/es.json";
import { searchVideos, showResources } from "./tools";

/**
 * Resource curation, the second capability (specs/005-resource-curation): finds real videos and
 * songs in the target language and shows them as cards. Contract 1.1.0, available in every
 * conversation. It holds one permission, to search YouTube, and reaches nothing else: no network,
 * no storage, no key. The search itself is brokered by the app.
 */
const resourceCuration: Capability = {
  id: "resource-curation",
  version: "1.0.0",
  contractVersion: "1.1.0",
  availability: "all_conversations",
  tools: [searchVideos, showResources],
  permissions: [{ kind: "search", sources: ["youtube"] }],
  domainRules: loadRules([resourceRequests]),
  promptFragments: FRAGMENTS,
  i18n: { en, es },
};

export default resourceCuration;
