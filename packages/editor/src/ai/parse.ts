import type { AiBlockPatch } from './types'

/** Remove a code fence the model wrapped around the whole answer (```markdown … ```). */
export function stripOuterFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```[\w-]*\s*\n([\s\S]*?)\n?```$/)
  return match ? match[1].trim() : trimmed
}

/** Parse a block-patch answer. Returns null when the text isn't a usable patch. */
export function parseBlockPatch(text: string): AiBlockPatch | null {
  const body = stripOuterFence(text)
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let json: unknown
  try {
    json = JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
  const edits = (json as { edits?: unknown })?.edits
  if (!Array.isArray(edits)) return null
  const valid = edits.filter((e): e is AiBlockPatch['edits'][number] => {
    if (!e || typeof e !== 'object') return false
    const o = e as Record<string, unknown>
    if (typeof o.id === 'string' && o.delete === true) return true
    if (typeof o.id === 'string' && typeof o.markdown === 'string') return true
    return typeof o.after === 'string' && typeof o.markdown === 'string'
  })
  return { edits: valid }
}
