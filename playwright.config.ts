import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --filter @tarjuman/web dev --port 5173 --strictPort",
    url: "http://localhost:5173",
    env: { VITE_PROVIDER: "mock" },
    reuseExistingServer: !process.env["CI"],
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
