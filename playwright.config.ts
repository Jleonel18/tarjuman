import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  // E2E runs against the production build so it exercises the CSP that actually ships. The build
  // uses the mock provider and includes the pseudo-RTL test locale (never in a normal build).
  webServer: {
    command: "pnpm --filter @tarjuman/web build && pnpm --filter @tarjuman/web preview --port 5173 --strictPort",
    url: "http://localhost:5173",
    env: { VITE_PROVIDER: "mock", VITE_PSEUDO_RTL: "1" },
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
