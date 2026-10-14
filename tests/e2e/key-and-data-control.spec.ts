import { expect, test, type Page } from "@playwright/test";

/**
 * User Story 7, end to end, against the production build with the mock provider
 * (`VITE_PROVIDER=mock`, see playwright.config.ts). The e2e mock accepts two keys, so a key can be
 * replaced by another valid one. Strings are the English catalog.
 *
 * Written before the settings screens exist (T135): the labels and roles below are the contract
 * `KeySettings` and `DataControls` have to meet.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const REPLACEMENT_KEY = "sk-ant-mock-valid-key-1111";
const MOCK_ANSWER = "Ser describes identity; estar describes state.";

type Mode = "Remember on this device" | "This session only";

async function enterKey(page: Page, key: string, mode: Mode, button = "Save key"): Promise<void> {
  await page.getByLabel("API key", { exact: true }).fill(key);
  await page.getByRole("radio", { name: mode }).check();
  await page.getByRole("button", { name: button }).click();
}

async function start(page: Page, mode: Mode): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByLabel("Your level").selectOption("B1");
  await page.getByRole("button", { name: "Next" }).click();
  await enterKey(page, VALID_KEY, mode);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
}

const keySettings = (page: Page) => page.getByRole("region", { name: "Your key" });
const dataControls = (page: Page) => page.getByRole("region", { name: "Your data" });

test.describe("key control", () => {
  test("shows only the masked key and where it is kept", async ({ page }) => {
    await start(page, "Remember on this device");
    await openSettings(page);
    await expect(keySettings(page)).toContainText("sk-ant-…0000");
    await expect(keySettings(page)).toContainText("Kept on this device");
    await expect(page.getByText(VALID_KEY)).toHaveCount(0);
  });

  test("replaces the key with a new valid one, which survives a reload", async ({ page }) => {
    await start(page, "Remember on this device");
    await openSettings(page);
    await keySettings(page).getByRole("button", { name: "Replace key" }).click();
    await enterKey(page, REPLACEMENT_KEY, "Remember on this device");
    await expect(keySettings(page)).toContainText("sk-ant-…1111");
    await expect(keySettings(page)).not.toContainText("sk-ant-…0000");

    await page.reload();
    await openSettings(page);
    await expect(keySettings(page)).toContainText("sk-ant-…1111");
  });

  test("a rejected replacement keeps the old key", async ({ page }) => {
    await start(page, "Remember on this device");
    await openSettings(page);
    await keySettings(page).getByRole("button", { name: "Replace key" }).click();
    await enterKey(page, "sk-ant-not-a-real-key", "Remember on this device");
    await expect(page.getByRole("alert")).toContainText("isn't valid");

    await page.reload();
    await openSettings(page);
    await expect(keySettings(page)).toContainText("sk-ant-…0000");
  });

  test("deletes the key: the app asks for one again, and the profile is kept", async ({ page }) => {
    await start(page, "Remember on this device");
    await openSettings(page);
    await keySettings(page).getByRole("button", { name: "Delete key" }).click();
    await expect(page.getByLabel("API key", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("API key", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Explanation language")).toHaveCount(0);
  });

  test("a session-only key is gone after a reload and the user is asked again", async ({ page }) => {
    await start(page, "This session only");
    await openSettings(page);
    await expect(keySettings(page)).toContainText("Kept for this session only");

    await page.reload();
    await expect(page.getByLabel("API key", { exact: true })).toBeVisible();
    await expect(page.getByText("sk-ant-…0000")).toHaveCount(0);
  });
});

test.describe("delete all my data", () => {
  test("asks for confirmation, and cancelling deletes nothing", async ({ page }) => {
    await start(page, "Remember on this device");
    await openSettings(page);
    await dataControls(page).getByRole("button", { name: "Delete all my data" }).click();
    await expect(dataControls(page)).toContainText("can't be undone");
    await dataControls(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dataControls(page).getByRole("button", { name: "Yes, delete everything" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });

  test("removes everything and returns to onboarding with nothing left on the device (SC-007)", async ({ page }) => {
    await start(page, "Remember on this device");
    await page.getByRole("textbox", { name: "Message" }).fill("What is the difference between ser and estar?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(MOCK_ANSWER)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    await openSettings(page);
    await dataControls(page).getByRole("button", { name: "Delete all my data" }).click();
    await dataControls(page).getByRole("button", { name: "Yes, delete everything" }).click();
    await expect(page.getByLabel("Explanation language")).toBeVisible();

    // Polled: Chromium can still list a just-deleted database for a moment after the deletion
    // succeeded. Nothing recreates it; the listing settles to empty on its own.
    await expect
      .poll(() =>
        page.evaluate(async () => ({
          databases: (await indexedDB.databases()).map((db) => db.name),
          caches: await caches.keys(),
        })),
      )
      .toEqual({ databases: [], caches: [] });

    await page.reload();
    await expect(page.getByLabel("Explanation language")).toBeVisible();
    await expect(page.getByText(MOCK_ANSWER)).toHaveCount(0);
  });

  test("also removes the search key, the saved resources, and the search choices (005)", async ({ page }) => {
    await start(page, "Remember on this device");
    await openSettings(page);
    const search = page.getByRole("region", { name: "Internet search" });
    await search.getByRole("button", { name: "Add search key" }).click();
    await search.getByLabel("Search API key").fill("AIzaMOCKsearchKEY0000000000000000000000");
    await search.getByRole("radio", { name: "Remember on this device" }).check();
    await search.getByRole("button", { name: "Save search key" }).click();
    await expect(search).toContainText("AIza…0000");
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("textbox", { name: "Message" }).fill("Find videos about climbing");
    await page.getByRole("button", { name: "Send" }).click();
    await page.getByRole("dialog", { name: "Search YouTube?" }).getByRole("button", { name: "Agree and search" }).click();
    await page.locator("li.resource").first().getByRole("button", { name: "Save" }).click();
    await expect(page.locator("li.resource").first().getByRole("button", { name: "Saved" })).toBeVisible();

    await openSettings(page);
    await dataControls(page).getByRole("button", { name: "Delete all my data" }).click();
    await dataControls(page).getByRole("button", { name: "Yes, delete everything" }).click();
    await expect(page.getByLabel("Explanation language")).toBeVisible();
    await expect
      .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)))
      .toEqual([]);

    // Starting over finds no search key, no saved resource, and asks for consent again.
    await start(page, "Remember on this device");
    await openSettings(page);
    await expect(search).not.toContainText("AIza…0000");
    await expect(search.getByRole("button", { name: "Add search key" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Saved resources" }).click();
    await expect(page.getByRole("region", { name: "Saved resources" })).toContainText("Nothing saved yet");
  });
});
