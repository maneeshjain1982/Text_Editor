/** Unit conversions shared by the DOCX exporter and the editor's page layout. */

export const TWIPS_PER_PX = 15 // 1px = 1/96in, 1in = 1440 twips
export const PAGE_MARGIN_TWIPS = 1440 // 1in, same as --re-page-padding

export const PAGE_SIZES = {
  A4: { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
} as const

export const contentWidthTwips = (size: keyof typeof PAGE_SIZES) => PAGE_SIZES[size].width - PAGE_MARGIN_TWIPS * 2
export const contentWidthPx = (size: keyof typeof PAGE_SIZES) => Math.floor(contentWidthTwips(size) / TWIPS_PER_PX)

const NAMED_COLORS: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
  orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080', pink: 'FFC0CB', brown: 'A52A2A',
}

/** CSS colour → 6-digit hex without '#'. Returns undefined for transparent / unknown values. */
export function toHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial') return undefined
  if (NAMED_COLORS[v]) return NAMED_COLORS[v]
  let m = v.match(/^#([0-9a-f]{3})$/)
  if (m) return m[1].split('').map((c) => c + c).join('').toUpperCase()
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/)
  if (m) return m[1].toUpperCase()
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return undefined
    return [m[1], m[2], m[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  return undefined
}

/** CSS font-size → Word half-points. */
export function toHalfPoints(value: unknown, basePt = 11): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const v = String(value).trim()
  const n = parseFloat(v)
  if (!Number.isFinite(n) || n <= 0) return undefined
  let pt: number
  if (v.endsWith('pt')) pt = n
  else if (v.endsWith('em') || v.endsWith('rem')) pt = n * basePt
  else if (v.endsWith('%')) pt = (n / 100) * basePt
  else pt = n * 0.75 // px or unitless
  return Math.round(pt * 2)
}

/** First family of a CSS font-family list, unquoted. */
export function firstFontFamily(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.split(',')[0].trim().replace(/^['"]|['"]$/g, '') || undefined
}
