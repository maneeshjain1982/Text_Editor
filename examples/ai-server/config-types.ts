import type { AiTask } from '@local/rich-editor/ai'

export type ProviderName = 'gemini' | 'gauss' | 'openai'
export type ThinkingLevelName = 'minimal' | 'low' | 'medium' | 'high'
export type SafetyThreshold = 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE' | 'OFF'

/** Generation settings for one task. Anything left out falls back to `defaults`. */
export interface TaskSettings {
  /** Use a different model for this task (any provider). */
  model?: string
  /** Gemini: thinking budget. OpenAI-compatible: sent as `reasoning_effort` when the provider allows it. */
  thinkingLevel?: ThinkingLevelName
  maxOutputTokens?: number
  /** Leave unset for Gemini 3 models: Google recommends the default of 1.0. */
  temperature?: number
  topP?: number
  /** Ask the model for JSON output (used for whole-document edits). */
  json?: boolean
}

export interface GeminiProviderConfig {
  /** `gemini-api`: Google AI Studio API key. `vertex-ai`: Google Cloud project with Application Default Credentials. */
  mode: 'gemini-api' | 'vertex-ai'
  /** Environment variable holding the Gemini API key (mode `gemini-api`). */
  apiKeyEnv: string
  vertex: {
    /** Environment variable holding the Google Cloud project id. */
    projectEnv: string
    location: string
  }
  model: string
  /** Tried once when the main model is overloaded or rate limited (HTTP 429/500/503) before any text was sent. */
  fallbackModel?: string
  /** Applied to all four harm categories. */
  safetyThreshold: SafetyThreshold
}

/**
 * Any service that speaks the OpenAI `/chat/completions` API: OpenAI itself, Azure OpenAI,
 * a local gateway, or Gauss behind an OpenAI-compatible endpoint.
 */
export interface OpenAiCompatibleConfig {
  /** Base URL including the version segment, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  /** Environment variable holding the API key. Sent as `Authorization: Bearer …`. */
  apiKeyEnv: string
  model: string
  fallbackModel?: string
  /** Send `reasoning_effort` (reasoning models only; older chat models reject it). */
  sendReasoningEffort?: boolean
  /** Extra headers, e.g. { 'OpenAI-Organization': 'org-…' } or a gateway's tenant header. */
  headers?: Record<string, string>
}

export interface AiServerConfig {
  /** Which provider serves requests. The matching section below is the one that is used. */
  provider: ProviderName
  gemini: GeminiProviderConfig
  /** ChatGPT / OpenAI. */
  openai: OpenAiCompatibleConfig
  /** Samsung Gauss, through its OpenAI-compatible gateway. */
  gauss: OpenAiCompatibleConfig
  defaults: Required<Pick<TaskSettings, 'thinkingLevel' | 'maxOutputTokens'>> & Omit<TaskSettings, 'model'>
  tasks: Partial<Record<AiTask, TaskSettings>>
  /** Appended to every system prompt: house style, terminology, language rules. */
  systemInstructionSuffix: string
  /**
   * `false` (recommended): the server rebuilds prompts from the structured request, so users
   * can't send arbitrary system prompts. `true`: use the prompt the editor sent.
   */
  trustClientPrompt: boolean
  limits: {
    maxRequestBytes: number
    maxInstructionChars: number
    maxBlocks: number
    /** Chat: earlier questions + answers accepted per request. */
    maxChatTurns: number
    timeoutMs: number
  }
  rateLimit: {
    windowMs: number
    maxRequests: number
  }
  server: {
    port: number
    /** Routes are served under this path: POST {basePath}/complete, GET {basePath}/health. */
    basePath: string
    /** Browser origins allowed to call the server directly (CORS). Not needed behind a same-origin proxy. */
    allowedOrigins: string[]
  }
  auth: {
    /** If set, requests must send `Authorization: Bearer <value of this env variable>`. Replace with your dashboard's session check for production. */
    bearerTokenEnv?: string
  }
  logging: {
    requests: boolean
    /** Log prompts and outputs. Keep off in production: documents may contain personal data. */
    content: boolean
  }
}
