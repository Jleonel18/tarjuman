import { expect, test, type Page } from "@playwright/test";

/**
 * User Story 1, end to end, against the production build with the mock provider
 * (`VITE_PROVIDER=mock`, see playwright.config.ts). The mock accepts exactly one key and answers
 * every question with the happy-path script, so these tests are deterministic.
 *
 * Written before the UI exists (T061-T067): the labels and roles below are the contract the UI
 * has to meet. Strings are the English catalog; the UI language is English by default.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const MOCK_ANSWER = "Ser describes identity; estar describes state.";

async function completeOnboarding(page: Page): Promise<void> {
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByLabel("Your level").selectOption("B1");
  await page.getByLabel("Add an interest").fill("cooking");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();
}

async function enterKey(page: Page, key: string, mode: "Remember on this device" | "This session only"): Promise<void> {
  await page.getByLabel("API key").fill(key);
  await page.getByRole("radio", { name: mode }).check();
  await page.getByRole("button", { name: "Save key" }).click();
}

async function ask(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test.describe("onboarding and first answer", () => {
  test("captures the profile and blocks identical languages with an explanation", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Explanation language").selectOption("es");
    await page.getByLabel("Language I'm learning").selectOption("es");
    await expect(page.getByRole("alert")).toContainText("must be different");
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    await page.getByLabel("Language I'm learning").selectOption("ja");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("offers an 'I don't know' level and lets interests be added and removed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Your level").locator("option", { hasText: "I don't know" })).toHaveCount(1);
    await page.getByLabel("Add an interest").fill("football");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("football")).toBeVisible();
    await page.getByRole("button", { name: "Remove football" }).click();
    await expect(page.getByText("football")).toHaveCount(0);
  });

  test("an invalid key shows a plain-language error and stores nothing", async ({ page }) => {
    await page.goto("/");
    await completeOnboarding(page);
    await enterKey(page, "sk-ant-not-a-real-key", "Remember on this device");
    await expect(page.getByRole("alert")).toContainText("isn't valid");
    // Nothing was stored: still on key entry after a reload, and no masked hint is shown.
    await page.reload();
    await expect(page.getByLabel("API key")).toBeVisible();
    await expect(page.getByText("sk-ant-…")).toHaveCount(0);
  });

  test("key entry has no preselected storage mode", async ({ page }) => {
    await page.goto("/");
    await completeOnboarding(page);
    await expect(page.getByRole("radio", { name: "Remember on this device" })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: "This session only" })).not.toBeChecked();
  });

  test("a valid key shows a masked hint, the first answer streams, and a reload keeps everything", async ({ page }) => {
    await page.goto("/");
    await completeOnboarding(page);
    await enterKey(page, VALID_KEY, "Remember on this device");
    await expect(page.getByText("sk-ant-…0000")).toBeVisible();
    await expect(page.getByText(VALID_KEY)).toHaveCount(0);

    await ask(page, "What is the difference between ser and estar?");
    await expect(page.getByText(MOCK_ANSWER)).toBeVisible();

    await page.reload();
    await expect(page.getByText(MOCK_ANSWER)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    // The profile survived: no onboarding on reload.
    await expect(page.getByLabel("Explanation language")).toHaveCount(0);
  });

  test("session-only mode forgets the key on reload but keeps the profile", async ({ page }) => {
    await page.goto("/");
    await completeOnboarding(page);
    await enterKey(page, VALID_KEY, "This session only");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("API key")).toBeVisible();
    await expect(page.getByLabel("Explanation language")).toHaveCount(0);
  });

  test("unavailable storage explains non-persistence and offers session-only mode", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    });
    await page.goto("/");
    await completeOnboarding(page);
    await expect(page.getByRole("status")).toContainText("can't save data in this browser");
    await expect(page.getByRole("radio", { name: "Remember on this device" })).toBeDisabled();
    await page.getByLabel("API key").fill(VALID_KEY);
    await page.getByRole("radio", { name: "This session only" }).check();
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });
});
