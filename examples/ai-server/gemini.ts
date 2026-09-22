import { ApiError, GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel, type GenerateContentConfig } from '@google/genai'
import type { AiPrompt, AiTask } from '@local/rich-editor/ai'
import type { GeminiServerConfig, TaskSettings } from './config-types.ts'

/** An error whose message is safe to show to the user. */
export class UserFacingError extends Error {
  readonly status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export function createGeminiClient(config: GeminiServerConfig): GoogleGenAI {
  if (config.provider === 'vertex-ai') {
    const project = process.env[config.vertex.projectEnv]
    if (!project) throw new Error(`Set ${config.vertex.projectEnv} to your Google Cloud project id (provider "vertex-ai").`)
    return new GoogleGenAI({ vertexai: true, project, location: config.vertex.location })
  }
  const apiKey = process.env[config.apiKeyEnv]
  if (!apiKey) throw new Error(`Set ${config.apiKeyEnv} (in .env or the environment). Get a key at https://aistudio.google.com/apikey`)
  return new GoogleGenAI({ apiKey })
}

export function settingsFor(config: GeminiServerConfig, task: AiTask): TaskSettings & { model: string } {
  return { ...config.defaults, model: config.model, ...config.tasks[task] }
}

function generationConfig(config: GeminiServerConfig, settings: TaskSettings, system: string, signal: AbortSignal): GenerateContentConfig {
  const threshold = HarmBlockThreshold[config.safetyThreshold]
  return {
    systemInstruction: system,
    maxOutputTokens: settings.maxOutputTokens,
    ...(settings.temperature !== undefined ? { temperature: settings.temperature } : {}),
    ...(settings.topP !== undefined ? { topP: settings.topP } : {}),
    ...(settings.thinkingLevel ? { thinkingConfig: { thinkingLevel: ThinkingLevel[settings.thinkingLevel.toUpperCase() as keyof typeof ThinkingLevel] } } : {}),
    ...(settings.json ? { responseMimeType: 'application/json' } : {}),
    safetySettings: [
      HarmCategory.HARM_CATEGORY_HARASSMENT,
      HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    ].map((category) => ({ category, threshold })),
    abortSignal: signal,
  }
}

export interface StreamResult {
  model: string
  outputChars: number
  inputTokens?: number
  outputTokens?: number
}

const RETRYABLE = new Set([429, 500, 503])

/**
 * Stream a completion from Gemini, calling `onText` for each text chunk. Falls back to
 * `fallbackModel` once if the main model is unavailable before any text was produced.
 */
export async function streamCompletion(
  client: GoogleGenAI,
  config: GeminiServerConfig,
  task: AiTask,
  prompt: AiPrompt,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<StreamResult> {
  const settings = settingsFor(config, task)
  const models = [settings.model, ...(config.fallbackModel && config.fallbackModel !== settings.model ? [config.fallbackModel] : [])]

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    let outputChars = 0
    try {
      const stream = await client.models.generateContentStream({
        model,
        // Chat history becomes real conversation turns (Gemini calls the assistant role "model").
        contents: [
          ...(prompt.history ?? []).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: prompt.user }] },
        ],
        config: generationConfig(config, settings, prompt.system, signal),
      })
      let usage: StreamResult = { model, outputChars: 0 }
      let finishReason: string | undefined
      let blockReason: string | undefined
      for await (const chunk of stream) {
        const text = chunk.text
        if (text) {
          outputChars += text.length
          onText(text)
        }
        finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason
        blockReason = chunk.promptFeedback?.blockReason ?? blockReason
        if (chunk.usageMetadata) {
          usage = { model, outputChars, inputTokens: chunk.usageMetadata.promptTokenCount, outputTokens: chunk.usageMetadata.candidatesTokenCount }
        }
      }
      if (!outputChars) {
        if (blockReason || finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
          throw new UserFacingError('The request was blocked by the content safety settings.', 422)
        }
        if (finishReason === 'MAX_TOKENS') throw new UserFacingError('The answer was too long. Try a smaller selection.', 422)
        throw new UserFacingError('Gemini returned no content.', 502)
      }
      return { ...usage, outputChars }
    } catch (error) {
      const retry = error instanceof ApiError && RETRYABLE.has(error.status) && outputChars === 0 && attempt < models.length - 1 && !signal.aborted
      if (retry) continue
      if (error instanceof UserFacingError || signal.aborted) throw error
      if (error instanceof ApiError) {
        if (error.status === 429) throw new UserFacingError('The AI service is busy. Try again in a moment.', 429)
        if (error.status === 400) throw new UserFacingError('The AI service rejected the request.', 400)
        if (error.status === 401 || error.status === 403) throw new UserFacingError('The AI service is not configured correctly.', 502)
      }
      throw error
    }
  }
  throw new UserFacingError('The AI service is unavailable.', 503)
}
