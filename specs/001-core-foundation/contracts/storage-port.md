# Contract: StoragePort and CredentialStore

Persistence boundary (FR-005, FR-013, FR-017). Web adapter: IndexedDB + WebCrypto. Future desktop
adapter (SQLite + OS keychain) implements the same interfaces unchanged (FR-041).

```ts
interface StoragePort {
  get<T>(collection: Collection, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(collection: Collection, value: T): Promise<void>;
  delete(collection: Collection, id: string): Promise<void>;
  query<T>(collection: Collection, q?: { index: string; equals: string }): Promise<T[]>;
  clearAll(): Promise<void>;                   // must leave zero Tarjuman data (SC-007)
  isAvailable(): Promise<boolean>;             // false in private mode / blocked storage
}

type Collection = "profile" | "settings" | "conversations" | "messages" | "usage";

interface CredentialStore {
  save(secret: string, mode: "persistent" | "session", meta: { providerId: string; maskedHint: string }): Promise<void>;
  load(): Promise<SecretHandle | undefined>;
  describe(): Promise<{ providerId: string; storageMode: string; maskedHint: string; validatedAt: string } | undefined>;
  remove(): Promise<void>;                     // irrecoverable (US7-1)
}
```

## Invariants

1. `CredentialStore.save` is called only after successful validation.
2. In `persistent` mode the secret is AES-GCM encrypted with a non-extractable `CryptoKey`; in
   `session` mode it exists only in process memory and is gone on reload (US7-2).
3. `describe()` never returns the secret; `maskedHint` is the only displayable form.
4. `clearAll()` removes database, CryptoKey, in-memory secrets, Cache Storage entries, and then
   verifies emptiness; failure to verify throws and the UI reports it rather than claiming success.
5. `isAvailable() === false` makes the shell offer session-only mode and explain non-persistence.
6. Secrets are excluded from any export routine; no export is implemented in this feature.

## Test obligations

- Round-trip, encryption-at-rest (raw DB contents contain no plaintext key), non-extractability
  (`exportKey` rejects), `clearAll` emptiness, unavailable-storage behavior.
