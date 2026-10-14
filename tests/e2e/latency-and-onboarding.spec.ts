import { expect, test, type Page } from "@playwright/test";

/**
 * SC-001 and SC-002, against the production build with the mock provider (`VITE_PROVIDER=mock`).
 * `?mockLatencyMs=` delays every streamed event, standing in for a real network: the first visible
 * words arrive after two events (the verdict line, then the first text). SC-002 excludes the
 * provider's own thinking time, so what this measures is the app's overhead on top of the network.
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
const NETWORK_LATENCY_MS = 250;
const SAMPLES = 15;

async function onboard(page: Page): Promise<void> {
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByLabel("Your level").selectOption("B1");
  await page.getByLabel("Add an interest").fill("cooking");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await page.getByRole("radio", { name: "This session only" }).check();
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

/** Milliseconds from pressing Send to the first words of the new answer, measured in the page. */
async function firstWordsAfterSend(page: Page, question: string): Promise<number> {
  await page.getByRole("textbox", { name: "Message" }).fill(question);
  const ms = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const answers = () => document.querySelectorAll('article[aria-label="Tarjuman"]');
        const before = answers().length;
        const send = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send");
        const start = performance.now();
        const check = () => {
          const list = answers();
          const latest = list[list.length - 1];
          if (list.length > before && (latest?.textContent ?? "").trim() !== "") {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        send?.click();
      }),
  );
  // Let the answer finish before the next question; the composer only sends when idle.
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  return ms;
}

test("SC-002: the first words appear within 2 s of sending in 95% of requests", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/?mockLatencyMs=${NETWORK_LATENCY_MS}`);
  await onboard(page);

  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    samples.push(await firstWordsAfterSend(page, `What is the difference between ser and estar? (${i + 1})`));
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Infinity;
  test.info().annotations.push({ type: "first-words p95 (ms)", description: p95.toFixed(0) });
  expect(p95).toBeLessThan(2000);
});

test("SC-001: onboarding to the first answer takes under 3 minutes", async ({ page }) => {
  const start = Date.now();
  await page.goto(`/?mockLatencyMs=${NETWORK_LATENCY_MS}`);
  await onboard(page);
  await page.getByRole("textbox", { name: "Message" }).fill("What is the difference between ser and estar?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Ser describes identity; estar describes state.")).toBeVisible();
  const elapsed = Date.now() - start;
  test.info().annotations.push({ type: "onboarding to first answer (ms)", description: String(elapsed) });
  expect(elapsed).toBeLessThan(180_000);
});
