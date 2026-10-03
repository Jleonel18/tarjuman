/** Logical properties only (Principle VIII): physical properties fail the build. */
module.exports = {
  plugins: ["stylelint-use-logical"],
  rules: {
    "csstools/use-logical": "always",
  },
};
