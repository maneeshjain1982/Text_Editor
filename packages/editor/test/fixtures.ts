import type { JSONContent } from '@tiptap/core'

/** 2×1 PNG. */
export const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIGAAq1gP9GDBaGAAAAABJRU5ErkJggg=='

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const cell = (type: 'tableCell' | 'tableHeader', value: string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
  content: [p(text(value))],
})

/** A document exercising every feature the exporter supports. */
export const richDocument: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [text('Quarterly Report')] },
    p(
      text('Bold', [{ type: 'bold' }]),
      text(' '),
      text('italic', [{ type: 'italic' }]),
      text(' '),
      text('red 14pt Georgia', [{ type: 'textStyle', attrs: { color: '#dc2626', fontSize: '14pt', fontFamily: 'Georgia' } }]),
      text(' '),
      text('highlighted', [{ type: 'highlight', attrs: { color: '#fef08a' } }]),
      text(' '),
      text('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      text(' H'),
      text('2', [{ type: 'subscript' }]),
      text('O'),
    ),
    { type: 'paragraph', attrs: { indent: 2, lineHeight: '2' }, content: [text('Indented, double spaced')] },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        { type: 'listItem', content: [p(text('First')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('Nested bullet'))] }] }] },
        { type: 'listItem', content: [p(text('Second'))] },
      ],
    },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [p(text('Done task'))] },
        { type: 'taskItem', attrs: { checked: false }, content: [p(text('Open task'))] },
      ],
    },
    { type: 'blockquote', content: [p(text('Quoted text'))] },
    { type: 'codeBlock', attrs: { language: 'javascript' }, content: [text('const answer = 42\nconsole.log(answer)')] },
    { type: 'horizontalRule' },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Region', { colwidth: [200] }), cell('tableHeader', 'Q1', { colwidth: [120] }), cell('tableHeader', 'Q2', { colwidth: [120] })] },
        { type: 'tableRow', content: [cell('tableCell', 'North', { rowspan: 2 }), cell('tableCell', 'Merged', { colspan: 2, backgroundColor: '#bbf7d0' })] },
        { type: 'tableRow', content: [cell('tableCell', '10'), cell('tableCell', '20')] },
      ],
    },
    { type: 'image', attrs: { src: PNG_DATA_URL, alt: 'Chart', caption: 'Figure 1', width: 300, align: 'center' } },
    { type: 'image', attrs: { src: PNG_DATA_URL, alt: 'Wrapped', caption: '', width: 120, align: 'wrapLeft' } },
    p(text('After image')),
  ],
}
