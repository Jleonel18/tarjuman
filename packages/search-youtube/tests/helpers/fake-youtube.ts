import categories from "../fixtures/categories-list.json";
import errors from "../fixtures/errors.json";
import searchList from "../fixtures/search-list.json";
import videosList from "../fixtures/videos-list.json";

/**
 * A stand-in for `fetch` that speaks the YouTube Data API's REST format, so the adapter runs end to
 * end with no network. Every body is synthetic (see `tests/fixtures/README.md`).
 */

export type Reply =
  | { kind: "json"; status: number; body: unknown }
  | { kind: "reject"; error: Error };

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** `URL.searchParams` of the call, for readable assertions. */
  params: URLSearchParams;
  /** The same parameters as a plain object, for `toEqual`. */
  query: Record<string, string>;
  path: string;
  /** `init.redirect`, or `undefined` when the call left it to the default (`"follow"`). */
  redirect: RequestRedirect | undefined;
}

export type ErrorCase = keyof typeof errors;

export class FakeYouTube {
  readonly calls: RecordedCall[] = [];
  readonly #queue: Reply[] = [];

  enqueue(...replies: Reply[]): this {
    this.#queue.push(...replies);
    return this;
  }

  readonly fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    const url = new URL(String(input));
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, name) => (query[name] = value));
    this.calls.push({ url: String(input), method: init?.method ?? "GET", headers, params: url.searchParams, query, path: url.pathname, redirect: init?.redirect });
    const reply = this.#queue.shift();
    if (!reply) throw new Error("FakeYouTube: no reply queued for this call");
    if (reply.kind === "reject") throw reply.error;
    const body = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(body, { status: reply.status, headers: { "content-type": "application/json" } });
  };
}

export const ok = (body: unknown): Reply => ({ kind: "json", status: 200, body });
export const searchReply = (): Reply => ok(searchList);
export const videosReply = (): Reply => ok(videosList);
export const categoriesReply = (): Reply => ok(categories);
export function errorReply(name: ErrorCase): Reply {
  const { status, body } = errors[name];
  return { kind: "json", status, body };
}
