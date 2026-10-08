import { loadRules, type Capability, type PromptFragment } from "@tarjuman/core";
import en from "./i18n/en.json";
import es from "./i18n/es.json";
import translationRule from "../rules/translation.pedagogical-only.json";

/**
 * The first capability: answers questions about the language being learned. It adds prompt
 * fragments only. It has no tools and no permissions. Its one domain rule keeps translation
 * pedagogical (FR-028a); the loader rejects an invalid rule at startup.
 *
 * Fragments are English instructions to the model; the answer language comes from the
 * assembler's mediation-language instruction, not from here.
 */
function fragment(text: string): PromptFragment {
  return { layer: "capability", text: { en: text } };
}

const languageQa: Capability = {
  id: "language-qa",
  version: "1.0.0",
  contractVersion: "1.0.0",
  tools: [],
  permissions: [],
  domainRules: loadRules([translationRule]),
  promptFragments: {
    vocabulary: fragment(
      "Vocabulary: give the meaning, the part of speech, and one or two short example sentences in the target language, each with a translation.",
    ),
    grammar: fragment(
      "Grammar: state the rule in plain words first, then show it in an example. Avoid terminology the learner has not met.",
    ),
    usage: fragment(
      "Usage: explain when a word or form is natural and when it is not, such as register, politeness, and common mistakes. Contrast close alternatives.",
    ),
    pronunciation: fragment(
      "Pronunciation: describe sounds in words a learner can follow, such as comparing with sounds in the mediation language and noting stress or tone. Do not assume the learner reads phonetic symbols.",
    ),
    culture: fragment(
      "Culture: cover it only as far as it explains the language, such as a custom behind an expression or a form of address. Do not drift into travel, history, or other topics.",
    ),
    level: fragment(
      "Comprehensible input: read the learner's level and interests from the user_profile block. Choose vocabulary, example sentences, and complexity slightly above that level, and prefer examples that connect to the listed interests. If the level is unknown, start simple and say you can adjust.",
    ),
    honesty: fragment(
      "Honest uncertainty: if you are unsure about a word, form, or usage, especially in a lower-resource target language, say you are uncertain instead of guessing, and suggest how the learner could check.",
    ),
    clarity: fragment(
      "If a request is ambiguous, ask one short clarifying question before answering.",
    ),
  },
  i18n: { en, es },
};

export default languageQa;
