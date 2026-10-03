import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { HEADER_ONLY_DIRECTIVES, buildCsp } from "./csp";

/** Injects the production CSP as a <meta> tag into the built index.html. */
function productionCspMeta(): Plugin {
  return {
    name: "tarjuman-csp-meta",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: buildCsp("production") },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), productionCspMeta()],
  build: {
    // Inlined assets become data: URIs, which `img-src 'self'` would block.
    assetsInlineLimit: 0,
  },
  server: {
    headers: { "Content-Security-Policy": `${buildCsp("development")}; ${HEADER_ONLY_DIRECTIVES}` },
  },
  preview: {
    headers: { "Content-Security-Policy": `${buildCsp("production")}; ${HEADER_ONLY_DIRECTIVES}` },
  },
});
