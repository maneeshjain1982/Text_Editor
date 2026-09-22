import { parseBlockPatch } from './parse'
import type { AiBlockPatch } from './types'

export interface ParsedChatAnswer {
  /** The answer without the edits block. Citations like [b3] are left in place. */
  markdown: string
  /** Block ids cited in the answer, in order of first appearance. */
  citations: string[]
  /** Edits requested by the user, if the answer included an edits block. */
  patch: AiBlockPatch | null
}

const EDITS_BLOCK = /```edits\s*\n([\s\S]*?)(?:\n```|$)/
export const CITATION = /\[(b\d+)\]/g

/**
 * Split a chat answer into its visible text, citations and optional edits.
 * Works on partial (streaming) text too: an unfinished edits block is hidden.
 */
export function parseChatAnswer(text: string): ParsedChatAnswer {
  const match = text.match(EDITS_BLOCK)
  const markdown = (match ? text.slice(0, match.index) : text.replace(/```edits[\s\S]*$/, '')).trim()
  const patch = match ? parseBlockPatch(match[1]) : null
  const citations: string[] = []
  for (const m of markdown.matchAll(CITATION)) if (!citations.includes(m[1])) citations.push(m[1])
  return { markdown, citations, patch: patch && patch.edits.length ? patch : null }
}

/** Remove citation markers, e.g. before copying or inserting an answer into the document. */
export const stripCitations = (markdown: string) => markdown.replace(/\s*\[b\d+\]/g, '')
