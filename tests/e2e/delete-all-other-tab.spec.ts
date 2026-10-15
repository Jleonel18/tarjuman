import { expect, test, type Page } from "@playwright/test";

/**
 * "Delete all my data" with a second Tarjuman tab open (001 FR-017a, US7 scenario 4, security
 * review finding 1). Both pages share one browser context, so they share IndexedDB like two tabs.
 * The second tab is streaming a slow answer when the first one deletes: that answer must not be
 * written back. Strings are the English catalog.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";

async function onboard(page: Page): Promise<void> {
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByLabel("Your level").selectOption("B1");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await page.getByRole("radio", { name: "Remember on this device" }).check();
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

/** Every record left in Tarjuman's database, by store; empty when there is no database. */
function recordsLeft(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === "tarjuman")) return {};
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("tarjuman");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const counts: Record<string, number> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      counts[name] = await new Promise<number>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    db.close();
    return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
  });
}

test("deleting in one tab restarts the other one at onboarding, and its answer in flight is not written back", async ({ context }) => {
  const first = await context.newPage();
  await first.goto("/");
  await onboard(first);

  // The second tab opens on the same data, and starts a slow answer.
  const second = await context.newPage();
  await second.goto("/?mockLatencyMs=400");
  await expect(second.getByRole("textbox", { name: "Message" })).toBeVisible();
  await second.getByRole("textbox", { name: "Message" }).fill("What is the difference between ser and estar?");
  await second.getByRole("button", { name: "Send" }).click();
  await expect(second.getByRole("button", { name: "Stop" })).toBeVisible();

  await first.getByRole("button", { name: "Settings" }).click();
  const data = first.getByRole("region", { name: "Your data" });
  await data.getByRole("button", { name: "Delete all my data" }).click();
  await data.getByRole("button", { name: "Yes, delete everything" }).click();
  await expect(first.getByLabel("Explanation language")).toBeVisible();

  // The second tab restarts on its own, at first-run onboarding.
  await expect(second.getByLabel("Explanation language")).toBeVisible();
  await expect(second.getByRole("textbox", { name: "Message" })).toHaveCount(0);

  // Long enough for the aborted answer's remaining events; nothing of it, or of anything else, is stored.
  await second.waitForTimeout(1500);
  expect(await recordsLeft(first)).toEqual({});

  await second.reload();
  await expect(second.getByLabel("Explanation language")).toBeVisible();
  expect(await recordsLeft(second)).toEqual({});
});
