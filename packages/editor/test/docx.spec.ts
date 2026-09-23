// @vitest-environment node
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { exportDocx } from '../src/services/docx/exportDocx'
import { importDocx } from '../src/services/docx/importDocx'
import { firstFontFamily, toHalfPoints, toHexColor } from '../src/services/docx/units'
import { richDocument } from './fixtures'

async function unzip(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const read = (name: string) => zip.file(name)?.async('string') ?? Promise.resolve('')
  return {
    zip,
    document: await read('word/document.xml'),
    numbering: await read('word/numbering.xml'),
    styles: await read('word/styles.xml'),
    rels: await read('word/_rels/document.xml.rels'),
  }
}

describe('exportDocx', () => {
  it('produces a valid Word package', async () => {
    const blob = await exportDocx(richDocument, { pageSize: 'A4', title: 'Report' })
    const { zip, document } = await unzip(blob)
    expect(Object.keys(zip.files)).toContain('word/document.xml')
    expect(document).toContain('<w:body>')
  })

  it('maps headings, alignment and inline formatting', async () => {
    const { document, styles } = await unzip(await exportDocx(richDocument))
    expect(document).toMatch(/<w:pStyle w:val="Heading1"\/>/)
    expect(document).toMatch(/<w:jc w:val="center"\/>/)
    expect(document).toMatch(/<w:b\/>/)
    expect(document).toMatch(/<w:i\/>/)
    expect(document).toMatch(/<w:color w:val="DC2626"\/>/)
    expect(document).toMatch(/<w:sz w:val="28"\/>/) // 14pt
    expect(document).toMatch(/w:ascii="Georgia"/)
    expect(document).toMatch(/w:fill="FEF08A"/) // highlight as exact shading
    expect(document).toMatch(/<w:vertAlign w:val="subscript"\/>/)
    expect(styles).toContain('Calibri')
  })

  it('keeps paragraph indent and line spacing', async () => {
    const { document } = await unzip(await exportDocx(richDocument))
    expect(document).toMatch(/<w:ind w:left="1200"\/>/) // 2 × 40px × 15
    expect(document).toMatch(/w:line="480"/) // line-height 2
  })

  it('creates real numbered and bulleted lists', async () => {
    const { document, numbering } = await unzip(await exportDocx(richDocument))
    expect(document).toMatch(/<w:numPr>/)
    expect(document).toMatch(/<w:ilvl w:val="1"\/>/) // nested bullet
    expect(numbering).toContain('w:val="decimal"')
    expect(numbering).toContain('w:val="bullet"')
    expect(document).toContain('☑')
    expect(document).toContain('☐')
  })

  it('exports hyperlinks', async () => {
    const { document, rels } = await unzip(await exportDocx(richDocument))
    expect(document).toMatch(/<w:hyperlink [^>]*r:id=/)
    expect(rels).toContain('https://example.com')
  })

  it('exports tables with widths, merges, header row and shading', async () => {
    const { document } = await unzip(await exportDocx(richDocument))
    expect(document).toContain('<w:tbl>')
    expect(document).toMatch(/<w:gridSpan w:val="2"\/>/)
    expect(document).toMatch(/<w:vMerge w:val="restart"\/>/)
    expect(document).toMatch(/<w:vMerge w:val="continue"\/>/)
    expect(document).toMatch(/<w:tblHeader\/>/)
    expect(document).toMatch(/w:fill="BBF7D0"/)
    expect(document).toMatch(/<w:gridCol w:w="\d+"\/>/)
  })

  it('embeds images with size, alt text and wrapping', async () => {
    const { zip, document } = await unzip(await exportDocx(richDocument))
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true)
    expect(document).toContain('<w:drawing>')
    expect(document).toMatch(/<wp:extent cx="2857500" cy="1428750"\/>/) // 300×150px in EMU
    expect(document).toMatch(/descr="Chart"/)
    expect(document).toContain('<wp:anchor') // wrapped image floats
    expect(document).toContain('<wp:wrapSquare')
    expect(document).toContain('Figure 1')
  })

  it('colours code blocks with the syntax palette', async () => {
    const { document } = await unzip(await exportDocx(richDocument))
    expect(document).toMatch(/w:ascii="Consolas"/)
    expect(document).toMatch(/<w:color w:val="CF222E"\/>/) // keyword `const`
    expect(document).toMatch(/w:fill="F3F4F6"/)
  })

  it('uses the requested page size', async () => {
    const a4 = await unzip(await exportDocx(richDocument, { pageSize: 'A4' }))
    const letter = await unzip(await exportDocx(richDocument, { pageSize: 'Letter' }))
    expect(a4.document).toMatch(/<w:pgSz w:w="11906" w:h="16838"/)
    expect(letter.document).toMatch(/<w:pgSz w:w="12240" w:h="15840"/)
  })

  it('exports a page break as a Word page break', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Page one' }] },
        { type: 'pageBreak' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Page two' }] },
      ],
    }
    const { document } = await unzip(await exportDocx(doc))
    expect(document).toContain('<w:br w:type="page"/>')
  })

  it('exports an empty document', async () => {
    const { document } = await unzip(await exportDocx({ type: 'doc', content: [] }))
    expect(document).toContain('<w:p')
  })
})

describe('importDocx (round trip)', () => {
  it('reads back structure, formatting, tables and images', async () => {
    const blob = await exportDocx(richDocument)
    const html = await importDocx(blob)
    expect(html).toContain('<h1>')
    expect(html).toContain('Quarterly Report')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<table>')
    expect(html).toMatch(/<a href="https:\/\/example.com\/?"/)
    expect(html).toMatch(/<img [^>]*src="data:image\/png;base64,/)
    expect(html).toMatch(/<ol>/)
  })
})

describe('unit conversions', () => {
  it('normalises colours', () => {
    expect(toHexColor('#abc')).toBe('AABBCC')
    expect(toHexColor('#2563eb')).toBe('2563EB')
    expect(toHexColor('rgb(255, 0, 128)')).toBe('FF0080')
    expect(toHexColor('rgba(0,0,0,0)')).toBeUndefined()
    expect(toHexColor('transparent')).toBeUndefined()
    expect(toHexColor('red')).toBe('FF0000')
  })

  it('converts font sizes to half-points', () => {
    expect(toHalfPoints('12pt')).toBe(24)
    expect(toHalfPoints('16px')).toBe(24)
    expect(toHalfPoints('2em', 11)).toBe(44)
    expect(toHalfPoints('nope')).toBeUndefined()
  })

  it('picks the first font family', () => {
    expect(firstFontFamily('"Times New Roman", serif')).toBe('Times New Roman')
    expect(firstFontFamily('')).toBeUndefined()
  })
})
