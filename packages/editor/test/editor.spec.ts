import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/extensions'
import { cleanPastedHTML } from '../src/extensions/PasteCleanup'
import { ensureTrailingParagraph, normalizeContent } from '../src/services/content'
import { DEFAULT_FEATURES } from '../src/defaults'
import { markdownPageBreaksToHtml, toHtmlDocument, toMarkdown } from '../src/services/exporters'
import { PAGE_BREAK_HTML, PAGE_BREAK_MARKER } from '../src/extensions/PageBreak'
import { extractHtmlBody, textToHtml } from '../src/services/importers'
import { readImageSize, validateImage } from '../src/services/image'
import { resolveToolbar } from '../src/toolbar/items'
import { PNG_DATA_URL } from './fixtures'
import type { EditorContent } from '../src/types'

let editor: Editor | undefined

function createEditor(content: EditorContent) {
  editor = new Editor({
    content,
    extensions: buildExtensions({
      placeholder: () => '',
      // Images use a Vue node view, which needs a mounted component; the schema is what matters here.
      features: { ...DEFAULT_FEATURES, images: false },
      image: { maxImageSize: 1024, onError: () => {} },
    }),
  })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

describe('search & replace', () => {
  it('finds matches case-insensitively by default', () => {
    const e = createEditor('<p>Apple apple APPLE</p><p>pineapple</p>')
    e.commands.setSearchTerm('apple')
    expect(e.storage.searchReplace.results).toHaveLength(4)
    e.commands.setCaseSensitive(true)
    expect(e.storage.searchReplace.results).toHaveLength(2)
  })

  it('navigates and replaces the current match', () => {
    const e = createEditor('<p>one two one</p>')
    e.commands.setSearchTerm('one')
    e.commands.nextMatch()
    expect(e.storage.searchReplace.index).toBe(1)
    e.commands.setReplaceTerm('1')
    e.commands.replaceCurrent()
    expect(e.getText()).toBe('one two 1')
  })

  it('replaces all matches, including across formatting', () => {
    const e = createEditor('<p>cat <strong>cat</strong> c<em>at</em></p>')
    e.commands.setSearchTerm('cat')
    expect(e.storage.searchReplace.results).toHaveLength(3)
    e.commands.setReplaceTerm('dog')
    e.commands.replaceAll()
    expect(e.getText()).toBe('dog dog dog')
    expect(e.storage.searchReplace.results).toHaveLength(0)
  })
})

describe('block attributes', () => {
  it('indents paragraphs and nests list items', () => {
    const e = createEditor('<p>text</p><ul><li><p>a</p></li><li><p>b</p></li></ul>')
    e.commands.setTextSelection(1)
    e.commands.indent()
    e.commands.indent()
    expect(e.getJSON().content![0].attrs!.indent).toBe(2)
    expect(e.getHTML()).toContain('margin-left: 80px')

    let posB = 0
    e.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'b') posB = pos
    })
    e.commands.setTextSelection(posB)
    e.commands.indent()
    expect(e.getHTML()).toMatch(/<li><p>a<\/p><ul><li><p>b<\/p><\/li><\/ul><\/li>/)
  })

  it('sets and parses paragraph line height', () => {
    const e = createEditor('<p style="line-height: 1.15">x</p>')
    expect(e.getJSON().content![0].attrs!.lineHeight).toBe('1.15')
    e.commands.setTextSelection(1)
    e.commands.setBlockLineHeight('2')
    expect(e.getHTML()).toContain('line-height: 2')
  })
})

describe('empty JSON documents', () => {
  it('normalises { type: "doc", content: [] } so formatting can be toggled before typing', () => {
    expect(normalizeContent({ type: 'doc', content: [] })).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(normalizeContent({ type: 'doc' })).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(normalizeContent('')).toBe('')
    expect(normalizeContent(null)).toBe('')

    // The problem: as *initial* content, the empty doc has no block to hold a cursor.
    const raw = createEditor({ type: 'doc', content: [] })
    expect(raw.state.doc.childCount).toBe(0)
    raw.destroy()

    const e = createEditor(normalizeContent({ type: 'doc', content: [] }))
    expect(e.state.doc.childCount).toBe(1)
    e.commands.focus('start')
    e.commands.toggleBold()
    expect(e.state.storedMarks?.map((m) => m.type.name)).toEqual(['bold'])
    e.commands.insertContent('bold text')
    expect(e.getHTML()).toBe('<p><strong>bold text</strong></p>')
  })
})

describe('trailing paragraph', () => {
  it('is added at load time, not on the first click, and not as an undo step', () => {
    const e = createEditor('<p>Intro</p><table><tbody><tr><td><p>cell</p></td></tr></tbody></table>')
    ensureTrailingParagraph(e)
    expect(e.state.doc.lastChild?.type.name).toBe('paragraph')
    const loaded = JSON.stringify(e.getJSON())
    e.commands.setTextSelection(2) // a click
    expect(JSON.stringify(e.getJSON())).toBe(loaded)
    expect(e.can().undo()).toBe(false)
  })
})

describe('schema round trip', () => {
  it('keeps colours, fonts, highlight, alignment and cell backgrounds', () => {
    const html =
      '<p style="text-align: center"><span style="color: #dc2626; font-family: Georgia; font-size: 14pt">x</span><mark data-color="#bbf7d0" style="background-color: #bbf7d0">y</mark></p>' +
      '<table><tbody><tr><td data-background="#fef08a" style="background-color: #fef08a"><p>c</p></td></tr></tbody></table>'
    const out = createEditor(html).getHTML()
    expect(out).toContain('text-align: center')
    expect(out).toContain('color: #dc2626')
    expect(out).toContain('font-family: Georgia')
    expect(out).toContain('font-size: 14pt')
    expect(out).toContain('background-color: #bbf7d0')
    expect(out).toContain('data-background="#fef08a"')
  })

  it('supports task lists and highlighted code blocks', () => {
    const e = createEditor('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li></ul><pre><code class="language-js">let a = 1</code></pre>')
    const json = e.getJSON()
    expect(json.content![0].type).toBe('taskList')
    expect(json.content![0].content![0].attrs!.checked).toBe(true)
    expect(json.content![1].type).toBe('codeBlock')
  })
})

describe('page breaks', () => {
  it('keeps page breaks through the schema and parses Word-style CSS breaks', () => {
    const out = createEditor('<p>one</p><div data-type="page-break"></div><p>two</p>').getHTML()
    expect(out).toContain('data-type="page-break"')

    const legacy = createEditor('<p>one</p><p style="page-break-before: always"></p><p>two</p>').getJSON()
    expect(legacy.content!.some((node) => node.type === 'pageBreak')).toBe(true)
  })

  it('inserts a page break with the command', () => {
    const e = createEditor('<p>one</p>')
    e.commands.setPageBreak()
    expect(e.getJSON().content!.some((node) => node.type === 'pageBreak')).toBe(true)
  })

  it('round trips through Markdown as a comment marker', () => {
    const md = toMarkdown('<p>one</p><div data-type="page-break"></div><p>two</p>')
    expect(md).toContain(PAGE_BREAK_MARKER)
    expect(markdownPageBreaksToHtml(md)).toContain(PAGE_BREAK_HTML)
  })
})

describe('automatic pagination', () => {
  it('is off unless the page layout asks for it, and adds no nodes to the document', () => {
    const off = new Editor({
      content: '<p>one</p>',
      extensions: buildExtensions({
        placeholder: () => '',
        features: { ...DEFAULT_FEATURES, images: false },
        image: { maxImageSize: 1024, onError: () => {} },
      }),
    })
    expect(off.state.plugins.some((p) => (p as { key?: string }).key?.startsWith('autoPagination'))).toBe(false)
    off.destroy()

    editor = new Editor({
      content: '<p>one</p>',
      extensions: buildExtensions({
        placeholder: () => '',
        features: { ...DEFAULT_FEATURES, images: false },
        image: { maxImageSize: 1024, onError: () => {} },
        autoPagination: { enabled: true, label: 'Page {page}' },
      }),
    })
    expect(editor.state.plugins.some((p) => (p as { key?: string }).key?.startsWith('autoPagination'))).toBe(true)
    // Page gaps are decorations, so content and exports are unaffected.
    expect(editor.getHTML()).toBe('<p>one</p>')
    expect(editor.storage.autoPagination.pages).toBe(1)
  })
})

describe('exporters', () => {
  it('builds a standalone HTML document with inlined styles', () => {
    const doc = toHtmlDocument('<p>Hello</p>', 'My <doc>')
    expect(doc).toContain('<!doctype html>')
    expect(doc).toContain('<title>My &lt;doc&gt;</title>')
    expect(doc).toContain('.re-export h1')
    expect(doc).not.toContain('.re-content')
  })

  it('converts HTML to GitHub-flavoured Markdown', () => {
    const md = toMarkdown(
      '<h2>Title</h2><p><strong>b</strong> <em>i</em> <s>s</s></p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li></ul>' +
        '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>' +
        `<figure data-type="image"><img src="${PNG_DATA_URL}" alt="pic"><figcaption>cap</figcaption></figure>`,
    )
    expect(md).toContain('## Title')
    expect(md).toContain('**b**')
    expect(md).toContain('*i*')
    expect(md).toContain('- [x] done')
    expect(md).toMatch(/\| A \| B \|/)
    expect(md).toContain('![pic](data:image/png')
    expect(md).toContain('*cap*')
  })
})

describe('importers', () => {
  it('converts plain text to paragraphs', () => {
    expect(textToHtml('a\nb\n\n<c>')).toBe('<p>a<br>b</p><p>&lt;c&gt;</p>')
  })

  it('extracts the body of full HTML documents', () => {
    expect(extractHtmlBody('<html><body class="x"><p>hi</p></body></html>')).toBe('<p>hi</p>')
    expect(extractHtmlBody('<p>frag</p>')).toBe('<p>frag</p>')
  })
})

describe('paste cleanup', () => {
  it('removes Office markup', () => {
    const dirty =
      '<!--[if gte mso 9]><xml>junk</xml><![endif]--><style>p{}</style><p class="MsoNormal" style="mso-line-height-rule:exactly;color:red">Hi<o:p></o:p></p>'
    const clean = cleanPastedHTML(dirty)
    expect(clean).not.toContain('mso')
    expect(clean).not.toContain('o:p')
    expect(clean).not.toContain('<style')
    expect(clean).toContain('color:red')
    expect(clean).toContain('Hi')
  })
})

describe('images', () => {
  it('reads PNG dimensions from the header', () => {
    const bytes = Uint8Array.from(atob(PNG_DATA_URL.split(',')[1]), (c) => c.charCodeAt(0))
    expect(readImageSize(bytes)).toEqual({ width: 2, height: 1 })
  })

  it('validates type and size', () => {
    const png = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })
    const pdf = new File([new Uint8Array(10)], 'a.pdf', { type: 'application/pdf' })
    expect(validateImage(png, 100)).toEqual({ ok: true })
    expect(validateImage(png, 5)).toEqual({ ok: false, reason: 'image-size' })
    expect(validateImage(pdf, 100)).toEqual({ ok: false, reason: 'image-type' })
  })
})

describe('toolbar config', () => {
  it('drops controls for disabled features', () => {
    const groups = resolveToolbar('full', { ...DEFAULT_FEATURES, tables: false, images: false })
    const items = groups.flat()
    expect(items).not.toContain('table')
    expect(items).not.toContain('image')
    expect(items).toContain('bold')
  })

  it('accepts custom groups and "none"', () => {
    expect(resolveToolbar([['bold', 'italic'], ['table']], DEFAULT_FEATURES)).toEqual([['bold', 'italic'], ['table']])
    expect(resolveToolbar('none', DEFAULT_FEATURES)).toEqual([])
  })
})
