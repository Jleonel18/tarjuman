import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Resource curation (005), end to end against the production build with the mock provider and the
 * scripted search source (`VITE_PROVIDER=mock`, see playwright.config.ts). The mock model searches
 * with the learner's own words, shows the first three results, and answers; the search double
 * answers "nothing" with no results and "fail" with a failure. No real request leaves the app.
 */
const MODEL_KEY = "sk-ant-mock-valid-key-0000";
const SEARCH_KEY = "AIzaMOCKsearchKEY0000000000000000000000";

function recordTraffic(context: BrowserContext): string[] {
  const urls: string[] = [];
  context.on("request", (request) => urls.push(request.url()));
  return urls;
}

type Mode = "Remember on this device" | "This session only";

async function onboard(page: Page, interests: string[], mode: Mode = "This session only"): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByLabel("Your level").selectOption("B1");
  for (const interest of interests) {
    await page.getByLabel("Add an interest").fill(interest);
    await page.getByRole("button", { name: "Add" }).click();
  }
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("API key", { exact: true }).fill(MODEL_KEY);
  await page.getByRole("radio", { name: mode }).check();
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

const searchSettings = (page: Page) => page.getByRole("region", { name: "Internet search" });

async function addSearchKey(page: Page, mode: Mode = "This session only"): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await searchSettings(page).getByRole("button", { name: "Add search key" }).click();
  await searchSettings(page).getByLabel("Search API key").fill(SEARCH_KEY);
  await searchSettings(page).getByRole("radio", { name: mode }).check();
  await searchSettings(page).getByRole("button", { name: "Save search key" }).click();
  await expect(searchSettings(page)).toContainText("AIza…0000");
  await page.getByRole("button", { name: "Back" }).click();
}

async function setUp(page: Page, interests = ["climbing"], mode: Mode = "This session only"): Promise<void> {
  await onboard(page, interests, mode);
  await addSearchKey(page, mode);
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const answers = (page: Page) => page.getByRole("article", { name: "Tarjuman" });
const cards = (page: Page) => page.getByRole("region", { name: "Suggested resources" }).locator("li.resource");
const consent = (page: Page) => page.getByRole("dialog", { name: "Search YouTube?" });

async function agree(page: Page): Promise<void> {
  await expect(consent(page)).toBeVisible();
  await consent(page).getByRole("button", { name: "Agree and search" }).click();
}

test.describe("finding resources", () => {
  test("asks for consent first, then shows cards with their labels and only real links", async ({ page, context }) => {
    const traffic = recordTraffic(context);
    await setUp(page);
    await send(page, "Find videos about climbing");

    // The consent dialog says what is sent and links the terms and privacy policy.
    await expect(consent(page)).toContainText("What is sent");
    await expect(consent(page).getByRole("link", { name: "YouTube API Services Terms of Service" })).toHaveAttribute(
      "href",
      "https://www.youtube.com/t/terms",
    );
    await expect(consent(page).getByRole("link", { name: "Google Privacy Policy" })).toHaveAttribute(
      "href",
      "https://policies.google.com/privacy",
    );
    await consent(page).getByRole("button", { name: "Agree and search" }).click();

    await expect(cards(page)).toHaveCount(3);
    const first = cards(page).first();
    await expect(first).toContainText("YouTube (youtube.com) · Mock Channel");
    await expect(first).toContainText("Video");
    await expect(first).toContainText("Free");
    await expect(first).toContainText("About right for you (estimate)");
    await expect(first).toContainText("Clear speech and captions");
    await expect(first).toContainText("Language: Spanish");

    const link = first.getByRole("link", { name: /Open on YouTube/ });
    await expect(link).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");

    // Nothing is loaded for the cards, and nothing left the app.
    await expect(page.locator("img, iframe")).toHaveCount(0);
    expect(traffic.filter((url) => !url.startsWith("data:") && new URL(url).origin !== new URL(page.url()).origin)).toEqual([]);

    // The question appears once, not twice, even though it was sent again after agreeing.
    await expect(page.getByRole("article", { name: "You" })).toHaveCount(1);
  });

  test("the usage panel counts the searches and the model calls, and prices only the tokens", async ({ page }) => {
    await setUp(page);
    await send(page, "Find videos about climbing");
    await agree(page);
    await expect(cards(page)).toHaveCount(3);
    const usage = page.getByRole("region", { name: "Usage" });
    await expect(usage).toContainText("Searches: 1 (YouTube, free daily allowance)");
    // One call spent before the consent was asked (its tokens still count) and three after it.
    await expect(usage).toContainText("Model calls: 4");
    await expect(usage).toContainText("Estimated cost");
  });

  test("a reload keeps the cards, and consent is not asked again", async ({ page }) => {
    await setUp(page, ["climbing"], "Remember on this device");
    await send(page, "Find videos about climbing");
    await agree(page);
    await expect(cards(page)).toHaveCount(3);

    await page.reload();
    await expect(cards(page)).toHaveCount(3);
    await send(page, "More videos please");
    await expect(consent(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(6);
  });

  test("cancelling the consent sends nothing and says so", async ({ page }) => {
    await setUp(page);
    await send(page, "Find videos about climbing");
    await expect(consent(page)).toBeVisible();
    await consent(page).getByRole("button", { name: "Cancel" }).click();
    await expect(consent(page)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Search was not allowed" })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole("article", { name: "You" })).toHaveCount(0);
  });

  test("Escape on the consent dialog counts as Cancel", async ({ page }) => {
    await setUp(page);
    await send(page, "Find videos about climbing");
    await expect(consent(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(consent(page)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Search was not allowed" })).toBeVisible();
  });

  test("no results gives a plain message and no cards", async ({ page }) => {
    await setUp(page);
    await send(page, "Find videos about nothing");
    await agree(page);
    await expect(answers(page).last()).toContainText("could not find anything");
    await expect(cards(page)).toHaveCount(0);
  });

  test("a second search that fails keeps the first search's cards and says the list may be incomplete", async ({ page }) => {
    await setUp(page);
    await send(page, "Find videos about climbing TWO-SEARCHES");
    await agree(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole("status").filter({ hasText: "may be incomplete" })).toBeVisible();
  });

  test("with no topic and no interests the model asks what the learner likes", async ({ page }) => {
    await setUp(page, []);
    await send(page, "Find me something to watch");
    await expect(answers(page).last()).toContainText("What topics do you enjoy?");
    await expect(consent(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
  });
});

test.describe("turning search off and on", () => {
  test("with search off the model is not offered the tools, so no consent is asked and nothing is searched", async ({ page }) => {
    await setUp(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await searchSettings(page).getByLabel("Search YouTube for videos and songs when I ask for them").uncheck();
    await page.getByRole("button", { name: "Back" }).click();
    await send(page, "Find videos about climbing");
    await expect(answers(page).last()).toHaveAttribute("aria-busy", "false");
    await expect(consent(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
  });

  test("the key can be replaced and deleted, and is only ever shown masked", async ({ page }) => {
    await setUp(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(searchSettings(page)).toContainText("AIza…0000");
    await expect(page.getByText(SEARCH_KEY)).toHaveCount(0);
    await searchSettings(page).getByRole("button", { name: "Delete key" }).click();
    await expect(searchSettings(page).getByRole("button", { name: "Add search key" })).toBeVisible();
    await expect(searchSettings(page)).not.toContainText("AIza…0000");
  });

  test("a model key typed as the search key is refused before anything is sent", async ({ page }) => {
    await onboard(page, ["climbing"]);
    await page.getByRole("button", { name: "Settings" }).click();
    await searchSettings(page).getByRole("button", { name: "Add search key" }).click();
    await searchSettings(page).getByLabel("Search API key").fill(MODEL_KEY);
    await searchSettings(page).getByRole("radio", { name: "This session only" }).check();
    await searchSettings(page).getByRole("button", { name: "Save search key" }).click();
    await expect(searchSettings(page).getByRole("alert")).toContainText("not a Google Cloud key for YouTube");
  });
});

test.describe("saved resources and the 30-day rule", () => {
  const DAY = 86_400_000;
  const saved = (page: Page) => page.getByRole("region", { name: "Saved resources" });
  const savedCards = (page: Page) => saved(page).locator("li.resource");

  async function findAndSave(page: Page): Promise<void> {
    await send(page, "Find videos about climbing");
    await agree(page);
    await expect(cards(page)).toHaveCount(3);
    await cards(page).nth(0).getByRole("button", { name: "Save" }).click();
    await cards(page).nth(1).getByRole("button", { name: "Save" }).click();
    await expect(cards(page).nth(0).getByRole("button", { name: "Saved" })).toBeDisabled();
    await expect(cards(page).nth(1).getByRole("button", { name: "Saved" })).toBeDisabled();
  }

  test("saves two cards, keeps them after a reload, and removes one", async ({ page }) => {
    await setUp(page, ["climbing"], "Remember on this device");
    await findAndSave(page);

    await page.reload();
    await page.getByRole("button", { name: "Saved resources" }).click();
    await expect(savedCards(page)).toHaveCount(2);
    await expect(savedCards(page).first()).toContainText("YouTube (youtube.com) · Mock Channel");
    await expect(savedCards(page).first()).toContainText("Clear speech and captions");

    await saved(page).getByRole("button", { name: "Remove from saved" }).first().click();
    await expect(savedCards(page)).toHaveCount(1);
    await page.reload();
    await page.getByRole("button", { name: "Saved resources" }).click();
    await expect(savedCards(page)).toHaveCount(1);
  });

  test("after 31 days the details are gone, in the list and in the conversation, until Refresh fetches them again", async ({ page }) => {
    await setUp(page, ["climbing"], "Remember on this device");
    await findAndSave(page);
    const title = await cards(page).first().locator(".resource__title").innerText();

    await page.clock.setFixedTime(new Date(Date.now() + 31 * DAY));
    await page.reload();

    // In the conversation: the card is expired and shows no title.
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).first()).toContainText("older than 30 days");
    await expect(page.getByText(title)).toHaveCount(0);

    // In the saved list, too.
    await page.getByRole("button", { name: "Saved resources" }).click();
    await expect(savedCards(page)).toHaveCount(2);
    await expect(savedCards(page).first()).toContainText("older than 30 days");
    await expect(page.getByText(title)).toHaveCount(0);

    await savedCards(page).first().getByRole("button", { name: "Refresh" }).click();
    await expect(savedCards(page).first().locator(".resource__title")).toContainText("Mock video");
    await expect(savedCards(page).first()).not.toContainText("older than 30 days");
    await expect(savedCards(page).nth(1)).toContainText("older than 30 days");
  });
});
