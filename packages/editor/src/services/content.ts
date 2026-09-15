import type { JSONContent } from '@tiptap/core'
import type { EditorContent } from '../types'

/**
 * Make incoming content a valid document.
 *
 * `{ type: 'doc', content: [] }` (a common "empty" value from APIs) is not a valid
 * ProseMirror document — `doc` needs at least one block. TipTap accepts it anyway,
 * leaving no text position: the selection becomes an AllSelection, so formatting
 * toggled before typing (e.g. Bold on a new document) has nowhere to apply.
 */
export function normalizeContent(value: EditorContent | null | undefined): EditorContent {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value.type === 'doc' && !value.content?.length) {
    return { ...value, content: [{ type: 'paragraph' }] } satisfies JSONContent
  }
  return value
}
