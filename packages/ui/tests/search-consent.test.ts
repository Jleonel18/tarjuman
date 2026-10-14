import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SearchConsentDialog } from "../src/chat/SearchConsentDialog";
import { render } from "./render";

// The consent dialog (005 FR-019): what is sent, where it goes, the source's terms and privacy
// policy as inert links, and a plain choice. YouTube's terms require telling the learner.

const noop = () => {};
const show = (locale = "en") => render(createElement(SearchConsentDialog, { sourceId: "youtube", onAgree: noop, onCancel: noop }), locale);

describe.each(["en", "es"])("SearchConsentDialog in %s", (locale) => {
  it("has every string", async () => {
    expect((await show(locale)).missing).toEqual([]);
  });

  it("is a labelled modal dialog with Agree and Cancel", async () => {
    const { html } = await show(locale);
    expect(html).toContain("<dialog");
    expect(html).toContain("aria-labelledby");
    expect(html).toContain("aria-modal");
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain(locale === "en" ? "Agree and search" : "Aceptar y buscar");
    expect(html).toContain(locale === "en" ? ">Cancel<" : ">Cancelar<");
  });

  it("says what is sent and what never is", async () => {
    const { html } = await show(locale);
    expect(html).toContain(locale === "en" ? "What is sent" : "Qué se envía");
    expect(html).toContain(locale === "en" ? "Never sent" : "Nunca se envía");
  });
});

describe("SearchConsentDialog links", () => {
  it("offers the YouTube terms and the Google privacy policy as hardened links with the address visible", async () => {
    const { html } = await show();
    for (const url of ["https://www.youtube.com/t/terms", "https://policies.google.com/privacy"]) {
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain(`>${url}</code>`);
    }
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/referrerPolicy="no-referrer"/g)).toHaveLength(2);
  });

  it("loads nothing by itself", async () => {
    const { html } = await show();
    expect(html).not.toMatch(/<(img|iframe|script|link|video|audio|embed|object)\b/i);
  });

  it("states that the request goes straight from the browser, with no Tarjuman server", async () => {
    expect((await show()).html).toContain("no server");
  });
});
