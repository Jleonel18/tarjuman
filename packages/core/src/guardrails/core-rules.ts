import scopeLanguageLearningOnly from "../../rules/scope.language-learning-only.json";
import type { DomainRule } from "../capabilities/types";
import { loadRules } from "./rule-loader";

/** Rules that ship with the core. Validated at import, so an invalid one stops startup. */
export const CORE_RULES: readonly DomainRule[] = loadRules([scopeLanguageLearningOnly]);
