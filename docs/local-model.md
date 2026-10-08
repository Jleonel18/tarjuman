# Local model for development (Ollama)

Tarjuman can talk to a free model running on your own machine while you develop. This guide takes
you from nothing to a streamed answer.

## What this is, and what it is not

- **Dev only.** The Ollama adapter (`packages/provider-ollama`) exists so you can build and test
  without an Anthropic key. It is stripped from production builds, which use Anthropic only.
- **Not Claude.** A small local model behaves differently from Claude. Anything recorded or
  measured with it proves pipeline mechanics only. It is never evidence for the guardrail
  success criterion (001 SC-003) or for injection defense. Fixtures and reports carry a
  provenance label that says so.
- **Free and private.** Nothing leaves your machine. The "key" you enter in the app is the
  placeholder `ollama`, which is never sent anywhere.

## 1. Install Ollama

- **macOS / Windows:** download the installer from <https://ollama.com/download> and run it.
- **Linux:** follow the install instructions on the same page.

Check that it works:

```bash
ollama --version
```

## 2. Pull a model

```bash
ollama pull gemma3:4b      # default, about 3.3 GB
```

On a machine with less than about 8 GB of RAM, use the small one and tell the tools about it
(see [Configuration](#configuration)):

```bash
ollama pull gemma3:1b      # about 815 MB
```

`qwen3:4b` also works as an alternative, but it has a thinking mode that changes how answers
stream, so it is not the default.

## 3. Set the context length (required)

Set `OLLAMA_CONTEXT_LENGTH=32768` and restart Ollama.

**Why this is required.** Without it, Ollama picks a context size from your available memory, and
it can be as small as 4 096 tokens. When a prompt is larger than the context, Ollama does **not**
return an error: it silently drops the **start** of the prompt. Tarjuman puts its security layer at
the start of the system message, so an oversized prompt would run **without** the security layer
and nothing would tell you. With 32 768 the prompts Tarjuman builds fit.

- **macOS app:** run `launchctl setenv OLLAMA_CONTEXT_LENGTH 32768`, then quit and reopen Ollama.
- **CLI (any OS):** set the variable before starting the server, for example
  `OLLAMA_CONTEXT_LENGTH=32768 ollama serve`.
- **Windows:** set it as a user environment variable, then restart Ollama.

## 4. Allowed origins

Ollama allows requests from `localhost` origins by default, so `pnpm --filter @tarjuman/web dev`
needs nothing extra. Set `OLLAMA_ORIGINS` only if you serve the app from another host, for example
`OLLAMA_ORIGINS=http://my-dev-box:5173`, and restart Ollama.

## 5. Run the app

```bash
VITE_PROVIDER=ollama pnpm --filter @tarjuman/web dev
```

Complete onboarding. On the key screen enter `ollama`. Ask something like "What is the difference
between ser and estar?". The answer should stream, token counts should appear, and cost should
show as zero.

`VITE_PROVIDER=ollama` only works in the dev server. In a production build the variable is ignored
and the Anthropic provider is used.

## 6. Run the live smoke test

```bash
pnpm test:live:ollama
```

Expected: one short streamed answer and a clean stop. If Ollama is not running, the test skips and
prints the `unreachable` diagnostic below.

## Configuration

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `VITE_PROVIDER` | the app (dev server) | unset | Set to `ollama` to use the local model. |
| `VITE_OLLAMA_BASE_URL` | the app (dev server) | `http://localhost:11434` | Where Ollama listens. |
| `OLLAMA_BASE_URL` | test and recorder tools | `http://localhost:11434` | Same, for the command-line tools. |
| `OLLAMA_MODEL` | test and recorder tools | `gemma3:4b` | Model tag to use, for example `gemma3:1b`. |
| `TARJUMAN_PROVIDER` | test and recorder tools | `ollama` | `anthropic` switches the tools to a real key (`TARJUMAN_TEST_KEY`). |

## Troubleshooting

When something fails, the adapter writes a short diagnostic to the browser console (or to the
tool's stderr) and links here. Each heading below matches the diagnostic's `kind`. Diagnostics
never include message text, headers, or keys.

### unreachable

The request could not reach Ollama. A browser reports "not running", "wrong address", and "origin
not allowed" as the same error, so check in this order:

1. Is it running? `ollama --version`, then start it (`ollama serve` or open the app).
2. Does the server answer from your terminal? `curl http://localhost:11434/api/version`
   - It prints a version: Ollama is up, so the problem is the **origin**. See
     [Allowed origins](#4-allowed-origins).
   - It fails: Ollama is not running, or it listens somewhere else. Check `VITE_OLLAMA_BASE_URL`
     and the port.

### model_not_installed

Ollama is running but does not have the model. The diagnostic names it. Pull it:

```bash
ollama pull gemma3:4b
ollama list          # the tag must appear exactly as the app asks for it
```

### rejected

Ollama refused the request as invalid or too large (HTTP 400, 413, or 422). Check that the model
supports the request and that your context length is set (step 3). If it keeps happening, note
which action triggered it.

### busy

Ollama is overloaded or rate-limiting (HTTP 429 or 503). Wait a moment and try again. Tarjuman
never retries automatically.

### failed

Ollama returned a server error (HTTP 500 or another unexpected status) or broke the stream
midway. Look at Ollama's own logs for the cause, and try `ollama run gemma3:4b` once to confirm
the model loads on your machine.
