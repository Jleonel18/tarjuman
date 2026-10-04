import type { ProviderErrorCode } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { createI18n } from "../src/i18n";
import { describeProviderError } from "../src/errors/provider-error-messages";

const CODES: ProviderErrorCode[] = [
  "invalid_credential",
  "permission_denied",
  "quota_exhausted",
  "rate_limited",
  "overloaded",
  "network",
  "bad_request",
  "unknown",
];

describe("describeProviderError", () => {
  it("directs credential and quota problems to key settings", () => {
    for (const code of ["invalid_credential", "permission_denied", "quota_exhausted"] as const) {
      expect(describeProviderError(code).action).toBe("open_key_settings");
    }
  });

  it("offers no automatic action for the other errors (no automatic retry)", () => {
    for (const code of ["rate_limited", "overloaded", "network", "bad_request", "unknown"] as const) {
      expect(describeProviderError(code).action).toBe("none");
    }
  });

  it("shows the wait only when the provider reported one", () => {
    expect(describeProviderError("rate_limited", 30)).toMatchObject({
      messageKey: "error.provider.rate_limited_wait",
      params: { seconds: 30 },
    });
    expect(describeProviderError("rate_limited").messageKey).toBe("error.provider.rate_limited");
    expect(describeProviderError("network", 30).params).toEqual({});
  });

  it.each(["en", "es"])("has a plain-language message in %s for every code", async (locale) => {
    const missing: string[] = [];
    const i18n = await createI18n({ locale, onMissingKey: (_l, key) => missing.push(key) });
    for (const code of CODES) {
      const { messageKey, params } = describeProviderError(code, 5);
      const text = i18n.t(messageKey, params);
      expect(text, `${locale} ${code}`).not.toBe(messageKey);
      expect(text).not.toMatch(/\{|\}/);
    }
    expect(missing).toEqual([]);
  });

  it("renders the wait with a plural in both languages", async () => {
    const en = await createI18n({ locale: "en" });
    expect(en.t("error.provider.rate_limited_wait", { seconds: 1 })).toContain("1 second");
    expect(en.t("error.provider.rate_limited_wait", { seconds: 30 })).toContain("30 seconds");
    const es = await createI18n({ locale: "es" });
    expect(es.t("error.provider.rate_limited_wait", { seconds: 30 })).toContain("30 segundos");
  });
});
