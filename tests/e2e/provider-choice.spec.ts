import { expect, test, type Page } from "@playwright/test";

/**
 * Feature 004, end to end, against the production build with mock providers. `?mockProviders=2`
 * makes the mock build offer two providers ("mock" and "mock-alt"), as the product offers Anthropic
 * and Gemini; without it the build offers one, so every other spec runs unchanged.
 *
 * The wrong-provider check needs real key shapes, which mock providers do not have: it is covered
 * by the KeyManager and controller tests instead.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const MOCK_ANSWER = "Ser describes identity; estar describes state.";
const TWO_PROVIDERS = "/?mockProviders=2";

async function fillProfile(page: Page): Promise<void> {
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByLabel("Your level").selectOption("B1");
}

async function enterKey(page: Page, key: string): Promise<void> {
  await page.getByLabel("API key", { exact: true }).fill(key);
  await page.getByRole("radio", { name: "This session only" }).check();
  await page.getByRole("button", { name: "Save key" }).click();
}

test.describe("choosing a provider (004 US1)", () => {
  test("with one provider there is nothing to choose", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("group", { name: "AI service" })).toHaveCount(0);
  });

  test("onboarding offers both providers with none preselected, and Next waits for a choice", async ({ page }) => {
    await page.goto(TWO_PROVIDERS);
    const group = page.getByRole("group", { name: "AI service" });
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(group.getByRole("radio", { name: "mock", exact: true })).not.toBeChecked();
    await expect(group.getByRole("radio", { name: "mock-alt", exact: true })).not.toBeChecked();

    await fillProfile(page);
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await group.getByRole("radio", { name: "mock-alt", exact: true }).check();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("the chosen provider is the one the key screen names, the model list shows, and the chat uses", async ({ page }) => {
    await page.goto(TWO_PROVIDERS);
    await fillProfile(page);
    await page.getByRole("group", { name: "AI service" }).getByRole("radio", { name: "mock-alt", exact: true }).check();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("AI service: mock-alt")).toBeVisible();
    await enterKey(page, VALID_KEY);

    const model = page.getByLabel("Model", { exact: true });
    await expect(model.locator("option")).toHaveText(["Mock alt model"]);

    await page.getByRole("textbox", { name: "Message" }).fill("ser vs estar?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(MOCK_ANSWER)).toBeVisible();
  });
});

test.describe("switching provider in settings (004 US2)", () => {
  const providerSettings = (page: Page) => page.getByRole("region", { name: "AI service" });
  // `click`, not `check`: switching to a provider without a key leaves the settings screen at once,
  // so the radio is gone before Playwright could confirm it is checked.
  const switchTo = (page: Page, id: string) => providerSettings(page).getByRole("radio", { name: id, exact: true }).click();

  async function startOnMock(page: Page): Promise<void> {
    await page.goto(TWO_PROVIDERS);
    await fillProfile(page);
    await page.getByRole("group", { name: "AI service" }).getByRole("radio", { name: "mock", exact: true }).check();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
    await page.getByRole("radio", { name: "Remember on this device" }).check();
    await page.getByRole("button", { name: "Save key" }).click();
    await page.getByRole("textbox", { name: "Message" }).fill("What is the difference between ser and estar?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(MOCK_ANSWER)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  }

  test("asks for a key when the new provider has none, then continues the same conversation", async ({ page }) => {
    await startOnMock(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(providerSettings(page)).toContainText("mock: key sk-ant-…0000");
    await expect(providerSettings(page)).toContainText("mock-alt: no key yet");

    await switchTo(page, "mock-alt");
    await expect(page.getByText("AI service: mock-alt")).toBeVisible();
    await enterKey(page, VALID_KEY);

    // The earlier answer is still there, and the next one comes from the new provider.
    await expect(page.getByText(MOCK_ANSWER)).toHaveCount(1);
    await page.getByRole("textbox", { name: "Message" }).fill("And haber?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(MOCK_ANSWER)).toHaveCount(2);
    await expect(page.getByLabel("Model", { exact: true }).locator("option")).toHaveText(["Mock alt model"]);
  });

  test("switching back to a provider with a stored key asks for nothing", async ({ page }) => {
    await startOnMock(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await switchTo(page, "mock-alt");
    await enterKey(page, VALID_KEY);

    await page.getByRole("button", { name: "Settings" }).click();
    await switchTo(page, "mock");
    await expect(providerSettings(page).getByRole("radio", { name: "mock", exact: true })).toBeChecked();
    await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Your key" })).toContainText("sk-ant-…0000");
  });

  test("delete all my data removes both providers' keys", async ({ page }) => {
    await startOnMock(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await switchTo(page, "mock-alt");
    await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
    await page.getByRole("radio", { name: "Remember on this device" }).check();
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

    await page.getByRole("button", { name: "Settings" }).click();
    const data = page.getByRole("region", { name: "Your data" });
    await data.getByRole("button", { name: "Delete all my data" }).click();
    await data.getByRole("button", { name: "Yes, delete everything" }).click();
    await expect(page.getByLabel("Explanation language")).toBeVisible();
    // Polled, as in key-and-data-control.spec.ts: Chromium can list a just-deleted database briefly.
    await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name))).toEqual([]);
  });
});
