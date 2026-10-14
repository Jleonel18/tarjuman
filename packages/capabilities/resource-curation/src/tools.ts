import type { ToolContext, ToolDeclaration, ToolResult } from "@tarjuman/core";

const MAX_QUERY = 120;
const KINDS = ["any", "music"] as const;
const ALLOWED_FIELDS = new Set(["query", "kind", "captionsOnly"]);

/**
 * Reads the model's input strictly: exactly the documented fields with the documented types and
 * limits, nothing else. The model cannot add a language, a source, or a count.
 */
function readSearchInput(input: unknown): { query: string; kind: (typeof KINDS)[number]; captionsOnly: boolean } | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some((name) => !ALLOWED_FIELDS.has(name))) return undefined;
  const query = fields["query"];
  const kind = KINDS.find((k) => k === fields["kind"]);
  const captionsOnly = fields["captionsOnly"];
  if (typeof query !== "string" || kind === undefined) return undefined;
  if (captionsOnly !== undefined && typeof captionsOnly !== "boolean") return undefined;
  const trimmed = query.trim();
  if (trimmed === "" || trimmed.length > MAX_QUERY) return undefined;
  return { query: trimmed, kind, captionsOnly: captionsOnly === true };
}

export const searchVideos: ToolDeclaration = {
  name: "search_videos",
  description: {
    en: "Search YouTube for videos or songs in the learner's target language. Returns up to 8 results, each with an id such as r1.",
    es: "Busca en YouTube videos o canciones en el idioma que estudia la persona. Devuelve hasta 8 resultados, cada uno con un id como r1.",
  },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: {
        type: "string",
        minLength: 1,
        maxLength: MAX_QUERY,
        description: "Short search terms, written in the target language.",
      },
      kind: { type: "string", enum: [...KINDS], description: "music limits the search to songs." },
      captionsOnly: { type: "boolean", description: "Only videos with captions." },
    },
    required: ["query", "kind"],
  },
  requiredPermissions: [{ kind: "search", sources: ["youtube"] }],
  sideEffecting: false,
  async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const request = readSearchInput(input);
    if (!request) return { ok: false, error: "bad_input" };
    const outcome = await ctx.search.videos(request);
    return outcome.ok ? { ok: true, output: { results: outcome.results } } : { ok: false, error: outcome.error };
  },
};

/**
 * A presentation tool: the app validates its input against the turn's search results and turns it
 * into resource cards. There is no handler, and the model never supplies a title, link, or label.
 */
export const showResources: ToolDeclaration = {
  name: "show_resources",
  description: {
    en: "Show the learner the search results that fit, as cards. Call it once, after searching, with 1 to 10 result ids in the order they were found.",
    es: "Muestra a la persona los resultados de la búsqueda que le sirven, como tarjetas. Llámala una vez, después de buscar, con 1 a 10 ids de resultados en el orden en que se encontraron.",
  },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: "^r\\d+$", description: "A result id from the search, such as r2." },
            fitNote: {
              type: "string",
              minLength: 1,
              maxLength: 300,
              description: "Why this suits the learner, as plain text with no links.",
            },
            difficulty: {
              type: "string",
              enum: ["easier", "about_right", "harder", "unknown"],
              description: "Your estimate of the difficulty for this learner.",
            },
            interest: { type: "string", description: "One of the learner's interests this connects to, if any." },
          },
          required: ["id", "fitNote", "difficulty"],
        },
      },
    },
    required: ["items"],
  },
  requiredPermissions: [],
  sideEffecting: false,
  presentation: "resources",
};
