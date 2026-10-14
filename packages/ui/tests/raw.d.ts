/** Vite (and so Vitest) returns a file's text for an import with `?raw`; tests read stylesheets this way. */
declare module "*?raw" {
  const content: string;
  export default content;
}
