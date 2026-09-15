import type { JSONContent } from '@tiptap/core'

export type ImportResult = { html: string } | { json: JSONContent }

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Read the <body> of an HTML document (or return a fragment unchanged). */
export function extractHtmlBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return match ? match[1] : html
}

/** Convert a user-picked file into editor content. Heavy parsers are loaded on demand. */
export async function importFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase()
  const ext = name.slice(name.lastIndexOf('.') + 1)

  switch (ext) {
    case 'docx': {
      const { importDocx } = await import('./docx/importDocx')
      return { html: await importDocx(file) }
    }
    case 'html':
    case 'htm':
      return { html: extractHtmlBody(await file.text()) }
    case 'md':
    case 'markdown': {
      const { marked } = await import('marked')
      return { html: await marked.parse(await file.text(), { gfm: true }) }
    }
    case 'json': {
      const json = JSON.parse(await file.text())
      if (json?.type !== 'doc') throw new Error('Not an editor JSON document')
      return { json }
    }
    case 'txt':
      return { html: textToHtml(await file.text()) }
    default:
      throw new Error(`Unsupported file type: .${ext}`)
  }
}
