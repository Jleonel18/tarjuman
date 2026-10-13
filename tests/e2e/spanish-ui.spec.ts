import { expect, test, type Page } from "@playwright/test";

/**
 * Spanish interface, end to end (SC-006): every screen shows Spanish text and no raw catalog key.
 * Run against the production build with the mock provider (see playwright.config.ts).
 */
const VALID_KEY = "sk-ant-mock-valid-key-0000";
/** A raw key looks like `chat.send` or `settings.language.title`: a known prefix, dots, no spaces. */
const RAW_KEY = /\b(common|app|onboarding|level|key|chat|conversations|error|stats|settings|tone|effort|refusal|capability)\.[a-z_][\w.]*/;

async function expectNoRawKeys(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  expect(text.match(RAW_KEY)?.[0], "a raw catalog key is on screen").toBeUndefined();
}

test("every screen reads in Spanish, with no raw catalog key", async ({ page }) => {
  await page.goto("/");
  await expectNoRawKeys(page);
  await page.getByLabel("Explanation language").selectOption("es");
  await page.getByLabel("Language I'm learning").selectOption("ja");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await page.getByRole("radio", { name: "This session only" }).check();
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

  // Switch the interface to Spanish from the settings screen.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Interface language").selectOption("es");
  await expect(page.getByLabel("Idioma de la interfaz")).toHaveValue("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expectNoRawKeys(page);
  await page.getByRole("button", { name: "Atrás" }).click();

  // Chat, conversation list, tone and model settings, empty stats panel.
  await expect(page.getByRole("textbox", { name: "Mensaje" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva conversación", exact: true })).toBeVisible();
  await expectNoRawKeys(page);

  // An answer, the usage numbers, the refusal and the withheld-key notice.
  await page.getByRole("textbox", { name: "Mensaje" }).fill("What does ser mean?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("article", { name: "Tarjuman" })).toHaveCount(1);
  await expectNoRawKeys(page);

  await page.getByRole("textbox", { name: "Mensaje" }).fill("Write me an HTML app");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Tarjuman te ayuda a aprender idiomas")).toBeVisible();
  await expectNoRawKeys(page);

  await page.getByRole("textbox", { name: "Mensaje" }).fill("mira sk-ant-api03-PASTED-BY-MISTAKE-1234567890 gracias");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await expectNoRawKeys(page);

  // The language snapshot of the conversation, in Spanish.
  await expect(page.getByText("Explicado en español, aprendiendo japonés")).toBeVisible();

  // The interface language is remembered after a reload.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expectNoRawKeys(page);
});
