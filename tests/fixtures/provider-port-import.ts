import type { ProviderPort } from "@tarjuman/core";

/**
 * Lint fixture (US8-3): a file that imports `ProviderPort`. Under `tests/` it is allowed; the
 * architecture test checks it as if it lived in a capability, where `pnpm lint:arch` must fail.
 */
export type LeakedProvider = ProviderPort;
