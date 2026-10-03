import { describe, expect, it } from "vitest";
import { applyDocumentLocale, createI18n, hasLocale, registerCatalog, setUiLocale } from "../src/i18n";

describe("createI18n", () => {
  it("translates in English and Spanish", async () => {
    const i18n = await createI18n({ locale: "en" });
    expect(i18n.t("common.save")).toBe("Save");
    await i18n.changeLanguage("es");
    expect(i18n.t("common.save")).toBe("Guardar");
  });

  it("supports ICU arguments and plurals in both languages", async () => {
    const i18n = await createI18n({ locale: "en" });
    expect(i18n.t("common.greeting", { name: "Ana" })).toBe("Hello, Ana");
    expect(i18n.t("common.itemCount", { count: 0 })).toBe("No items");
    expect(i18n.t("common.itemCount", { count: 1 })).toBe("1 item");
    expect(i18n.t("common.itemCount", { count: 5 })).toBe("5 items");
    await i18n.changeLanguage("es");
    expect(i18n.t("common.itemCount", { count: 1 })).toBe("1 elemento");
    expect(i18n.t("common.itemCount", { count: 5 })).toBe("5 elementos");
  });

  it("reports a missing key instead of failing silently", async () => {
    const missing: string[] = [];
    const i18n = await createI18n({ locale: "es", onMissingKey: (locale, key) => missing.push(`${locale}:${key}`) });
    i18n.t("common.does_not_exist");
    expect(missing.some((entry) => entry.endsWith(":common.does_not_exist"))).toBe(true);
  });

  it("falls back to English for a locale without strings", async () => {
    const i18n = await createI18n({ locale: "fr" });
    expect(i18n.t("common.save")).toBe("Save");
  });

  it("keeps instances independent", async () => {
    const a = await createI18n({ locale: "en" });
    const b = await createI18n({ locale: "es" });
    expect(a.t("common.close")).toBe("Close");
    expect(b.t("common.close")).toBe("Cerrar");
  });
});

describe("registerCatalog", () => {
  it("adds capability strings", async () => {
    const i18n = await createI18n({ locale: "en" });
    registerCatalog(i18n, "en", { "capability.demo.title": "Demo" });
    expect(i18n.t("capability.demo.title")).toBe("Demo");
  });

  it("never overwrites an existing core string", async () => {
    const i18n = await createI18n({ locale: "en" });
    registerCatalog(i18n, "en", { "common.save": "Hijacked" });
    expect(i18n.t("common.save")).toBe("Save");
  });

  it("registers a locale that did not exist", async () => {
    const i18n = await createI18n({ locale: "en" });
    expect(hasLocale(i18n, "ar-XB")).toBe(false);
    registerCatalog(i18n, "ar-XB", { "common.save": "x" });
    expect(hasLocale(i18n, "ar-XB")).toBe(true);
  });
});

describe("document locale", () => {
  it("sets lang and dir, and flips dir for right-to-left locales", () => {
    const root = { lang: "", dir: "" };
    expect(applyDocumentLocale("en", root)).toBe("ltr");
    expect(root).toEqual({ lang: "en", dir: "ltr" });
    expect(applyDocumentLocale("ar-XB", root)).toBe("rtl");
    expect(root).toEqual({ lang: "ar-XB", dir: "rtl" });
    applyDocumentLocale("he", root);
    expect(root.dir).toBe("rtl");
  });

  it("setUiLocale switches language and document together", async () => {
    const i18n = await createI18n({ locale: "en" });
    const root = { lang: "en", dir: "ltr" };
    await setUiLocale(i18n, "es", root);
    expect(i18n.t("common.save")).toBe("Guardar");
    expect(root).toEqual({ lang: "es", dir: "ltr" });
  });
});
