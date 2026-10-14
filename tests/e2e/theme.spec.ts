import { expect, test, type Page } from "@playwright/test";

/**
 * Feature 003, User Story 1, against the production build with the mock provider: the device theme
 * applies from the first frame, an explicit choice persists and also applies from the first frame,
 * a change takes effect at once with no reload, "follow system" tracks the device, and "delete all
 * my data" forgets the choice (contracts/theme-preference.md). Strings are the English catalog.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
/** `--color-canvas` in each theme (contracts/design-tokens.md), as getComputedStyle reports it. */
const CANVAS = { light: "rgb(249, 249, 255)", dark: "rgb(12, 20, 25)" } as const;

/** Records the <html> background on the first animation frame, which comes before the first paint. */
async function recordFirstFrame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      (window as unknown as { firstFrame: string }).firstFrame = getComputedStyle(document.documentElement).backgroundColor;
    });
  });
}

async function firstFrame(page: Page): Promise<string> {
  await page.waitForFunction(() => (window as unknown as { firstFrame?: string }).firstFrame !== undefined);
  return page.evaluate(() => (window as unknown as { firstFrame: string }).firstFrame);
}

const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const headerTheme = (page: Page) => page.locator("header").getByLabel("Theme");

async function start(page: Page, query = ""): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await page.getByRole("radio", { name: "This session only" }).check();
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

test.describe("first paint", () => {
  test("a dark device with no saved choice paints dark from the first frame", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await recordFirstFrame(page);
    await page.goto("/");
    expect(await firstFrame(page)).toBe(CANVAS.dark);
    await expect(page.getByLabel("Explanation language")).toBeVisible();
    expect(await canvas(page)).toBe(CANVAS.dark);
  });

  test("a saved light choice on a dark device paints light from the first frame", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("tarjuman.theme", "light"));
    await recordFirstFrame(page);
    await page.goto("/");
    expect(await firstFrame(page)).toBe(CANVAS.light);
    await expect(headerTheme(page)).toHaveValue("light");
  });
});

test.describe("choosing a theme", () => {
  test("the header control on onboarding applies Dark in under 100 ms without a reload, and it survives a reload", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(headerTheme(page)).toHaveValue("system");
    expect(await canvas(page)).toBe(CANVAS.light);

    const elapsed = await page.evaluate(async (dark) => {
      (window as unknown as { sameDocument: boolean }).sameDocument = true;
      const select = document.querySelector<HTMLSelectElement>("header select");
      if (!select) throw new Error("no header theme control");
      const started = performance.now();
      select.value = "dark";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      while (getComputedStyle(document.documentElement).backgroundColor !== dark) {
        await new Promise(requestAnimationFrame);
        if (performance.now() - started > 2000) break;
      }
      return performance.now() - started;
    }, CANVAS.dark);
    expect(elapsed).toBeLessThan(100);
    expect(await page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument)).toBe(true);
    expect(await canvas(page)).toBe(CANVAS.dark);

    await recordFirstFrame(page);
    await page.reload();
    expect(await firstFrame(page)).toBe(CANVAS.dark);
    await expect(headerTheme(page)).toHaveValue("dark");
  });

  test('"follow system" tracks the device without a reload, also while an answer streams', async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await start(page, "?mockLatencyMs=150");
    await headerTheme(page).selectOption("dark");
    await headerTheme(page).selectOption("system");
    expect(await canvas(page)).toBe(CANVAS.light);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => canvas(page)).toBe(CANVAS.dark);

    await page.getByRole("textbox", { name: "Message" }).fill("What is the difference between ser and estar?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => canvas(page)).toBe(CANVAS.light);
    // The stream was not interrupted: it finishes on its own.
    await expect(page.getByRole("article", { name: "Tarjuman" })).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
    await expect(page.getByText("This answer was interrupted")).toHaveCount(0);
  });

  test("the Settings control and the header control show the same value", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.locator("main");

    await settings.getByRole("radio", { name: "Dark" }).check();
    await expect(headerTheme(page)).toHaveValue("dark");

    await headerTheme(page).selectOption("light");
    await expect(settings.getByRole("radio", { name: "Light" })).toBeChecked();
    await expect(settings.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });
});

test.describe("delete all my data", () => {
  test("forgets the theme choice and the app follows the device again", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await start(page);
    await headerTheme(page).selectOption("dark");
    expect(await canvas(page)).toBe(CANVAS.dark);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Delete all my data" }).click();
    await page.getByRole("button", { name: "Yes, delete everything" }).click();
    // Back at first-run onboarding (the settings screen has an "Explanation language" field too).
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();

    const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("tarjuman.")));
    expect(keys).toEqual([]);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    await expect(headerTheme(page)).toHaveValue("system");
    expect(await canvas(page)).toBe(CANVAS.light);
  });
});
