import TurndownService from 'turndown'
// @ts-expect-error – package ships no types
import { gfm } from 'turndown-plugin-gfm'
import { PAGE_BREAK_HTML, PAGE_BREAK_MARKER } from '../extensions/PageBreak'
import tokensCss from '../styles/tokens.css?raw'
import contentCss from '../styles/content.css?raw'

const EXPORT_CSS = `${tokensCss}
${contentCss.replace(/\.re-content/g, '.re-export')}
body { margin: 0; background: #fff; }
.re-export { max-width: 210mm; margin: 0 auto; padding: 25.4mm; }
.re-export figure[data-align='wrapLeft'], .re-export figure[data-align='wrapRight'] { max-width: 50%; }
@media (max-width: 720px) { .re-export { padding: 24px 16px; } }`

export const MIME_TYPES = {
  html: 'text/html',
  json: 'application/json',
  markdown: 'text/markdown',
  text: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

export const EXTENSIONS = { html: 'html', json: 'json', markdown: 'md', text: 'txt', docx: 'docx' } as const

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Standalone HTML file with the content styles inlined, so it looks the same when opened anywhere. */
export function toHtmlDocument(bodyHtml: string, title = 'Document'): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<article class="re-export">
${bodyHtml}
</article>
</body>
</html>`
}

let turndown: TurndownService | undefined

export function toMarkdown(html: string): string {
  if (!turndown) {
    turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
    turndown.use(gfm)
    // TipTap wraps cell content in <p>; Markdown table cells must stay on one line.
    turndown.addRule('cellParagraph', {
      filter: (node) => node.nodeName === 'P' && /^(TH|TD)$/.test(node.parentNode?.nodeName ?? ''),
      replacement: (content, node) => (node.nextSibling ? `${content.trim()}<br>` : content.trim()),
    })
    // …and list items wrap their text in <p>; keep lists tight instead of "loose" with blank lines.
    turndown.addRule('listParagraph', {
      filter: (node) => node.nodeName === 'P' && node.parentNode?.nodeName === 'LI',
      replacement: (content, node) => (node.nextSibling ? `${content}\n` : content),
    })
    turndown.addRule('taskItem', {
      filter: (node) => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
      replacement: (content, node) => {
        const checked = (node as HTMLElement).getAttribute('data-checked') === 'true'
        return `- [${checked ? 'x' : ' '}] ${content.trim().replace(/\n+/g, ' ')}\n`
      },
    })
    turndown.addRule('figure', {
      filter: (node) => node.nodeName === 'FIGURE' && node.getAttribute('data-type') === 'image',
      replacement: (_content, node) => {
        const img = (node as HTMLElement).querySelector('img')
        const caption = (node as HTMLElement).querySelector('figcaption')?.textContent
        if (!img) return ''
        const md = `![${img.getAttribute('alt') || ''}](${img.getAttribute('src')})`
        return `\n\n${md}${caption ? `\n*${caption}*` : ''}\n\n`
      },
    })
    // Page breaks survive a Markdown round trip as an HTML comment.
    turndown.addRule('pageBreak', {
      filter: (node) => node.getAttribute?.('data-type') === 'page-break',
      replacement: () => `\n\n${PAGE_BREAK_MARKER}\n\n`,
    })
    turndown.addRule('highlight', { filter: ['mark'], replacement: (c) => `==${c}==` })
    turndown.addRule('underline', { filter: ['u'], replacement: (c) => `<u>${c}</u>` })
  }
  // The GFM plugin only converts tables whose header row is the first child, so drop the
  // <colgroup> TipTap adds for column widths (widths have no Markdown equivalent anyway).
  // Page-break divs are empty, and turndown discards empty blocks before custom rules run,
  // so give them content the rule can replace.
  return turndown.turndown(
    html.replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '').replace(/(<div[^>]*data-type="page-break"[^>]*>)\s*(<\/div>)/g, '$1page break$2'),
  )
}

/** Markdown → HTML page-break markers, so imported Markdown keeps its page breaks. */
export const markdownPageBreaksToHtml = (markdown: string) => markdown.split(PAGE_BREAK_MARKER).join(PAGE_BREAK_HTML)

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Print via a hidden iframe so the host page layout is untouched. */
export function printHtml(bodyHtml: string, title: string, pageSize: 'A4' | 'Letter') {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  const pageCss = `@page { size: ${pageSize}; margin: 25.4mm; } body { margin: 0; } .re-export { max-width: none; padding: 0; }`
  doc.open()
  doc.write(toHtmlDocument(bodyHtml, title).replace('</style>', `${pageCss}</style>`))
  doc.close()
  const run = () => {
    iframe.contentWindow!.focus()
    iframe.contentWindow!.print()
    setTimeout(() => iframe.remove(), 1000)
  }
  // Wait for images so they appear in the printout.
  const images = Array.from(doc.images).filter((img) => !img.complete)
  if (!images.length) setTimeout(run, 50)
  else Promise.all(images.map((img) => new Promise((r) => (img.onload = img.onerror = r)))).then(run)
}
