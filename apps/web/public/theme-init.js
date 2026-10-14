// Applies a saved light or dark theme before first paint (specs/003-visual-design, FR-002/FR-003).
// A classic, same-origin script so it blocks rendering and needs no CSP change. It only reads the
// one key ThemePreferenceStore writes; anything else leaves the device's preference in charge.
try {
  var theme = localStorage.getItem("tarjuman.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {
  // Blocked storage: the device decides.
}
