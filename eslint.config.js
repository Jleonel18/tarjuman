import js from "@eslint/js";
import tseslint from "typescript-eslint";
import i18next from "eslint-plugin-i18next";

const forbidInnerHtml = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML is banned: render model output through SafeBlock nodes only.",
  },
  {
    selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
    message: "Assigning innerHTML/outerHTML is banned: it bypasses the OutputGuard.",
  },
];

// Mirrors the boundaries enforced by .dependency-cruiser.cjs (T015); depcruise is authoritative.
const coreForbidden = [
  "@tarjuman/provider-anthropic*",
  "@tarjuman/storage-web*",
  "@tarjuman/ui*",
  "@tarjuman/web*",
  "@tarjuman/capability-*",
  "@tarjuman/testing*",
  "@anthropic-ai/sdk*",
  "react",
  "react-dom",
  "node:*",
];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable", require: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...forbidInnerHtml] },
  },
  {
    files: ["packages/ui/**/*.{ts,tsx}", "apps/web/**/*.{ts,tsx}"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
    },
  },
  // Later blocks replace earlier `no-restricted-imports` settings, so the generic SDK ban comes
  // first and the stricter core/capability blocks (which repeat it) come after.
  {
    files: ["packages/!(provider-anthropic)/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: ["@anthropic-ai/sdk*"] }] },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: coreForbidden }] },
  },
  {
    files: ["packages/capabilities/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@anthropic-ai/sdk*", "@tarjuman/provider-anthropic*", "@tarjuman/core/src/pipeline/*"] },
      ],
    },
  },
);
