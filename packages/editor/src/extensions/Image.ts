import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ImageView from '../components/ImageView.vue'
import { DEFAULT_MAX_IMAGE_SIZE, readAsDataURL, validateImage } from '../services/image'
import type { EditorError, UploadImageFn } from '../types'

export type ImageAlign = 'left' | 'center' | 'right' | 'wrapLeft' | 'wrapRight'

export interface ImageOptions {
  uploadImage?: UploadImageFn
  maxImageSize: number
  onError: (error: EditorError) => void
}

export interface InsertImageAttrs {
  src: string
  alt?: string
  title?: string
  caption?: string
  width?: number | null
  align?: ImageAlign
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      setImage: (attrs: InsertImageAttrs) => ReturnType
      /** Validate, (optionally) upload and insert image files at the given position or the selection. */
      insertImageFiles: (files: File[], pos?: number) => ReturnType
    }
  }
}

const ALIGN_STYLES: Record<ImageAlign, string> = {
  left: 'margin: 0.6em auto 0.6em 0;',
  center: 'margin: 0.6em auto;',
  right: 'margin: 0.6em 0 0.6em auto;',
  wrapLeft: 'float: left; margin: 0.2em 1em 0.6em 0;',
  wrapRight: 'float: right; margin: 0.2em 0 0.6em 1em;',
}

let uploadCounter = 0

/**
 * Block image with width, alignment/wrapping, alt text and caption.
 * Serialised as <figure data-type="image"><img/><figcaption/></figure> with
 * inline styles, so exported HTML renders the same outside the editor.
 */
export const Image = Node.create<ImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { uploadImage: undefined, maxImageSize: DEFAULT_MAX_IMAGE_SIZE, onError: () => {} }
  },

  addAttributes() {
    // Not auto-rendered: renderHTML places each attribute on the right element (img vs figure),
    // otherwise `src` (often a large data URL) would be duplicated onto <figure>.
    return {
      src: { default: null, rendered: false },
      alt: { default: '', rendered: false },
      title: { default: null, rendered: false },
      caption: { default: '', rendered: false },
      width: { default: null, rendered: false },
      align: { default: 'center', rendered: false },
      uploadId: { default: null, rendered: false },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="image"]',
        getAttrs: (el) => {
          const img = (el as HTMLElement).querySelector('img')
          if (!img) return false
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') || '',
            title: img.getAttribute('title'),
            width: parseWidth(img) ?? parseWidth(el as HTMLElement),
            align: (el as HTMLElement).getAttribute('data-align') || 'center',
            caption: (el as HTMLElement).querySelector('figcaption')?.textContent || '',
          }
        },
      },
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const img = el as HTMLImageElement
          const float = img.style.float || img.getAttribute('align')
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') || '',
            title: img.getAttribute('title'),
            width: parseWidth(img),
            align: float === 'left' ? 'wrapLeft' : float === 'right' ? 'wrapRight' : 'center',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const { src, alt, title, width, align, caption } = node.attrs
    const figureStyle = `${ALIGN_STYLES[align as ImageAlign] ?? ALIGN_STYLES.center} ${width ? `width: ${width}px;` : ''} max-width: 100%;`
    const img = ['img', { src, alt, title, width: width ?? undefined, style: 'display: block; width: 100%; height: auto;' }]
    const children: any[] = [img]
    if (caption) children.push(['figcaption', { style: 'text-align: center; font-size: 0.9em; color: #6b7280; margin-top: 0.3em;' }, caption])
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { 'data-type': 'image', 'data-align': align, style: figureStyle }),
      ...children,
    ]
  },

  renderText({ node }) {
    return node.attrs.alt ? `[${node.attrs.alt}]` : ''
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageView)
  },

  addCommands() {
    return {
      setImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),

      insertImageFiles:
        (files, pos) =>
        ({ editor }) => {
          const valid = files.filter((file) => {
            const result = validateImage(file, this.options.maxImageSize)
            if (!result.ok) {
              this.options.onError({ type: result.reason, message: file.name })
              return false
            }
            return true
          })
          if (!valid.length) return false
          void insertFiles(editor.view, valid, pos, this.options, this.name)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const imagesFrom = (list?: FileList | null) =>
      Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

    return [
      new Plugin({
        key: new PluginKey('imagePasteDrop'),
        props: {
          handlePaste: (_view, event) => {
            const files = imagesFrom(event.clipboardData?.files)
            // When HTML is also present (e.g. copied from a web page) let the HTML parser handle it.
            if (!files.length || event.clipboardData?.getData('text/html')) return false
            event.preventDefault()
            return editor.commands.insertImageFiles(files)
          },
          handleDrop: (view, event, _slice, moved) => {
            if (moved) return false
            const files = imagesFrom(event.dataTransfer?.files)
            if (!files.length) return false
            event.preventDefault()
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
            return editor.commands.insertImageFiles(files, coords?.pos)
          },
        },
      }),
    ]
  },
})

function parseWidth(el: HTMLElement): number | null {
  const raw = el.getAttribute('width') || el.style.width
  if (!raw || raw.endsWith('%')) return null
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

async function insertFiles(view: EditorView, files: File[], pos: number | undefined, options: ImageOptions, typeName: string) {
  const type = view.state.schema.nodes[typeName]
  for (const file of files) {
    const uploadId = `upload-${++uploadCounter}`
    const preview = await readAsDataURL(file)
    const node = type.create({ src: preview, alt: file.name.replace(/\.[^.]+$/, ''), uploadId: options.uploadImage ? uploadId : null })
    const { tr } = view.state
    const at = pos ?? tr.selection.from
    tr.insert(Math.min(at, tr.doc.content.size), node)
    view.dispatch(tr)

    if (!options.uploadImage) continue
    try {
      const url = await options.uploadImage(file)
      updateByUploadId(view, uploadId, (attrs) => ({ ...attrs, src: url, uploadId: null }))
    } catch (cause) {
      updateByUploadId(view, uploadId, null)
      options.onError({ type: 'image-upload', message: file.name, cause })
    }
  }
}

function updateByUploadId(view: EditorView, uploadId: string, update: ((attrs: any) => any) | null) {
  if (view.isDestroyed) return
  const { tr, doc } = view.state
  doc.descendants((node, pos) => {
    if (node.attrs?.uploadId !== uploadId) return true
    if (update) tr.setNodeMarkup(pos, undefined, update(node.attrs))
    else tr.delete(pos, pos + node.nodeSize)
    return false
  })
  if (tr.docChanged) view.dispatch(tr.setMeta('addToHistory', false))
}
