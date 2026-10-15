import { expect, test, type Page } from "@playwright/test";

/**
 * Feature 003, User Story 2, against the production build with the mock provider: the sidebar sits
 * beside the chat on wide screens and becomes a drawer on narrow ones (contracts/ui-shell.md),
 * nothing scrolls the page sideways at phone, tablet, or desktop width, and the learner's messages
 * and the answers are told apart by position. Geometry, not screenshots. English catalog.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const WIDTHS = [320, 768, 1280] as const;
const LONG_WORD = "a".repeat(200);
const LONG_URL = `https://example.com/${"path/".repeat(30)}end?query=${"x".repeat(60)}`;

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

async function ask(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  // Finished: Send is back (disabled while the box is empty).
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Tarjuman" }).last()).toHaveAttribute("aria-busy", "false");
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

const toggle = (page: Page) => page.getByRole("button", { name: "Show conversations" });
const conversations = (page: Page) => page.getByRole("navigation", { name: "Conversations" });

/** The chat screen fills the viewport exactly; each column scrolls on its own. */
async function verticalFit(page: Page) {
  return page.evaluate(() => {
    const side = document.querySelector(".workspace__side")?.getBoundingClientRect();
    const composer = document.querySelector("textarea")?.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollHeight - innerHeight,
      sideGap: side ? innerHeight - side.bottom : undefined,
      composerInView: composer ? composer.bottom <= innerHeight : false,
    };
  });
}

// Found in the owner's visual review (SC-010 row 11): at 67% zoom the sidebar stopped short of the
// bottom, and at 100% the page scrolled by the header's height.
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 2192, height: 1116 },
]) {
  test.describe(`chat screen height at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("the sidebar reaches the bottom and the page does not scroll", async ({ page }) => {
      await start(page);
      expect(await verticalFit(page)).toEqual({ pageOverflow: 0, sideGap: 0, composerInView: true });
    });

    test("a long conversation scrolls inside its column, with the composer still in view", async ({ page }) => {
      await start(page);
      for (let i = 0; i < 3; i++) await ask(page, "LAYOUT-STRESS-TEST");
      expect(await verticalFit(page)).toEqual({ pageOverflow: 0, sideGap: 0, composerInView: true });
    });
  });
}

test.describe("narrow chat screen height", () => {
  test.use({ viewport: { width: 768, height: 800 } });

  test("the page does not scroll and the composer stays in view", async ({ page }) => {
    await start(page);
    for (let i = 0; i < 3; i++) await ask(page, "LAYOUT-STRESS-TEST");
    const fit = await verticalFit(page);
    expect({ pageOverflow: fit.pageOverflow, composerInView: fit.composerInView }).toEqual({ pageOverflow: 0, composerInView: true });
  });
});

test.describe("wide layout", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the sidebar is visible beside the chat, with no drawer toggle", async ({ page }) => {
    await start(page);
    await expect(conversations(page)).toBeVisible();
    await expect(toggle(page)).toBeHidden();
    const side = (await conversations(page).boundingBox())!;
    const chat = (await page.getByRole("region", { name: "Chat" }).boundingBox())!;
    expect(side.x + side.width, "sidebar ends before the chat starts").toBeLessThanOrEqual(chat.x);
  });
});

for (const width of [320, 768] as const) {
  test.describe(`drawer at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("the sidebar hides behind a toggle; Escape, the close button, and choosing a conversation close it", async ({
      page,
    }) => {
      await start(page);
      await ask(page, "What is the difference between ser and estar?");
      await expect(conversations(page)).toBeHidden();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");

      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(conversations(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(conversations(page)).toBeHidden();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(toggle(page)).toBeFocused();

      await toggle(page).click();
      await page.getByRole("button", { name: "Hide conversations" }).click();
      await expect(conversations(page)).toBeHidden();
      await expect(toggle(page)).toBeFocused();

      await toggle(page).click();
      await conversations(page).getByRole("listitem").first().getByRole("button").first().click();
      await expect(conversations(page)).toBeHidden();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    });

    test("the content behind the open drawer is inert", async ({ page }) => {
      await start(page);
      await toggle(page).click();
      const inert = await page.getByRole("textbox", { name: "Message", includeHidden: true }).evaluate((el) => el.closest("[inert]") !== null);
      expect(inert).toBe(true);
    });
  });
}

for (const width of WIDTHS) {
  test.describe(`chat at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("nothing scrolls sideways after wide answers and messages", async ({ page }) => {
      await start(page);
      await ask(page, "What is the difference between ser and estar?");
      await ask(page, "HOSTILE-RENDER-TEST please explain");
      await ask(page, "LAYOUT-STRESS-TEST please explain");
      await ask(page, `A long word ${LONG_WORD} and a long address ${LONG_URL}`);
      const answer = page.getByRole("article", { name: "Tarjuman" }).nth(2);
      await expect(answer.locator("table")).toBeVisible();
      await expect(answer.locator("pre")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    test("the learner's message sits at inline-end and the answer at inline-start", async ({ page }) => {
      await start(page);
      await ask(page, "What is the difference between ser and estar?");
      const mine = (await page.getByRole("article", { name: "You" }).boundingBox())!;
      const answer = (await page.getByRole("article", { name: "Tarjuman" }).boundingBox())!;
      expect(mine.x + mine.width, "right edges").toBeGreaterThan(answer.x + answer.width - 1);
      expect(mine.x, "left edges").toBeGreaterThan(answer.x);
    });
  });
}

test("while an answer streams, the Stop button and the streaming label are visible", async ({ page }) => {
  await start(page, "?mockLatencyMs=400");
  await page.getByRole("textbox", { name: "Message" }).fill("What is the difference between ser and estar?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByText("Writing…")).toBeVisible();
  await expect(page.getByText("Writing…")).toBeHidden({ timeout: 15_000 });
});

/*
 * User Story 4 (SC-005): every screen, at every width, in English, Spanish, and the pseudo-RTL
 * locale. The pseudo locale rewrites every string, so these flows find controls by structure.
 */
const settingsButton = (page: Page) => page.locator(".workspace__side button:has(.lucide-settings)");
const drawerToggle = (page: Page) => page.locator(".workspace__toolbar button");

async function expectNoOverflow(page: Page, screen: string): Promise<void> {
  expect(await horizontalOverflow(page), `${screen}: horizontal overflow`).toBeLessThanOrEqual(0);
}

async function onboardByStructure(page: Page): Promise<void> {
  await page.locator("main select").nth(0).selectOption("en");
  await page.locator("main select").nth(1).selectOption("ar");
  await page.locator("main button").last().click();
}

async function enterKeyByStructure(page: Page): Promise<void> {
  await page.locator('input[type="password"]').fill(VALID_KEY);
  await page.locator('input[type="radio"]').last().check();
  await page.locator("main button").last().click();
  await expect(page.locator(".composer textarea")).toBeVisible();
}

async function askByStructure(page: Page, text: string): Promise<void> {
  await page.locator(".composer textarea").fill(text);
  await page.locator(".composer textarea").press("Enter");
  await expect(page.locator(".composer button")).toBeDisabled();
  await expect(page.locator("article[aria-busy]").last()).toHaveAttribute("aria-busy", "false");
}

async function checkChatAndSettings(page: Page, width: number, label: string): Promise<void> {
  await askByStructure(page, "LAYOUT-STRESS-TEST اَلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ");
  await expectNoOverflow(page, `${label} chat`);
  if (width < 1024) {
    await drawerToggle(page).click();
    await expect(settingsButton(page)).toBeVisible();
    await expectNoOverflow(page, `${label} chat, drawer open`);
  }
  await settingsButton(page).click();
  await expect(page.locator(".settings-screen")).toBeVisible();
  await expectNoOverflow(page, `${label} settings`);
}

for (const width of WIDTHS) {
  test.describe(`every screen at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("English and Spanish", async ({ page }) => {
      await page.goto("/");
      await expectNoOverflow(page, "en onboarding");
      await onboardByStructure(page);
      await expectNoOverflow(page, "en key entry");
      await enterKeyByStructure(page);
      await checkChatAndSettings(page, width, "en");

      // Spanish: switch here; "delete all" then shows the first-run screens in Spanish.
      await page.getByLabel("Interface language").selectOption("es");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expectNoOverflow(page, "es settings");
      await page.locator(".settings-card button").last().click();
      await page.locator(".settings-danger .button--danger").click();
      await expect(page.locator(".screen-card")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expectNoOverflow(page, "es onboarding");
      await onboardByStructure(page);
      await expectNoOverflow(page, "es key entry");
      await enterKeyByStructure(page);
      await checkChatAndSettings(page, width, "es");
    });

    test("the pseudo-RTL interface (ar-XB)", async ({ page }) => {
      await page.goto("/?locale=ar-XB");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expectNoOverflow(page, "ar-XB onboarding");
      await onboardByStructure(page);
      await expectNoOverflow(page, "ar-XB key entry");
      await enterKeyByStructure(page);
      await checkChatAndSettings(page, width, "ar-XB");
    });
  });
}

test.describe("right-to-left drawer and directional icons (ar-XB)", () => {
  test.use({ viewport: { width: 768, height: 800 } });

  const MIRRORED = "matrix(-1, 0, 0, 1, 0, 0)";
  const transformOf = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((el) => getComputedStyle(el).transform);

  test("the drawer opens from the right edge, and the send, drawer, and back icons are mirrored", async ({ page }) => {
    await page.goto("/?locale=ar-XB");
    await onboardByStructure(page);
    await enterKeyByStructure(page);
    expect(await transformOf(page, ".composer .icon-directional")).toBe(MIRRORED);
    expect(await transformOf(page, ".workspace__toolbar .icon-directional")).toBe(MIRRORED);

    await drawerToggle(page).click();
    const side = page.locator(".workspace__side");
    await expect(side).toBeVisible();
    // Let the slide finish, then the drawer must touch the right edge and not the left.
    await expect.poll(async () => {
      const box = (await side.boundingBox())!;
      return Math.round(box.x + box.width);
    }).toBe(768);
    expect((await side.boundingBox())!.x).toBeGreaterThan(0);

    await settingsButton(page).click();
    expect(await transformOf(page, ".settings-screen__back .icon-directional")).toBe(MIRRORED);
  });

  test("in English the same icons are not mirrored and the drawer opens from the left", async ({ page }) => {
    await start(page);
    expect(await transformOf(page, ".composer .icon-directional")).toBe("none");
    await drawerToggle(page).click();
    const side = page.locator(".workspace__side");
    await expect.poll(async () => Math.round((await side.boundingBox())!.x)).toBe(0);
  });
});
