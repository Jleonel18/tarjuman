import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Feature 003, User Story 3, against the production build with the mock provider. On every screen
 * and state, in both themes: axe finds no color-contrast violation (SC-002), and tabbing reaches
 * every control, each with a visible focus outline of at least 2px (SC-007). English catalog.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const PASTED_KEY = "sk-ant-api03-PASTED-BY-MISTAKE-1234567890";

// macOS keyboard settings make Firefox and WebKit tab only to text fields by default. Ask both for
// "every control", as a keyboard user on macOS would (Firefox's pref; Option+Tab in WebKit).
test.use({ launchOptions: { firefoxUserPrefs: { "accessibility.tabfocus": 7 } } });
let TAB = "Tab";
test.beforeEach(({ browserName }) => {
  TAB = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
});

async function expectContrast(page: Page, screen: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const found = violations.flatMap((v) => v.nodes.map((n) => `${screen}: ${n.target.join(" ")} — ${n.failureSummary ?? ""}`));
  expect(found).toEqual([]);
}

/** Tabs through the page and checks each stop; then checks every enabled, visible control was a stop. */
async function expectFocusWalk(page: Page, screen: string): Promise<void> {
  // Clicking the title moves the browser's tab starting point to the top of the page.
  await page.locator("h1").click();
  const controls = await page.evaluate(() => {
    const all = document.querySelectorAll<HTMLElement>("button, select, textarea, input, a[href]");
    let n = 0;
    for (const el of all) {
      const visible = el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const enabled = !(el as HTMLButtonElement).disabled && !el.closest("[inert]");
      if (visible && enabled) el.dataset["a11yId"] = String(n++);
    }
    return n;
  });
  const reached = new Set<string>();
  const problems: string[] = [];
  for (let i = 0; i < controls + 15; i += 1) {
    await page.keyboard.press(TAB);
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return undefined;
      const style = getComputedStyle(el);
      return {
        id: el.dataset["a11yId"],
        name: `${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? ""}`,
        outline: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
      };
    });
    if (!stop) continue;
    if (stop.outline === "none" || stop.width < 2) problems.push(`${screen}: ${stop.name} has no visible focus`);
    if (stop.id !== undefined) reached.add(stop.id);
  }
  // Radios in one group are a single tab stop, so only one of a checked group must be reached.
  const missed = await page.evaluate((ids) => {
    const names = new Set<string>();
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-a11y-id]")) {
      const id = el.dataset["a11yId"] ?? "";
      if (ids.includes(id)) {
        if (el instanceof HTMLInputElement && el.type === "radio") names.add(el.name);
        continue;
      }
      if (el instanceof HTMLInputElement && el.type === "radio") continue;
      out.push(`${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? ""}`);
    }
    for (const el of document.querySelectorAll<HTMLInputElement>("input[type=radio][data-a11y-id]")) {
      if (!names.has(el.name)) out.push(`radio group ${el.name}`);
    }
    return [...new Set(out)];
  }, [...reached]);
  expect(problems).toEqual([]);
  expect(missed.map((m) => `${screen}: not reachable: ${m}`)).toEqual([]);
}

async function check(page: Page, screen: string): Promise<void> {
  await expectContrast(page, screen);
  await expectFocusWalk(page, screen);
}

async function onboard(page: Page): Promise<void> {
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByRole("button", { name: "Next" }).click();
}

async function enterKey(page: Page): Promise<void> {
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

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 900 } });

    test("onboarding, with its validation error", async ({ page }) => {
      await page.goto("/");
      await check(page, "onboarding");
      await page.getByLabel("Explanation language").selectOption("ja");
      await page.getByLabel("Language I'm learning").selectOption("ja");
      await expect(page.getByRole("alert")).toBeVisible();
      await check(page, "onboarding error");
    });

    test("key entry, with the invalid-key error", async ({ page }) => {
      await page.goto("/");
      await onboard(page);
      await check(page, "key entry");
      await page.getByLabel("API key", { exact: true }).fill("sk-ant-not-a-real-key");
      await page.getByRole("radio", { name: "This session only" }).check();
      await page.getByRole("button", { name: "Save key" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await check(page, "key entry error");
    });

    test("key entry with storage unavailable", async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
      });
      await page.goto("/");
      await onboard(page);
      await expect(page.getByRole("status")).toBeVisible();
      await check(page, "storage unavailable");
    });

    test("chat: an answer, a refusal, the guard notice, the context notice, and a provider error", async ({ page }) => {
      await page.goto("/");
      await onboard(page);
      await enterKey(page);
      await ask(page, "HOSTILE-RENDER-TEST please explain");
      await ask(page, "Write me an HTML app");
      await ask(page, `Why does this fail? ${PASTED_KEY} thanks`);
      await expect(page.getByText("looks like an API key")).toBeVisible();
      await check(page, "chat with guard notice");
      await ask(page, "HIGH-USAGE-TEST");
      await expect(page.getByRole("status")).toContainText("85%");
      await check(page, "chat with context notice");
      await ask(page, "PROVIDER-ERROR-TEST");
      await expect(page.getByRole("alert")).toBeVisible();
      await check(page, "chat with provider error");
    });

    test("settings: languages, theme, key, and data controls with the confirm step", async ({ page }) => {
      await page.goto("/");
      await onboard(page);
      await enterKey(page);
      await page.getByRole("button", { name: "Settings" }).click();
      await check(page, "settings");
      await page.getByRole("button", { name: "Delete all my data" }).click();
      await expect(page.getByRole("button", { name: "Yes, delete everything" })).toBeVisible();
      await check(page, "settings confirm delete");
    });
  });
}
