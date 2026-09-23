import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export interface AutoPaginationOptions {
  /** Off by default: only the page ("document") layout has pages to break. */
  enabled: boolean
  /** Label shown in the gap between pages; `{page}` becomes the number of the page below it. */
  label: string
}

interface Spacer {
  /** Document position of the block that is pushed onto the next page. */
  pos: number
  /** Height of the gap filling the rest of the page, in pixels. */
  height: number
  /** Number of the page that starts after the gap. */
  page: number
}

export const autoPaginationKey = new PluginKey<DecorationSet>('autoPagination')

const SET_SPACERS = 'setPageSpacers'
/** Smaller gaps are measurement noise (fractional pixels, zoom), not a real page break. */
const MIN_GAP = 8

const px = (value: string) => Number.parseFloat(value) || 0

/**
 * Usable height of one page in pixels: the paper minus its top and bottom margins.
 *
 * `--re-page-height` is a physical length (297mm, 11in), and a custom property's computed
 * value keeps its unit, so the browser converts it for us through a probe element.
 */
function pageHeight(content: HTMLElement): number {
  const surface = content.closest('.re-surface') as HTMLElement | null
  if (!surface) return 0
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:var(--re-page-height)'
  surface.appendChild(probe)
  const paper = probe.getBoundingClientRect().height
  probe.remove()

  const style = getComputedStyle(surface)
  const usable = paper - px(style.paddingTop) - px(style.paddingBottom)
  // On a narrow screen the page style doesn't apply; then there is nothing to paginate.
  return usable > 200 ? usable : 0
}

/**
 * Walk the top-level blocks and decide where pages end.
 *
 * Heights are measured with the previous spacers still in the DOM, so their heights are
 * subtracted as we go (`rendered`) to recover each block's natural position. That makes a
 * single measuring pass enough instead of converging over several frames.
 */
function measure(view: EditorView, height: number): { spacers: Spacer[]; pages: number } {
  const content = view.dom as HTMLElement
  const contentTop = content.getBoundingClientRect().top
  const blocks = Array.from(content.children) as HTMLElement[]
  const spacers: Spacer[] = []

  // Map each rendered block back to its document position.
  const positions: number[] = []
  view.state.doc.forEach((_node, offset) => positions.push(offset))
  const laidOut = blocks.filter((el) => el.dataset.rePageSpacer === undefined)
  if (laidOut.length !== positions.length) return { spacers: [], pages: 1 }

  let rendered = 0 // spacer height already in the DOM above this block
  let shift = 0 // spacer height we are about to render above this block
  let boundary = height // bottom of the current page, in natural coordinates
  let page = 1
  let index = 0

  for (const el of blocks) {
    if (el.dataset.rePageSpacer !== undefined) {
      rendered += el.getBoundingClientRect().height
      continue
    }

    const rect = el.getBoundingClientRect()
    const top = rect.top - contentTop - rendered + shift
    const blockHeight = rect.height
    const pos = positions[index++]

    if (el.dataset.type === 'page-break') {
      // A manual break always starts a new page; the gap fills the rest of this one.
      const gap = Math.max(0, boundary - top)
      if (gap > MIN_GAP) shift += gap
      boundary = top + gap + height
      page++
      continue
    }

    if (top + blockHeight <= boundary) continue

    if (blockHeight > height) {
      // Taller than a page (a long table, a tall image): let it run on and pick the
      // count up below it. Word would split the block itself.
      while (boundary < top + blockHeight) {
        boundary += height
        page++
      }
      continue
    }

    page++
    const gap = boundary - top
    if (gap > MIN_GAP) {
      spacers.push({ pos, height: gap, page })
      shift += gap
      boundary += gap
    }
    boundary += height
  }

  return { spacers, pages: page }
}

const sameSpacers = (a: Spacer[], b: Spacer[]) =>
  a.length === b.length && a.every((s, i) => s.pos === b[i].pos && s.page === b[i].page && Math.abs(s.height - b[i].height) < 1)

function spacerElement(spacer: Spacer, label: string): HTMLElement {
  const el = document.createElement('div')
  el.dataset.rePageSpacer = ''
  el.className = 're-page-spacer'
  el.style.height = `${spacer.height}px`
  el.contentEditable = 'false'
  el.setAttribute('aria-hidden', 'true')
  el.dataset.label = label.replace('{page}', String(spacer.page))
  return el
}

/**
 * Shows where pages end while you type, like Word's page view: a block that would cross the
 * bottom of a page is pushed onto the next one.
 *
 * The gaps are decorations, so they are never part of the document — exports, `v-model` and
 * the undo history don't see them, and Word repaginates the file itself. Manual page breaks
 * (the `pageBreak` node) still control where a page is forced to end.
 */
export const AutoPagination = Extension.create<AutoPaginationOptions>({
  name: 'autoPagination',

  addOptions() {
    return { enabled: false, label: 'Page {page}' }
  },

  addStorage() {
    return { pages: 1 }
  },

  addProseMirrorPlugins() {
    if (!this.options.enabled) return []
    const label = this.options.label
    const storage = this.storage as { pages: number }

    return [
      new Plugin<DecorationSet>({
        key: autoPaginationKey,

        state: {
          init: () => DecorationSet.empty,
          apply(tr, value) {
            const spacers = tr.getMeta(SET_SPACERS) as Spacer[] | undefined
            if (spacers) {
              return DecorationSet.create(
                tr.doc,
                spacers.map((spacer) =>
                  Decoration.widget(spacer.pos, () => spacerElement(spacer, label), {
                    side: -1,
                    key: `page-${spacer.page}-${Math.round(spacer.height)}`,
                    ignoreSelection: true,
                  }),
                ),
              )
            }
            return tr.docChanged ? value.map(tr.mapping, tr.doc) : value
          },
        },

        props: {
          decorations: (state) => autoPaginationKey.getState(state),
        },

        view(view) {
          let frame = 0
          let current: Spacer[] = []

          const update = () => {
            frame = 0
            if (!view.dom.isConnected) return
            const height = pageHeight(view.dom as HTMLElement)
            const { spacers, pages } = height ? measure(view, height) : { spacers: [], pages: 1 }
            storage.pages = pages
            if (sameSpacers(current, spacers)) return
            current = spacers
            view.dispatch(view.state.tr.setMeta(SET_SPACERS, spacers).setMeta('addToHistory', false))
          }

          const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update)
          }

          // Re-measure on edits, and when the page itself changes size: window width,
          // a font finishing loading, an image arriving.
          const observer = new ResizeObserver(schedule)
          observer.observe(view.dom)
          const surface = (view.dom as HTMLElement).closest('.re-surface')
          if (surface) observer.observe(surface)
          schedule()

          return {
            update: schedule,
            destroy() {
              if (frame) cancelAnimationFrame(frame)
              observer.disconnect()
            },
          }
        },
      }),
    ]
  },
})
