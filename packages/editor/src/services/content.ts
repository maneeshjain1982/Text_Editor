import type { Editor, JSONContent } from '@tiptap/core'
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

/**
 * StarterKit's TrailingNode adds an empty paragraph after a document that ends in a
 * table, image, list etc. — but lazily, on the first transaction. A freshly loaded
 * document would then change as soon as the user clicks it, which hosts see as
 * "unsaved changes". Apply it right after content is loaded instead (outside undo history).
 */
export function ensureTrailingParagraph(editor: Editor) {
  const { doc, schema, tr } = editor.state
  const last = doc.lastChild
  const paragraph = schema.nodes.paragraph
  if (!last || !paragraph || last.type === paragraph) return
  editor.view.dispatch(tr.insert(doc.content.size, paragraph.create()).setMeta('addToHistory', false))
}
