export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp']
export const DEFAULT_MAX_IMAGE_SIZE = 5 * 1024 * 1024

export type ImageValidation = { ok: true } | { ok: false; reason: 'image-type' | 'image-size' }

export function validateImage(file: File, maxSize = DEFAULT_MAX_IMAGE_SIZE): ImageValidation {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return { ok: false, reason: 'image-type' }
  if (file.size > maxSize) return { ok: false, reason: 'image-size' }
  return { ok: true }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${+(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export interface ImageSize {
  width: number
  height: number
}

/**
 * Read pixel dimensions straight from PNG / JPEG / GIF / BMP headers.
 * Works without a DOM (used by the DOCX exporter and tests).
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const len = bytes.length
  // PNG
  if (len > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  // GIF
  if (len > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  // BMP
  if (len > 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) }
  }
  // JPEG: walk segments until a SOFn marker
  if (len > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < len) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = bytes[offset + 1]
      const size = view.getUint16(offset + 2)
      const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
      if (isSOF) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
      offset += 2 + size
    }
  }
  return null
}

export type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp'

export function detectImageType(bytes: Uint8Array): DocxImageType | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif'
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp'
  return null
}

export async function fetchImageBytes(src: string): Promise<Uint8Array> {
  if (src.startsWith('data:')) {
    const [, meta, data] = src.match(/^data:([^,]*),(.*)$/s) ?? []
    if (meta === undefined) throw new Error('Invalid data URL')
    if (meta.endsWith(';base64')) {
      const binary = atob(data)
      const out = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
      return out
    }
    return new TextEncoder().encode(decodeURIComponent(data))
  }
  const res = await fetch(src)
  if (!res.ok) throw new Error(`Failed to load image ${src}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Rasterise formats Word can't embed (WebP, SVG) to PNG using a canvas. Browser only. */
export async function rasterizeToPng(bytes: Uint8Array, mime = ''): Promise<{ bytes: Uint8Array; size: ImageSize } | null> {
  if (typeof document === 'undefined') return null
  const isSvg = mime.includes('svg') || new TextDecoder().decode(bytes.slice(0, 256)).includes('<svg')
  const blob = new Blob([bytes as BlobPart], { type: isSvg ? 'image/svg+xml' : mime || 'image/webp' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const width = img.naturalWidth || 300
    const height = img.naturalHeight || 150
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!png) return null
    return { bytes: new Uint8Array(await png.arrayBuffer()), size: { width, height } }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
