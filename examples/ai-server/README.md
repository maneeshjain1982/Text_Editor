# AI server for the AI Canvas

A small Node server that connects the editor's AI Canvas to an LLM. The browser never sees the API key: the editor sends requests to this server, and the server calls the provider and streams the answer back.

One setting chooses the provider:

| `provider` in `ai.config.ts` | Service | Key |
|---|---|---|
| `'gemini'` (default) | Google Gemini, via AI Studio or Vertex AI | `GEMINI_API_KEY` |
| `'openai'` | ChatGPT / OpenAI, or any OpenAI-compatible gateway | `OPENAI_API_KEY` |
| `'gauss'` | Samsung Gauss, through its OpenAI-compatible gateway | `GAUSS_API_KEY` |

```
Browser (RichEditor + createHttpAiAdapter)
   │  POST /api/ai/complete   (same origin, via your proxy)
   ▼
examples/ai-server  ──  ai.config.ts  +  <PROVIDER>_API_KEY (env)
   │  streaming request
   ▼
Gemini API / Vertex AI  ·  OpenAI  ·  Gauss
```

It's a reference implementation: use it as is, or port its logic to your own backend (Java, .NET, Python…). The request and response formats are described below.

---

## 1. Setup

Requirements: **Node 22.18 or later** (the server runs TypeScript directly, with no build step).

```bash
# From the repository root: build and pack the editor (the server uses its '/ai' entry)
npm install && npm run build && npm run pack

cd examples/ai-server
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

Open `.env` and set the key for the provider you chose. For the default (Gemini), get one at https://aistudio.google.com/apikey.

```
GEMINI_API_KEY=your-key-here
# or, with provider: 'openai'
OPENAI_API_KEY=your-key-here
# or, with provider: 'gauss'
GAUSS_API_KEY=your-key-here
GAUSS_BASE_URL=https://gauss.your-company.internal/v1
```

`.env` is git-ignored. Never put the key in `ai.config.ts` or in front-end code.

## 2. Run

| Command | What it does |
|---|---|
| `npm start` | Starts the server with the configured provider on http://localhost:8787/api/ai |
| `npm run dev` | Same, restarting automatically when files change |
| `npm run mock` | Starts the server **without calling any provider**: deterministic demo output, no key needed. Used by the automated tests. |

Check it's running:

```bash
curl http://localhost:8787/api/ai/health
# {"ok":true,"mock":false,"provider":"gemini","model":"gemini-3.8-flash"}
```

Then start the sample app (`cd ../sample-app && npm run dev`). Its Vite config forwards `/api/ai` to this server.

## 3. Configure: `ai.config.ts`

All settings are in **one file**, [`ai.config.ts`](ai.config.ts). Restart the server after editing it.

| Setting | Default | Notes |
|---|---|---|
| `provider` | `'gemini'` | `'gemini'`, `'openai'` (ChatGPT) or `'gauss'`. Only the matching section below is used. |
| `gemini.mode` | `'gemini-api'` | `'vertex-ai'` for Google Cloud: set `GOOGLE_CLOUD_PROJECT` and sign in with `gcloud auth application-default login` or a service account |
| `gemini.model` | `'gemini-3.8-flash'` | Recommended default. `gemini-3.5-flash-lite` is cheaper and faster; `gemini-3.1-pro-preview` has the highest quality (preview). |
| `gemini.fallbackModel` | `'gemini-3.5-flash-lite'` | Tried once if the main model is busy (HTTP 429/500/503) before any text was sent |
| `gemini.safetyThreshold` | `'BLOCK_MEDIUM_AND_ABOVE'` | Applied to harassment, hate speech, sexually explicit and dangerous content |
| `openai` / `gauss` | `baseUrl`, `apiKeyEnv`, `model`, `fallbackModel`, `sendReasoningEffort`, `headers` | Any service speaking the OpenAI `/chat/completions` API. `sendReasoningEffort` sends `thinkingLevel` as `reasoning_effort` (reasoning models only). |
| `defaults` | `thinkingLevel: 'low'`, `maxOutputTokens: 8192` | Applied to every task |
| `tasks` | per task | `edit-selection` and `continue`: low thinking. `generate`, `edit-document` and `chat`: medium thinking. `edit-document` asks for JSON output. |
| `systemInstructionSuffix` | `''` | House style added to every prompt, e.g. `'Use British English. Never invent figures.'` |
| `trustClientPrompt` | `false` | Keep `false`: the server builds the prompts itself, so users can't turn the endpoint into a general-purpose model proxy |
| `limits` | 1 MB body, 2,000-character instruction, 3,000 blocks, 20 chat turns, 90 s timeout | Chat sends the whole document (up to about 150,000 characters) with each question |
| `rateLimit` | 30 requests per minute per IP | Use your API gateway's limits in production |
| `server` | port 8787, `/api/ai`, localhost origins for CORS | |
| `auth.bearerTokenEnv` | off | Name of an env variable holding a shared token that requests must send |
| `logging` | request stats on, content off | Keep `content: false` in production: documents may contain personal data |

**Temperature** is deliberately not set. Google recommends keeping the default (1.0) for Gemini 3 models; lower values can cause loops and weaker answers.

**Thinking levels.** `gemini-3.8-flash` supports `low`, `medium` and `high`. `gemini-3.5-flash-lite` also supports `minimal`. Higher levels give better results but slower first output. For OpenAI-compatible providers the same value is sent as `reasoning_effort` when `sendReasoningEffort` is on.

**Gauss.** The `gauss` section assumes an OpenAI-compatible gateway; set `GAUSS_BASE_URL` and `GAUSS_MODEL` for your deployment. If your Gauss endpoint uses a different request or streaming format, adapt `providers/openai.ts` - one request builder and one SSE reader - and nothing else changes.

## 4. API

### `POST {basePath}/complete`

The request body is the editor's `AiRequest`:

```json
{
  "task": "edit-selection",
  "instruction": "Make this more formal",
  "responseFormat": "markdown",
  "selection": "We can't ship this week.",
  "context": { "before": "…", "after": "…", "title": "Release plan" },
  "prompt": { "system": "…", "user": "…" }
}
```

| `task` | Sent by | The model returns |
|---|---|---|
| `edit-selection` | Ask AI and quick actions on selected text | Markdown replacing the selection |
| `continue` | Continue writing (`api.aiContinue()`) | Markdown to insert at the cursor |
| `generate` | Generate content | Markdown for new content |
| `edit-document` | Edit whole document (`api.aiEditDocument()`, `blocks: [{ id, markdown }]`) | JSON `{"edits":[{"id":"b3","markdown":"…"},{"id":"b5","delete":true},{"after":"b7","markdown":"…"}]}`, listing **only changed blocks** |
| `chat` | Chat with the document (`blocks`, `messages: [{ role, content }]`, optional `selection`) | A Markdown answer citing blocks as `[b3]`. When the user asked for a change, it ends with a fenced `edits` block containing the same JSON as `edit-document`. The server sends `messages` to the provider as conversation turns. |

The response is `application/x-ndjson`, one JSON object per line:

```
{"type":"chunk","text":"We cannot "}
{"type":"chunk","text":"ship this week."}
{"type":"done"}
```

If something goes wrong after streaming has started, the last line is `{"type":"error","message":"…"}` instead of `done`. Errors before streaming starts use a normal HTTP status with a JSON body: 400 (invalid request), 401 (auth), 413 (too large), 429 (rate limit).

When the browser disconnects (the user pressed **Stop**), the server cancels the provider request.

`createHttpAiAdapter` in the editor package already speaks this protocol:

```ts
import { createHttpAiAdapter } from '@local/rich-editor'
const ai = createHttpAiAdapter({ url: '/api/ai/complete' })
```

### `GET {basePath}/health`

Returns `{"ok":true,"mock":false,"provider":"gemini","model":"gemini-3.8-flash"}`.

## 5. Production checklist

- [ ] **Authentication.** Replace `authorize()` in `server.ts` with your dashboard's session or token check. Every request costs provider tokens.
- [ ] **Same-origin routing.** Serve the endpoint under your dashboard's domain (reverse proxy or API gateway), so no CORS is needed and cookies work.
- [ ] **Rate limits and quotas** per user, in your gateway. The in-memory limiter is per process and per IP.
- [ ] **Key storage.** Put the provider key in your secret manager, or use Vertex AI with a service account.
- [ ] **Logging.** Keep `logging.content = false` unless your data policy allows storing document text.
- [ ] **Data policy.** Check that sending document content to the provider is allowed for your data. Vertex AI and a self-hosted Gauss gateway give enterprise data-governance controls.
- [ ] **Model check.** Confirm the model names are still current: https://ai.google.dev/gemini-api/docs/models (Gemini) or your provider's model list.

## 6. Files

| File | Purpose |
|---|---|
| `ai.config.ts` | **The configuration file**: provider, models, limits, server |
| `config-types.ts` | Types and documentation for every setting |
| `providers/index.ts` | Chooses the provider named in the config |
| `providers/gemini.ts` | Gemini client, generation settings, streaming, fallback model, error mapping |
| `providers/openai.ts` | OpenAI-compatible provider (ChatGPT, Gauss, gateways): request body, SSE streaming, error mapping |
| `providers/types.ts` | The `AiProvider` interface, task settings, `UserFacingError` |
| `server.ts` | HTTP server: validation, auth hook, rate limit, CORS, NDJSON streaming, mock mode |
| `.env.example` | Environment variables to copy into `.env` |
