import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * User Story 6, end to end, against the production build with the mock provider and the pseudo-RTL
 * test locale `ar-XB` (`VITE_PSEUDO_LOCALE=1`, see playwright.config.ts). The pseudo locale
 * reverses and pads every catalog string, so screens are found by structure, not by their text.
 *
 * "Mirrored" is asserted from geometry rather than screenshots: text must start at the inline-start
 * edge (the right in RTL), the side panel must sit after the chat on the right, and nothing may
 * overflow horizontally. That holds on any platform, with no baseline images to keep in sync.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const ARABIC = "مرحبا بالعالم";
const HEBREW = "שלום עולם";

async function expectRtl(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar-XB");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow").toBeLessThanOrEqual(0);
}

/**
 * Distance from the text in `el` to the left and right edges of the window, or of the element
 * itself when `inOwnBox` is set (for a column that does not touch the window edge).
 */
async function textGaps(el: Locator, inOwnBox: boolean): Promise<{ left: number; right: number }> {
  return el.evaluate((node, own) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const [left, right] = own ? [box.left, box.right] : [0, window.innerWidth];
    return { left: text.left - left, right: right - text.right };
  }, inOwnBox);
}

async function expectStartsOnRight(el: Locator, inOwnBox = false): Promise<void> {
  const gaps = await textGaps(el, inOwnBox);
  expect(gaps.right, "text starts at the right edge").toBeLessThan(gaps.left);
}

async function expectStartsOnLeft(el: Locator): Promise<void> {
  const gaps = await textGaps(el, false);
  expect(gaps.left, "text starts at the left edge").toBeLessThan(gaps.right);
}

async function onboard(page: Page, mediation = "en", target = "ja"): Promise<void> {
  const selects = page.locator("select");
  await selects.nth(0).selectOption(mediation);
  await selects.nth(1).selectOption(target);
  await selects.nth(2).selectOption("B1");
  await page.getByRole("button").last().click();
}

async function enterKey(page: Page): Promise<void> {
  await page.locator('input[type="password"]').fill(VALID_KEY);
  await page.locator('input[type="radio"]').first().check();
  await page.getByRole("button").last().click();
}

async function ask(page: Page, text: string): Promise<void> {
  // Idle and empty: the composer's only button is disabled, so the previous answer has finished.
  await expect(page.locator(".composer button")).toBeDisabled();
  await page.getByRole("textbox").fill(text);
  await page.getByRole("textbox").press("Enter");
}

test.describe("right-to-left layout with the pseudo locale", () => {
  test("onboarding and key entry mirror", async ({ page }) => {
    await page.goto("/?locale=ar-XB");
    await expectRtl(page);
    await expectStartsOnRight(page.locator("label").first());
    await expectStartsOnRight(page.locator("h2").first());

    await onboard(page);
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectRtl(page);
    await expectStartsOnRight(page.locator("label").first());
  });

  test("chat, conversation list, stats panel, and the refusal and notice states mirror", async ({ page }) => {
    await page.goto("/?locale=ar-XB");
    await onboard(page);
    await enterKey(page);
    await expect(page.getByRole("textbox")).toBeVisible();
    await expectRtl(page);

    // The side panel (conversations, usage, settings) follows the chat on the right.
    const side = page.locator(".workspace__side");
    const chat = page.locator(".workspace > :not(.workspace__side)").first();
    expect((await side.boundingBox())!.x).toBeGreaterThan((await chat.boundingBox())!.x);
    await expectStartsOnRight(page.locator("nav.conversations button").first());

    // Refusal state: the mock refuses what is out of scope.
    await ask(page, "Write me an HTML app");
    await expect(page.locator("article")).toHaveCount(2);
    await expectRtl(page);

    // Notice state: a pasted key is withheld with a notice.
    await ask(page, "Why does this fail? sk-ant-api03-PASTED-BY-MISTAKE-1234567890 thanks");
    await expect(page.getByRole("status")).toBeVisible();
    await expectRtl(page);
    await expectStartsOnRight(page.locator(".guard-notice__text"), true);

    // Stats panel.
    const stats = page.locator(".stats").first();
    await expect(stats).toBeVisible();
    await expectStartsOnRight(stats.locator("h2").first());
  });

  test("the settings screen mirrors and the back chevron flips", async ({ page }) => {
    await page.goto("/");
    await page.locator("select").nth(0).selectOption("en");
    await page.locator("select").nth(1).selectOption("ja");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
    await page.getByRole("radio", { name: "This session only" }).check();
    await page.getByRole("button", { name: "Save key" }).click();

    await page.getByRole("button", { name: "Settings" }).click();
    await expectStartsOnLeft(page.locator("label").first());
    const chevron = page.locator(".icon-directional");
    expect(await chevron.evaluate((el) => getComputedStyle(el).transform)).toBe("none");

    // Switch the interface to the test locale from the settings screen itself.
    await page.getByLabel("Interface language").selectOption("ar-XB");
    await expectRtl(page);
    await expectStartsOnRight(page.locator("label").first());
    expect(await chevron.evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(-1, 0, 0, 1, 0, 0)");
  });

  test("the app starts left to right unless the test locale is asked for", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });
});

test.describe("mixed-direction messages", () => {
  test("Arabic and Hebrew inside an English message are isolated and the base direction follows the first letter", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Explanation language").selectOption("ar");
    await page.getByLabel("Language I'm learning").selectOption("he");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
    await page.getByRole("radio", { name: "This session only" }).check();
    await page.getByRole("button", { name: "Save key" }).click();

    // The interface stays English (left to right); the languages are only content.
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await ask(page, `What does ${ARABIC} mean, and ${HEBREW}? Thanks.`);
    // Wait for the turn to finish: the messages are re-rendered from storage when it ends.
    await expect(page.getByRole("article", { name: "Tarjuman" })).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".composer button")).toBeDisabled();
    const mine = page.getByRole("article", { name: "You" });
    await expect(mine).toBeVisible();
    await expect(mine).toHaveAttribute("dir", "auto");
    await expect(mine.locator("bdi")).toHaveText([ARABIC, HEBREW]);
    for (const bdi of await mine.locator("bdi").all()) {
      expect(await bdi.evaluate((el) => getComputedStyle(el).getPropertyValue("unicode-bidi"))).toBe("isolate");
    }
    // The question mark and comma stay with the English sentence, outside the isolated runs.
    await expect(mine.locator("p")).toHaveText(`What does ${ARABIC} mean, and ${HEBREW}? Thanks.`);
    await expect(page.getByRole("article", { name: "Tarjuman" })).toBeVisible();

    // A message that starts in Arabic reads right to left.
    await ask(page, `${ARABIC} means hello`);
    const arabicFirst = page.getByRole("article", { name: "You" }).last();
    await expect(arabicFirst.locator("p")).toHaveCSS("direction", "rtl");
    // The English run is the one that reads against the base direction, so it is the one isolated.
    await expect(arabicFirst.locator("bdi")).toHaveText(["means hello"]);

    // The conversation list records the languages the conversation started with.
    await expect(page.getByText("Explained in Arabic, learning Hebrew")).toBeVisible();
  });
});
