import { directionOf } from "@tarjuman/core";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { applyDocumentLocale } from "./i18n";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * The frame around every screen. The reading direction comes from the active locale through the
 * core's locale metadata, and the document's `lang` and `dir` are kept in sync with it, so
 * switching to a right-to-left locale mirrors the whole layout (FR-032).
 */
export function AppShell({ children }: AppShellProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const dir = directionOf(locale);

  useEffect(() => {
    applyDocumentLocale(locale, document.documentElement);
  }, [locale]);

  return (
    <div className="app-shell" dir={dir} lang={locale}>
      <header className="app-shell__header">
        <h1 className="app-shell__title">{t("common.appName")}</h1>
      </header>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
