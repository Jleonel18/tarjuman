export * from "./i18n";
export { AppShell } from "./AppShell";
// Re-exported so the app depends on one UI package for translation hooks.
export { I18nextProvider, useTranslation } from "react-i18next";
export type { i18n as I18n } from "i18next";
export { describeProviderError } from "./errors/provider-error-messages";
export type { ProviderErrorAction, ProviderErrorDescription } from "./errors/provider-error-messages";
