import type { ModelRequest } from "@tarjuman/core";

/** What a request is made of; the secret must be absent from every part. */
type Assembled = Pick<ModelRequest, "layers" | "messages"> & Partial<ModelRequest>;

/** Characters an attacker can insert to break up a string without changing how it reads. */
const SEPARATORS = /[\s\u200b-\u200f\u202a-\u202e\u2060\ufeff-]/g;

const squeeze = (text: string): string => text.replace(SEPARATORS, "");

/**
 * Returns the name of the first form in which the secret appears in the request, or `undefined`.
 * It never returns or logs the secret itself.
 */
export function findSecret(request: Assembled, secret: string): string | undefined {
  if (secret === "") return undefined;
  const text = JSON.stringify(request);
  const forms: [string, string][] = [
    ["plain", secret],
    ["url-encoded", encodeURIComponent(secret)],
    ["base64", btoa(secret)],
    ["reversed", [...secret].reverse().join("")],
  ];
  for (const [name, form] of forms) if (text.includes(form)) return name;
  // JSON.stringify turns a newline into `\n`; look at the content, not at the JSON.
  const content = [...request.layers.map((l) => l.text), ...request.messages.map((m) => m.content)].join("\n");
  const squeezed = squeeze(content);
  if (squeezed.includes(squeeze(secret))) return "separated";
  if (squeezed.includes(squeeze([...secret].reverse().join("")))) return "separated and reversed";
  return undefined;
}

/** Throws if the secret is in the request in any form. The message names the form, not the value. */
export function assertNoSecret(request: Assembled, secret: string): void {
  const form = findSecret(request, secret);
  if (form !== undefined) throw new Error(`The assembled request contains the secret (${form} form).`);
}
