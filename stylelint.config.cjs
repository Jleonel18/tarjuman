/**
 * Logical properties only (Principle VIII): physical properties fail the build.
 * Raw colors only in tokens.css (specs/003-visual-design, SC-001): every other stylesheet uses the
 * color tokens. `currentColor` and `transparent` are keywords, not colors, so they stay allowed.
 */
const RAW_COLOR_RULES = {
  "color-no-hex": true,
  "color-named": "never",
  "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch"],
};

module.exports = {
  // Build output is minified and not ours to lint.
  ignoreFiles: ["**/dist/**", "**/node_modules/**"],
  plugins: ["stylelint-use-logical"],
  rules: {
    "csstools/use-logical": "always",
    ...RAW_COLOR_RULES,
  },
  overrides: [
    {
      files: ["packages/ui/src/styles/tokens.css"],
      rules: Object.fromEntries(Object.keys(RAW_COLOR_RULES).map((rule) => [rule, null])),
    },
  ],
};
