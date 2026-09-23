import type { AiPrompt, AiTask } from '@local/rich-editor/ai'
import type { AiServerConfig, OpenAiCompatibleConfig } from '../config-types.ts'
import { settingsFor, UserFacingError, type AiProvider, type StreamResult } from './types.ts'

/**
 * Any service speaking the OpenAI `/chat/completions` API: ChatGPT (OpenAI), Azure OpenAI,
 * a local gateway, or Samsung Gauss behind an OpenAI-compatible endpoint.
 *
 * Only two places are API-specific: `body()` below and the SSE reader in `stream()`. If your
 * gateway differs, change those; the rest of the server stays the same.
 */
export function createOpenAiProvider(config: AiServerConfig, provider: OpenAiCompatibleConfig, name: string): AiProvider {
  const apiKey = process.env[provider.apiKeyEnv]
  if (!apiKey) throw new Error(`Set ${provider.apiKeyEnv} (in .env or the environment) to use the "${name}" provider.`)

  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`

  return {
    name,
    modelFor: (task) => settingsFor(config, task, provider.model).model,

    async stream(task: AiTask, prompt: AiPrompt, signal: AbortSignal, onText: (text: string) => void): Promise<StreamResult> {
      const settings = settingsFor(config, task, provider.model)
      const fallback = provider.fallbackModel
      const models = [settings.model, ...(fallback && fallback !== settings.model ? [fallback] : [])]

      for (let attempt = 0; attempt < models.length; attempt++) {
        const model = models[attempt]
        let outputChars = 0
        let usage: StreamResult = { model, outputChars: 0 }

        const body = {
          model,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: 'system', content: prompt.system },
            ...(prompt.history ?? []).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: prompt.user },
          ],
          max_completion_tokens: settings.maxOutputTokens,
          ...(settings.temperature !== undefined ? { temperature: settings.temperature } : {}),
          ...(settings.topP !== undefined ? { top_p: settings.topP } : {}),
          ...(provider.sendReasoningEffort && settings.thinkingLevel ? { reasoning_effort: settings.thinkingLevel } : {}),
          ...(settings.json ? { response_format: { type: 'json_object' } } : {}),
        }

        let response: Response
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...provider.headers },
            body: JSON.stringify(body),
            signal,
          })
        } catch (error) {
          if (signal.aborted) throw error
          throw new UserFacingError('The AI service could not be reached.', 502)
        }

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500
          if (retryable && attempt < models.length - 1 && !signal.aborted) continue
          throw statusError(response.status, await response.text().catch(() => ''))
        }
        if (!response.body) throw new UserFacingError('The AI service returned an empty response.', 502)

        for await (const data of sseData(response.body, signal)) {
          if (data === '[DONE]') break
          let event: ChatChunk
          try {
            event = JSON.parse(data) as ChatChunk
          } catch {
            continue // keep-alive or a partial line the gateway flushed
          }
          const text = event.choices?.[0]?.delta?.content
          if (text) {
            outputChars += text.length
            onText(text)
          }
          const finish = event.choices?.[0]?.finish_reason
          if (finish === 'content_filter') throw new UserFacingError('The request was blocked by the content safety settings.', 422)
          if (finish === 'length' && !outputChars) throw new UserFacingError('The answer was too long. Try a smaller selection.', 422)
          if (event.usage) {
            usage = { model, outputChars, inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens }
          }
        }

        if (!outputChars) throw new UserFacingError('The AI service returned no content.', 502)
        return { ...usage, outputChars }
      }
      throw new UserFacingError('The AI service is unavailable.', 503)
    },
  }
}

interface ChatChunk {
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

function statusError(status: number, body: string): UserFacingError {
  if (status === 429) return new UserFacingError('The AI service is busy. Try again in a moment.', 429)
  if (status === 401 || status === 403) return new UserFacingError('The AI service is not configured correctly.', 502)
  if (status === 400) return new UserFacingError('The AI service rejected the request.', 400)
  console.error('[ai] provider error', status, body.slice(0, 500))
  return new UserFacingError('The AI request failed.', 502)
}

/** Yields the `data:` payload of each server-sent event. */
async function* sseData(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index: number
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}
