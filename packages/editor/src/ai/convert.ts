import type { Editor } from '@tiptap/core'
import { DOMParser as PMDOMParser, DOMSerializer, Fragment, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { markdownPageBreaksToHtml, toMarkdown } from '../services/exporters'

/** Markdown of a document range (formatting that Markdown can't express is dropped). */
export function rangeToMarkdown(editor: Editor, from: number, to: number): string {
  if (to <= from) return ''
  return fragmentToMarkdown(editor.schema, editor.state.doc.slice(from, to).content)
}

export function fragmentToMarkdown(schema: Schema, fragment: Fragment): string {
  const div = document.createElement('div')
  div.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(fragment))
  return toMarkdown(div.innerHTML).trim()
}

export const nodeToMarkdown = (schema: Schema, node: PMNode) => fragmentToMarkdown(schema, Fragment.from(node))

/** Plain text before/after a position, for context. */
export function textAround(editor: Editor, from: number, to: number, chars: number) {
  const { doc } = editor.state
  const before = doc.textBetween(Math.max(0, from - chars * 2), from, '\n\n', ' ')
  const after = doc.textBetween(to, Math.min(doc.content.size, to + chars * 2), '\n\n', ' ')
  return { before: before.slice(-chars), after: after.slice(0, chars) }
}

/**
 * Markdown → document fragment, parsed through the editor schema (anything the schema
 * doesn't know, including scripts and unknown attributes, is dropped).
 */
export async function markdownToFragment(schema: Schema, markdown: string): Promise<Fragment> {
  const { marked } = await import('marked')
  const html = await marked.parse(markdownPageBreaksToHtml(markdown), { gfm: true, breaks: false })
  const container = document.createElement('div')
  container.innerHTML = html

  // GFM task lists: <li><input type=checkbox> …</li> → the editor's task list markup.
  container.querySelectorAll('li > input[type="checkbox"]').forEach((input) => {
    const li = input.parentElement!
    li.setAttribute('data-type', 'taskItem')
    li.setAttribute('data-checked', String((input as HTMLInputElement).checked))
    li.parentElement?.setAttribute('data-type', 'taskList')
    input.remove()
  })

  return PMDOMParser.fromSchema(schema).parse(container).content
}

/** If the fragment is a single paragraph, return its inline content (to merge into a sentence). */
export function asInline(fragment: Fragment): Fragment | null {
  if (fragment.childCount !== 1) return null
  const only = fragment.firstChild!
  return only.type.name === 'paragraph' ? only.content : null
}
