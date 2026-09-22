import type { AiTask } from '@local/rich-editor/ai'

export type ThinkingLevelName = 'minimal' | 'low' | 'medium' | 'high'
export type SafetyThreshold = 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE' | 'OFF'

/** Generation settings for one task. Anything left out falls back to `defaults`. */
export interface TaskSettings {
  /** Use a different model for this task. */
  model?: string
  thinkingLevel?: ThinkingLevelName
  maxOutputTokens?: number
  /** Leave unset for Gemini 3 models: Google recommends the default of 1.0. */
  temperature?: number
  topP?: number
  /** Ask Gemini for JSON output (used for whole-document edits). */
  json?: boolean
}

export interface GeminiServerConfig {
  /** `gemini-api`: Google AI Studio API key. `vertex-ai`: Google Cloud project with Application Default Credentials. */
  provider: 'gemini-api' | 'vertex-ai'
  /** Environment variable holding the Gemini API key (provider `gemini-api`). */
  apiKeyEnv: string
  vertex: {
    /** Environment variable holding the Google Cloud project id. */
    projectEnv: string
    location: string
  }
  model: string
  /** Tried once when the main model is overloaded or rate limited (HTTP 429/500/503) before any text was sent. */
  fallbackModel?: string
  defaults: Required<Pick<TaskSettings, 'thinkingLevel' | 'maxOutputTokens'>> & Omit<TaskSettings, 'model'>
  tasks: Partial<Record<AiTask, TaskSettings>>
  /** Applied to all four harm categories. */
  safetyThreshold: SafetyThreshold
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
