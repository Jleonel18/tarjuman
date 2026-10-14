import { expect, test, type Page } from "@playwright/test";

/**
 * Feature 003, User Story 4, against the production build: the Arabic face downloads only when
 * Arabic text is on screen and from the app's own origin, text never waits for a font (FR-014,
 * SC-009), and vocalized Arabic gets room for its marks (FR-013, SC-006). English catalog.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const APP_ORIGIN = "http://localhost:5173";
const VOCALIZED = "اَلسَّلَامُ عَلَيْكُمْ";

function watchFonts(page: Page): string[] {
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".woff2")) fonts.push(request.url());
  });
  return fonts;
}

const isArabic = (url: string) => /-arabic-wght/.test(url);

async function start(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await page.getByRole("radio", { name: "This session only" }).check();
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

async function ask(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

test("a page with only Latin text does not download the Arabic font", async ({ page }) => {
  const fonts = watchFonts(page);
  await start(page);
  await ask(page, "What is the difference between ser and estar?");
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.some((url) => !isArabic(url)), "the Latin font is used").toBe(true);
  expect(fonts.filter(isArabic)).toEqual([]);
});

test("Arabic text on screen downloads the Arabic font from the app's own origin", async ({ page }) => {
  const fonts = watchFonts(page);
  await start(page);
  await ask(page, `What does ${VOCALIZED} mean?`);
  await expect.poll(() => fonts.filter(isArabic).length).toBeGreaterThan(0);
  for (const url of fonts) expect(new URL(url).origin).toBe(APP_ORIGIN);
});

test("text shows at once in a fallback font while the fonts are slow", async ({ page }) => {
  await page.route("**/*.woff2", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  const started = Date.now();
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Let's get to know you" })).toBeVisible({ timeout: 1000 });
  expect(Date.now() - started).toBeLessThan(1000);
});

test("vocalized Arabic has room for its marks and is never clipped", async ({ page }) => {
  await start(page);
  await ask(page, `${VOCALIZED} ${VOCALIZED}`);
  await page.evaluate(() => document.fonts.ready);
  const line = page.getByRole("article", { name: "You" }).locator("p");
  const metrics = await line.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = range.getClientRects();
    const bubble = el.closest("article") as HTMLElement;
    return {
      fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
      lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
      height: el.getBoundingClientRect().height,
      lineCount: new Set([...lines].map((r) => Math.round(r.top))).size,
      bubbleClipped: bubble.scrollHeight > bubble.clientHeight + 1,
      overflow: getComputedStyle(bubble).overflowY,
    };
  });
  expect(metrics.lineHeight).toBeGreaterThanOrEqual(1.6 * metrics.fontSize);
  expect(metrics.height / metrics.lineCount).toBeGreaterThanOrEqual(1.6 * metrics.fontSize - 1);
  expect(metrics.bubbleClipped).toBe(false);
  expect(metrics.overflow).toBe("visible");
});
