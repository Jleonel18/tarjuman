import type { SearchPort } from "@tarjuman/core";

/**
 * Lint fixture (005): a file that imports `SearchPort`. Under `tests/` it is allowed; the
 * architecture test checks it as if it lived in a capability, where `pnpm lint:arch` must fail.
 */
export type LeakedSearch = SearchPort;
