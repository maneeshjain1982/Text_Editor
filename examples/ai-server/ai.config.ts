/**
 * LLM configuration for the Rich Editor AI Canvas.
 *
 * This is the one file to edit to choose the provider, models, limits and behaviour.
 * Secrets are never stored here: API keys are read from the environment (`.env`, see `.env.example`).
 *
 * Switch provider by changing `provider` below:
 *   'gemini'  Google Gemini (AI Studio key or Vertex AI)          key: GEMINI_API_KEY
 *   'openai'  ChatGPT / OpenAI, or anything OpenAI-compatible     key: OPENAI_API_KEY
 *   'gauss'   Samsung Gauss through its OpenAI-compatible gateway key: GAUSS_API_KEY
 *
 * Gemini models (September 2026):
 *   gemini-3.8-flash       recommended default: fast, strong writing quality
 *   gemini-3.5-flash-lite  cheapest, lowest latency; good fallback for simple edits
 *   gemini-3.1-pro-preview highest quality, slower (preview)
 * Check https://ai.google.dev/gemini-api/docs/models before changing.
 */
import type { AiServerConfig } from './config-types.ts'

const config: AiServerConfig = {
  provider: 'gemini',

  gemini: {
    // 'gemini-api' uses an API key from Google AI Studio.
    // 'vertex-ai' uses a Google Cloud project (run `gcloud auth application-default login` or use a service account).
    mode: 'gemini-api',
    apiKeyEnv: 'GEMINI_API_KEY',
    vertex: {
      projectEnv: 'GOOGLE_CLOUD_PROJECT',
      location: 'global',
    },
    model: 'gemini-3.8-flash',
    fallbackModel: 'gemini-3.5-flash-lite',
    safetyThreshold: 'BLOCK_MEDIUM_AND_ABOVE',
  },

  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'gpt-5.1',
    fallbackModel: 'gpt-5.1-mini',
    // Reasoning models accept `reasoning_effort`; older chat models reject it.
    sendReasoningEffort: true,
    headers: {},
  },

  gauss: {
    // Point this at your Gauss gateway. The server speaks the OpenAI /chat/completions
    // API; if your gateway differs, adapt providers/openai.ts (one request builder and
    // one SSE reader) rather than the rest of the server.
    baseUrl: process.env.GAUSS_BASE_URL ?? 'https://gauss.internal/v1',
    apiKeyEnv: 'GAUSS_API_KEY',
    model: process.env.GAUSS_MODEL ?? 'gauss2-flash',
    sendReasoningEffort: false,
    headers: {},
  },

  // Settings for every task unless overridden below.
  // Temperature is deliberately not set: Google recommends the default (1.0) for Gemini 3 models.
  // thinkingLevel: gemini-3.8-flash supports low | medium | high; 3.5-flash-lite also supports minimal.
  defaults: {
    thinkingLevel: 'low',
    maxOutputTokens: 8192,
  },

  tasks: {
    // Rewrite a selection: quick, instruction-following.
    'edit-selection': { thinkingLevel: 'low', maxOutputTokens: 4096 },
    // Continue writing at the cursor: short output.
    continue: { thinkingLevel: 'low', maxOutputTokens: 1024 },
    // Write new content from a prompt: more planning helps structure.
    generate: { thinkingLevel: 'medium', maxOutputTokens: 8192 },
    // Whole-document edits return a JSON list of changed blocks only.
    'edit-document': { thinkingLevel: 'medium', maxOutputTokens: 16384, json: true },
    // Chat with the document: answers cite blocks; may include an edits block when asked for changes.
    chat: { thinkingLevel: 'medium', maxOutputTokens: 4096 },
  },

  // House style added to every system prompt, e.g.
  // 'Use British English. Refer to the company as "Samsung". Never invent figures.'
  systemInstructionSuffix: '',

  // Keep false in production (see config-types.ts).
  trustClientPrompt: false,

  limits: {
    // Chat sends the whole document (up to ~150,000 characters) plus the conversation.
    maxRequestBytes: 1_000_000,
    maxInstructionChars: 2_000,
    maxBlocks: 3_000,
    maxChatTurns: 20,
    timeoutMs: 90_000,
  },

  // Per client IP. Use your API gateway's limits in production.
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 30,
  },

  server: {
    port: 8787,
    basePath: '/api/ai',
    allowedOrigins: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'],
  },

  auth: {
    // e.g. 'AI_SERVER_TOKEN' to require a shared bearer token. Replace with real user auth in production.
    bearerTokenEnv: undefined,
  },

  logging: {
    requests: true,
    content: false,
  },
}

export default config
