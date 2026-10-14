import { describe, expect, it } from "vitest";
import { CompositeCredentialValidator, ProviderCredentialValidator } from "../../src/pipeline/credential-validation";
import { SearchCredentialValidator } from "../../src/search/search-credential-validation";
import type { ProviderPort } from "../../src/ports/provider";
import { sealSecret } from "../../src/ports/secret-handle";
import { ScriptedProvider } from "../helpers/scripted-provider";
import { ScriptedSearchPort } from "../helpers/scripted-search";

// A search key is validated by the search port with that id; a provider key by the provider (005 T022).
const secret = () => sealSecret("AIzaFAKEvalidationKEY00000000000000000000");

function build() {
  const provider: ProviderPort = new ScriptedProvider([], [], "gemini");
  const search = new ScriptedSearchPort("youtube");
  const validator = new CompositeCredentialValidator([
    new ProviderCredentialValidator([provider]),
    new SearchCredentialValidator([search]),
  ]);
  return { validator, search };
}

describe("credential validation across providers and search sources", () => {
  it("routes a provider id to the provider and a source id to the search port", async () => {
    const { validator, search } = build();
    search.validationResult = { ok: false, code: "permission_denied" };
    expect(await validator.validate("gemini", secret())).toEqual({ ok: true });
    expect(await validator.validate("youtube", secret())).toEqual({ ok: false, code: "permission_denied" });
  });

  it("answers bad_request for an id nobody handles, without calling anything", async () => {
    const { validator } = build();
    expect(await validator.validate("vimeo", secret())).toEqual({ ok: false, code: "bad_request" });
  });
});
