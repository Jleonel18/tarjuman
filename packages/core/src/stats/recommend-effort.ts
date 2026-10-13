import type { Effort } from "../ports/provider";
import type { TurnInput } from "../pipeline/types";

export type RequestType = "lookup" | "pronunciation" | "grammar" | "contrast" | "translation" | "analysis";

export interface RequestFeatures {
  /** Characters the learner typed plus any pasted material. */
  messageLength: number;
  subQuestionCount: number;
  hasPastedMaterial: boolean;
  requestType: RequestType;
}

const SHORT_LOOKUP_LENGTH = 200;
const LONG_TRANSLATION_LENGTH = 1000;
const MANY_QUESTIONS = 3;
const SHORT_REQUEST_LENGTH = 80;

const QUESTION_MARKS = /[?؟？]/g;
const PRONUNCIATION = /pronounc|pronunci|how do you say|cómo se dice|cómo se pronuncia|النطق|نطق/i;
const CONTRAST = /differen|versus|\bvs\.?\b|diferencia|distinci|الفرق|compare|comparar/i;
const GRAMMAR = /grammar|gramática|conjugat|conjug|tense|particle|partícula|subjunctive|subjuntivo|why is|por qué|لماذا|قواعد/i;
const TRANSLATION = /translat|traduc|ترجم/i;
const ANALYSIS = /analy[sz]e|analiza|break (it )?down|desglosa|حلل/i;

/**
 * Reads the shape of a request without calling a model (research R3). The request type comes from
 * keywords in English, Spanish, and Arabic, so it is a rough guess and it is advisory only; the
 * counts are exact.
 */
export function extractRequestFeatures(turn: Pick<TurnInput, "userText" | "untrustedMaterial">): RequestFeatures {
  const material = turn.untrustedMaterial ?? [];
  const hasPastedMaterial = material.some((m) => m.text !== "");
  const messageLength = turn.userText.length + material.reduce((sum, m) => sum + m.text.length, 0);
  const subQuestionCount = Math.max(1, turn.userText.match(QUESTION_MARKS)?.length ?? 0);

  const text = turn.userText;
  let requestType: RequestType;
  if (ANALYSIS.test(text)) requestType = "analysis";
  else if (TRANSLATION.test(text)) requestType = "translation";
  else if (PRONUNCIATION.test(text)) requestType = "pronunciation";
  else if (CONTRAST.test(text)) requestType = "contrast";
  else if (GRAMMAR.test(text)) requestType = "grammar";
  else requestType = messageLength <= SHORT_REQUEST_LENGTH && !hasPastedMaterial ? "lookup" : "grammar";

  return { messageLength, subQuestionCount, hasPastedMaterial, requestType };
}

/** Advisory and deterministic: the same features always give the same level. */
export function recommendEffort(features: RequestFeatures): Effort {
  const { requestType, messageLength, subQuestionCount, hasPastedMaterial } = features;
  if (requestType === "analysis" || (subQuestionCount >= MANY_QUESTIONS && requestType !== "lookup")) return "high";
  if (requestType === "translation") return messageLength >= LONG_TRANSLATION_LENGTH ? "high" : "medium";
  if (requestType === "lookup" || requestType === "pronunciation") {
    return subQuestionCount <= 2 && messageLength <= SHORT_LOOKUP_LENGTH && !hasPastedMaterial ? "low" : "medium";
  }
  return "medium";
}
