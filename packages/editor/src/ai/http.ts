import type { AiAdapter } from './types'

export interface HttpAiAdapterOptions {
  /** Endpoint of your backend, e.g. '/api/ai/complete'. */
  url: string
  /** Extra headers, e.g. auth. A function is called per request (for fresh tokens). */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** fetch `credentials` (default 'same-origin', which sends cookies to your own backend). */
  credentials?: RequestCredentials
}

/**
 * Adapter for a backend that speaks the reference protocol (see examples/ai-server):
 * POST the AiRequest as JSON; the response streams NDJSON lines
 * `{"type":"chunk","text":"…"}`, then `{"type":"done"}` or `{"type":"error","message":"…"}`.
 * A plain `text/plain` response body is also accepted.
 */
export function createHttpAiAdapter(options: HttpAiAdapterOptions): AiAdapter {
  return {
    async complete(request, { signal, onChunk }) {
      const extra = typeof options.headers === 'function' ? await options.headers() : options.headers
      const res = await fetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extra },
        body: JSON.stringify(request),
        credentials: options.credentials ?? 'same-origin',
        signal,
      })
      if (!res.ok) {
        let message = `AI request failed (${res.status})`
        try {
          message = (await res.json()).error ?? message
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }

      const isNdjson = (res.headers.get('content-type') ?? '').includes('ndjson')
      if (!res.body) {
        const text = await res.text()
        return isNdjson ? parseLines(text.split('\n'), onChunk) : text
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let output = ''
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        if (!isNdjson) {
          output += text
          onChunk(text)
          continue
        }
        buffer += text
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        output += parseLines(lines, onChunk)
      }
      if (isNdjson && buffer.trim()) output += parseLines([buffer], onChunk)
      return output
    },
  }
}

function parseLines(lines: string[], onChunk: (delta: string) => void): string {
  let out = ''
  for (const line of lines) {
    if (!line.trim()) continue
    const event = JSON.parse(line) as { type: string; text?: string; message?: string }
    if (event.type === 'chunk' && event.text) {
      out += event.text
      onChunk(event.text)
    } else if (event.type === 'error') {
      throw new Error(event.message || 'AI request failed')
    }
  }
  return out
}
