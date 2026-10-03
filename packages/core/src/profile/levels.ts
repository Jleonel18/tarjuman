import { LEVELS } from "./types";
import type { Level } from "./types";

export interface LevelInfo {
  level: Level;
  /** i18n catalog key for a plain-language description (FR-035). */
  descriptionKey: string;
}

export const LEVEL_INFO: readonly LevelInfo[] = LEVELS.map((level) => ({
  level,
  descriptionKey: `level.${level}.description`,
}));
