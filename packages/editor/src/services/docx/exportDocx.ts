import type { JSONContent } from '@tiptap/core'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  LineRuleType,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
  type ILevelsOptions,
  type INumberingOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx'
import { lowlight, TOKEN_COLORS } from '../../extensions/lowlight'
import { INDENT_STEP_PX } from '../../extensions/BlockAttributes'
import { detectImageType, fetchImageBytes, rasterizeToPng, readImageSize, type DocxImageType } from '../image'
import {
  PAGE_MARGIN_TWIPS,
  PAGE_SIZES,
  TWIPS_PER_PX,
  contentWidthPx,
  firstFontFamily,
  toHalfPoints,
  toHexColor,
} from './units'

export interface DocxExportOptions {
  pageSize?: 'A4' | 'Letter'
  title?: string
  creator?: string
  /** Should match the editor's --re-font / --re-font-size so output looks identical. */
  font?: string
  fontSizePt?: number
}

// Design tokens mirrored from styles/tokens.css (light theme).
const TEXT = '1F2328'
const MUTED = '6B7280'
const BORDER = 'D8DDE3'
const CODE_BG = 'F3F4F6'
const LINK = '2563EB'
const MONO = 'Consolas'
const LINE = 360 // line-height 1.5
const PARA_AFTER = 132 // 0.6em of 11pt

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]
const HEADING_EM = [2, 1.6, 1.3, 1.1, 1, 0.9]

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

const LIST_INDENT = 360
const BULLETS = ['●', '○', '■']
const NUMBER_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN]

type Block = Paragraph | Table

interface RunStyle extends Record<string, unknown> {
  bold?: boolean
  italics?: boolean
  font?: string
  size?: number
  color?: string
}

interface Ctx {
  availableWidthPx: number
  /** Numbering references in use, keyed by start value. */
  orderedRefs: Set<number>
  nextInstance: number
  images: Map<string, Promise<LoadedImage | null>>
  baseSize: number
}

interface LoadedImage {
  data: Uint8Array
  type: DocxImageType
  width: number
  height: number
}

/** Convert a TipTap/ProseMirror JSON document to a .docx Blob. */
export async function exportDocx(doc: JSONContent, options: DocxExportOptions = {}): Promise<Blob> {
  const pageSize = options.pageSize ?? 'A4'
  const font = options.font ?? 'Calibri'
  const baseSize = Math.round((options.fontSizePt ?? 11) * 2)

  const ctx: Ctx = {
    availableWidthPx: contentWidthPx(pageSize),
    orderedRefs: new Set(),
    nextInstance: 1,
    images: new Map(),
    baseSize,
  }

  const children = await convertBlocks(doc.content ?? [], ctx, {})
  if (!children.length) children.push(new Paragraph({}))

  const document = new Document({
    title: options.title,
    creator: options.creator ?? 'Rich Editor',
    styles: buildStyles(font, baseSize),
    numbering: buildNumbering(ctx.orderedRefs),
    sections: [
      {
        properties: {
          page: {
            size: PAGE_SIZES[pageSize],
            margin: { top: PAGE_MARGIN_TWIPS, bottom: PAGE_MARGIN_TWIPS, left: PAGE_MARGIN_TWIPS, right: PAGE_MARGIN_TWIPS },
          },
        },
        children,
      },
    ],
  })
  return Packer.toBlob(document)
}

// ---------------------------------------------------------------------------
// Styles & numbering
// ---------------------------------------------------------------------------

function buildStyles(font: string, baseSize: number) {
  const heading = (i: number) => ({
    run: { font, size: Math.round(baseSize * HEADING_EM[i]), bold: true, color: i === 5 ? MUTED : TEXT },
    paragraph: { spacing: { before: Math.round(baseSize * HEADING_EM[i] * 10), after: Math.round(baseSize * HEADING_EM[i] * 4), line: 300, lineRule: LineRuleType.AUTO }, keepNext: true },
  })
  return {
    default: {
      document: {
        run: { font, size: baseSize, color: TEXT },
        paragraph: { spacing: { after: PARA_AFTER, line: LINE, lineRule: LineRuleType.AUTO } },
      },
      heading1: heading(0),
      heading2: heading(1),
      heading3: heading(2),
      heading4: heading(3),
      heading5: heading(4),
      heading6: heading(5),
      hyperlink: { run: { color: LINK, underline: {} } },
    },
  }
}

function buildNumbering(orderedStarts: Set<number>): INumberingOptions {
  const levels = (make: (level: number) => Partial<ILevelsOptions>): ILevelsOptions[] =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: LIST_INDENT } } },
      ...make(level),
    }))

  const config: INumberingOptions['config'][number][] = [
    {
      reference: 're-bullet',
      levels: levels((level) => ({ format: LevelFormat.BULLET, text: BULLETS[level % BULLETS.length] })),
    },
  ]
  for (const start of orderedStarts) {
    config.push({
      reference: orderedRef(start),
      levels: levels((level) => ({
        format: NUMBER_FORMATS[level % NUMBER_FORMATS.length],
        text: `%${level + 1}.`,
        start: level === 0 ? start : 1,
      })),
    })
  }
  return { config }
}

const orderedRef = (start: number) => `re-ordered-${start}`

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

interface BlockEnv {
  list?: { reference: string; instance: number; level: number } | null
  /** Extra left indent (twips) for blocks nested in lists / quotes. */
  indentTwips?: number
  quote?: boolean
  inTableHeader?: boolean
}

async function convertBlocks(nodes: JSONContent[], ctx: Ctx, env: BlockEnv): Promise<Block[]> {
  const out: Block[] = []
  for (const node of nodes) out.push(...(await convertBlock(node, ctx, env)))
  return out
}

async function convertBlock(node: JSONContent, ctx: Ctx, env: BlockEnv): Promise<Block[]> {
  const attrs = node.attrs ?? {}
  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const isHeading = node.type === 'heading'
      const level = Math.min(6, Math.max(1, attrs.level ?? 1))
      const runStyle: RunStyle = {}
      if (env.quote) runStyle.color = MUTED
      if (env.inTableHeader) runStyle.bold = true
      const children = await convertInline(node.content ?? [], ctx, runStyle)
      const indentLeft = (attrs.indent ?? 0) * INDENT_STEP_PX * TWIPS_PER_PX + (env.list ? 0 : env.indentTwips ?? 0)
      return [
        new Paragraph({
          children,
          heading: isHeading ? HEADINGS[level - 1] : undefined,
          alignment: ALIGN[attrs.textAlign] ?? undefined,
          ...(env.list ? { numbering: env.list, contextualSpacing: true } : {}),
          indent: indentLeft ? { left: indentLeft + (env.list ? LIST_INDENT * (env.list.level + 1) : 0) } : undefined,
          spacing: {
            ...(attrs.lineHeight ? { line: Math.round(240 * parseFloat(attrs.lineHeight)), lineRule: LineRuleType.AUTO } : {}),
            ...(env.list ? { after: 40 } : {}),
          },
          ...(env.quote ? quoteParagraphProps() : {}),
        }),
      ]
    }

    case 'blockquote':
      return convertBlocks(node.content ?? [], ctx, { ...env, quote: true, indentTwips: (env.indentTwips ?? 0) + 280 })

    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return convertList(node, ctx, env)

    case 'codeBlock':
      return [codeBlockParagraph(node, env)]

    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()], spacing: { after: 0, line: 240 } })]

    case 'horizontalRule':
      return [
        new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 1 } },
          spacing: { before: 240, after: 240, line: 240 },
        }),
      ]

    case 'image':
      return imageBlocks(node, ctx, env)

    case 'table':
      return [await convertTable(node, ctx, env)]

    default:
      // Unknown block from a custom extension: keep its text.
      if (node.content?.length) return convertBlocks(node.content, ctx, env)
      return node.text ? [new Paragraph({ children: [new TextRun(node.text)] })] : []
  }
}

function quoteParagraphProps() {
  return {
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: BORDER, space: 12 } },
  }
}

async function convertList(node: JSONContent, ctx: Ctx, env: BlockEnv): Promise<Block[]> {
  const level = env.list ? env.list.level + 1 : 0
  const out: Block[] = []

  if (node.type === 'taskList') {
    for (const item of node.content ?? []) {
      const [first, ...rest] = item.content ?? []
      const box = new TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ', font: 'Segoe UI Symbol' })
      const runs = first?.type === 'paragraph' ? await convertInline(first.content ?? [], ctx, item.attrs?.checked ? { color: MUTED } : {}) : []
      const indent = (env.indentTwips ?? 0) + LIST_INDENT * level + (env.list ? LIST_INDENT : 0)
      out.push(new Paragraph({ children: [box, ...runs], indent: { left: indent + LIST_INDENT, hanging: LIST_INDENT }, spacing: { after: 40 } }))
      const nestedEnv: BlockEnv = { ...env, list: null, indentTwips: indent + LIST_INDENT }
      for (const child of first?.type === 'paragraph' ? rest : item.content ?? []) out.push(...(await convertBlock(child, ctx, nestedEnv)))
    }
    return out
  }

  let reference = 're-bullet'
  let instance = 0
  if (node.type === 'orderedList') {
    const start = Number(node.attrs?.start) || 1
    ctx.orderedRefs.add(start)
    reference = orderedRef(start)
    instance = ctx.nextInstance++
  }
  const listEnv = { reference, instance, level: Math.min(level, 8) }

  for (const item of node.content ?? []) {
    let isFirst = true
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
        out.push(...(await convertList(child, ctx, { ...env, list: listEnv })))
      } else if (isFirst && (child.type === 'paragraph' || child.type === 'heading')) {
        out.push(...(await convertBlock(child, ctx, { ...env, list: listEnv })))
      } else {
        // Continuation paragraphs inside the same item align with the item text.
        out.push(...(await convertBlock(child, ctx, { ...env, list: null, indentTwips: (env.indentTwips ?? 0) + LIST_INDENT * (listEnv.level + 1) })))
      }
      isFirst = false
    }
  }
  return out
}

function codeBlockParagraph(node: JSONContent, env: BlockEnv): Paragraph {
  const text = (node.content ?? []).map((c) => c.text ?? '').join('')
  const language = node.attrs?.language
  const size = 20
  const runs: TextRun[] = []

  const pushText = (value: string, color?: string, extra: Partial<IRunOptions> = {}) => {
    const lines = value.split('\n')
    lines.forEach((line, i) => {
      runs.push(new TextRun({ text: line, font: MONO, size, color, break: i > 0 ? 1 : undefined, ...extra }))
    })
  }

  if (language && lowlight.registered(language)) {
    const walk = (nodes: any[], color?: string, italic?: boolean) => {
      for (const n of nodes) {
        if (n.type === 'text') pushText(n.value, color, italic ? { italics: true } : {})
        else if (n.type === 'element') {
          const cls: string[] = (n.properties?.className ?? []).map((c: string) => c.replace(/^hljs-/, ''))
          const key = cls.join('.')
          const next = TOKEN_COLORS[key] ?? cls.map((c) => TOKEN_COLORS[c]).find(Boolean) ?? color
          walk(n.children ?? [], next, italic || cls.includes('comment'))
        }
      }
    }
    walk(lowlight.highlight(language, text).children as any[])
  } else {
    pushText(text)
  }

  return new Paragraph({
    children: runs,
    shading: { type: ShadingType.CLEAR, fill: CODE_BG, color: 'auto' },
    spacing: { before: 80, after: 160, line: 324 }, // line-height 1.35 as in content.css
    indent: env.indentTwips ? { left: env.indentTwips } : undefined,
    border: {
      top: { style: BorderStyle.SINGLE, size: 1, color: CODE_BG, space: 8 },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: CODE_BG, space: 8 },
      left: { style: BorderStyle.SINGLE, size: 1, color: CODE_BG, space: 8 },
      right: { style: BorderStyle.SINGLE, size: 1, color: CODE_BG, space: 8 },
    },
  })
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function loadImage(src: string, ctx: Ctx): Promise<LoadedImage | null> {
  let pending = ctx.images.get(src)
  if (!pending) {
    pending = (async () => {
      try {
        let data = await fetchImageBytes(src)
        let type = detectImageType(data)
        let size = type ? readImageSize(data) : null
        if (!type || !size) {
          const mime = src.startsWith('data:') ? src.slice(5, src.indexOf(';')) : ''
          const png = await rasterizeToPng(data, mime)
          if (!png) return null
          data = png.bytes
          type = 'png'
          size = png.size
        }
        return { data, type, width: size.width, height: size.height }
      } catch {
        return null
      }
    })()
    ctx.images.set(src, pending)
  }
  return pending
}

async function imageBlocks(node: JSONContent, ctx: Ctx, env: BlockEnv): Promise<Block[]> {
  const { src, alt, caption, width, align = 'center', title } = node.attrs ?? {}
  if (!src) return []
  const img = await loadImage(src, ctx)
  if (!img) {
    return [new Paragraph({ children: [new TextRun({ text: `[${alt || 'image'}]`, italics: true, color: MUTED })] })]
  }

  const maxWidth = ctx.availableWidthPx - ((env.indentTwips ?? 0) / TWIPS_PER_PX)
  const displayWidth = Math.min(Number(width) || img.width, maxWidth)
  const displayHeight = Math.round((displayWidth * img.height) / img.width)
  const wrap = align === 'wrapLeft' || align === 'wrapRight'

  const run = new ImageRun({
    type: img.type,
    data: img.data,
    transformation: { width: Math.round(displayWidth), height: displayHeight },
    altText: { name: 'Image', title: title || alt || '', description: alt || '' },
    ...(wrap
      ? {
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.COLUMN,
              align: align === 'wrapLeft' ? HorizontalPositionAlign.LEFT : HorizontalPositionAlign.RIGHT,
            },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
            wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
            margins: { left: align === 'wrapRight' ? 144000 : 0, right: align === 'wrapLeft' ? 144000 : 0, top: 0, bottom: 72000 },
          },
        }
      : {}),
  })

  const alignment = align === 'left' ? AlignmentType.LEFT : align === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER
  const blocks: Block[] = [
    new Paragraph({
      children: [run],
      alignment: wrap ? undefined : alignment,
      spacing: wrap ? { after: 0, line: 240 } : { before: 120, after: caption ? 60 : 160, line: 240 },
      indent: env.indentTwips ? { left: env.indentTwips } : undefined,
      keepNext: !!caption,
    }),
  ]
  if (caption) {
    blocks.push(
      new Paragraph({
        children: [new TextRun({ text: caption, size: Math.round(ctx.baseSize * 0.9), color: MUTED })],
        alignment: wrap ? undefined : alignment === AlignmentType.CENTER ? AlignmentType.CENTER : alignment,
        spacing: { after: 200 },
      }),
    )
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

async function convertTable(node: JSONContent, ctx: Ctx, env: BlockEnv): Promise<Table> {
  const rows = node.content ?? []
  const maxWidthPx = ctx.availableWidthPx - (env.indentTwips ?? 0) / TWIPS_PER_PX

  // Column count and widths come from the first row (colspans expanded).
  const colWidths: (number | null)[] = []
  for (const cell of rows[0]?.content ?? []) {
    const span = cell.attrs?.colspan ?? 1
    const widths: (number | null)[] = cell.attrs?.colwidth ?? []
    for (let i = 0; i < span; i++) colWidths.push(widths[i] ?? null)
  }
  const colCount = Math.max(1, colWidths.length)
  const known = colWidths.filter((w): w is number => !!w)
  const knownSum = known.reduce((a, b) => a + b, 0)
  const unknownCount = colCount - known.length
  const fallback = unknownCount ? Math.max(48, (maxWidthPx - knownSum) / unknownCount) : 0
  let px = colWidths.map((w) => w ?? fallback)
  const total = px.reduce((a, b) => a + b, 0)
  // Unresized tables stretch to the full width like in the editor (width: 100%).
  if (total > maxWidthPx || !known.length) px = px.map((w) => (w * maxWidthPx) / total)
  const twips = px.map((w) => Math.round(w * TWIPS_PER_PX))

  const border = { style: BorderStyle.SINGLE, size: 6, color: BORDER }
  const docxRows: TableRow[] = []

  for (const row of rows) {
    const cells: TableCell[] = []
    let colIndex = 0
    const allHeader = (row.content ?? []).every((c) => c.type === 'tableHeader')
    for (const cell of row.content ?? []) {
      const a = cell.attrs ?? {}
      const colspan = a.colspan ?? 1
      const width = twips.slice(colIndex, colIndex + colspan).reduce((s, w) => s + w, 0)
      colIndex += colspan
      const isHeader = cell.type === 'tableHeader'
      const cellCtx: Ctx = { ...ctx, availableWidthPx: width / TWIPS_PER_PX - 16 }
      const children = await convertBlocks(cell.content ?? [], cellCtx, { inTableHeader: isHeader })
      const fill = toHexColor(a.backgroundColor) ?? (isHeader ? CODE_BG : undefined)
      cells.push(
        new TableCell({
          children: children.length && children[children.length - 1] instanceof Paragraph ? children : [...children, new Paragraph({})],
          columnSpan: colspan > 1 ? colspan : undefined,
          rowSpan: (a.rowspan ?? 1) > 1 ? a.rowspan : undefined,
          width: { size: width, type: WidthType.DXA },
          shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
          margins: { top: 90, bottom: 30, left: 120, right: 120 },
        }),
      )
    }
    docxRows.push(new TableRow({ children: cells, tableHeader: allHeader && docxRows.length === 0 }))
  }

  return new Table({
    rows: docxRows,
    columnWidths: twips,
    width: { size: twips.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    indent: env.indentTwips ? { size: env.indentTwips, type: WidthType.DXA } : undefined,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
  })
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------

async function convertInline(nodes: JSONContent[], ctx: Ctx, base: RunStyle): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = []
  let link: { href: string; runs: TextRun[] } | null = null

  const flushLink = () => {
    if (link) out.push(new ExternalHyperlink({ link: link.href, children: link.runs }))
    link = null
  }

  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      const run = new TextRun({ break: 1 })
      if (link) link.runs.push(run)
      else out.push(run)
      continue
    }
    if (node.type !== 'text' || !node.text) continue

    const marks = node.marks ?? []
    const linkMark = marks.find((m) => m.type === 'link')
    const run = new TextRun({ text: node.text, ...runOptions(marks, base, ctx) })

    if (linkMark?.attrs?.href) {
      const href: string = linkMark.attrs.href
      if (link && (link as { href: string }).href !== href) flushLink()
      if (!link) link = { href, runs: [] }
      link.runs.push(run)
    } else {
      flushLink()
      out.push(run)
    }
  }
  flushLink()
  return out
}

function runOptions(marks: NonNullable<JSONContent['marks']>, base: RunStyle, ctx: Ctx): IRunOptions {
  const o: Record<string, any> = { ...base }
  for (const mark of marks) {
    const a = mark.attrs ?? {}
    switch (mark.type) {
      case 'bold': o.bold = true; break
      case 'italic': o.italics = true; break
      case 'underline': o.underline = {}; break
      case 'strike': o.strike = true; break
      case 'superscript': o.superScript = true; break
      case 'subscript': o.subScript = true; break
      case 'code':
        o.font = MONO
        o.size = Math.round(ctx.baseSize * 0.9)
        o.shading = { type: ShadingType.CLEAR, fill: CODE_BG, color: 'auto' }
        break
      case 'link':
        o.style = 'Hyperlink'
        break
      case 'highlight': {
        const fill = toHexColor(a.color) ?? 'FEF08A'
        o.shading = { type: ShadingType.CLEAR, fill, color: 'auto' }
        break
      }
      case 'textStyle': {
        const color = toHexColor(a.color)
        if (color) o.color = color
        const bg = toHexColor(a.backgroundColor)
        if (bg) o.shading = { type: ShadingType.CLEAR, fill: bg, color: 'auto' }
        const font = firstFontFamily(a.fontFamily)
        if (font) o.font = font
        const size = toHalfPoints(a.fontSize, ctx.baseSize / 2)
        if (size) o.size = size
        break
      }
    }
  }
  return o
}
