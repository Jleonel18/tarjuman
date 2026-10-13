import { expect, test, type Page } from "@playwright/test";

/**
 * User Story 4, end to end, against the production build with the mock provider
 * (`VITE_PROVIDER=mock`, see playwright.config.ts). The mock reports 120 input and 24 output tokens
 * per answer on `mock-model`, which prices them at an estimate, and 170,000 input tokens when the
 * question contains HIGH-USAGE-TEST (85% of its 200,000-token window). `mock-model-no-pricing` has
 * no price row. Strings are the English catalog.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";

async function start(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByLabel("Your level").selectOption("B1");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await page.getByRole("radio", { name: "This session only" }).check();
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

async function ask(page: Page, text: string, answers: number): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("article", { name: "Tarjuman" })).toHaveCount(answers);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

const panel = (page: Page) => page.getByRole("region", { name: "Usage", exact: true });
const totalRow = (page: Page) => panel(page).getByRole("row", { name: /^Total/ });

test("the token numbers match what the provider reported and update after each message", async ({ page }) => {
  await start(page);
  await expect(panel(page)).toContainText("Usage appears here after your first question.");

  await ask(page, "What does ser mean?", 1);
  await expect(totalRow(page)).toHaveText(/Total\s*120\s*24/);

  await ask(page, "And estar?", 2);
  await expect(totalRow(page)).toHaveText(/Total\s*240\s*48/);
  await expect(panel(page).getByRole("row", { name: /^2\s+120\s+24/ })).toBeVisible();
});

test("a nearly full context window shows a warning and offers a new conversation", async ({ page }) => {
  await start(page);
  await ask(page, "What does ser mean?", 1);
  await expect(panel(page)).not.toContainText("almost out of room");
  await expect(page.getByRole("status")).toHaveCount(0);

  await ask(page, "HIGH-USAGE-TEST", 2);
  await expect(panel(page)).toContainText("almost out of room");
  await expect(panel(page).getByRole("meter", { name: "Context used" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("85%");

  await page.getByRole("button", { name: "Start a new conversation" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(panel(page)).toContainText("Usage appears here after your first question.");
});

test("applying the recommended effort updates the configured effort", async ({ page }) => {
  await start(page);
  const effort = page.getByLabel("Effort", { exact: true });
  await expect(effort).toHaveValue("medium");

  await ask(page, "What does ser mean?", 1);
  await expect(panel(page)).toContainText("recommended for your last question: Low");
  await panel(page).getByRole("button", { name: "Use Low effort" }).click();

  await expect(effort).toHaveValue("low");
  await expect(panel(page).getByRole("button", { name: /^Use .* effort$/ })).toHaveCount(0);
});

test("the cost reads as an estimate, or as unavailable for a model without a price row", async ({ page }) => {
  await start(page);
  await ask(page, "What does ser mean?", 1);
  // 120 input tokens at $1 and 24 output tokens at $5 per million.
  await expect(panel(page)).toContainText("Estimated cost: $0.00024");
  await expect(panel(page)).toContainText("not a bill");

  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await page.getByLabel("Model", { exact: true }).selectOption("mock-model-no-pricing");
  await expect(page.getByLabel("Effort", { exact: true })).toBeDisabled();
  await ask(page, "What does ser mean?", 1);
  await expect(panel(page)).toContainText("Pricing unavailable for this model.");
  await expect(panel(page)).not.toContainText("Estimated cost");
  await expect(totalRow(page)).toHaveText(/Total\s*120\s*24/);
});
