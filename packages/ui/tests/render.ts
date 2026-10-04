import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../src/i18n";

/** Renders a component to static HTML in the given UI locale; reports any missing catalog key. */
export async function render(element: ReactElement, locale = "en"): Promise<{ html: string; missing: string[] }> {
  const missing: string[] = [];
  const i18n = await createI18n({ locale, onMissingKey: (_l, key) => missing.push(key) });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, element));
  return { html, missing };
}
