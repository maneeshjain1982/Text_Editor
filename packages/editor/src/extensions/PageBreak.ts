import { Node, mergeAttributes } from '@tiptap/core'

export interface PageBreakOptions {
  /** Label drawn on the break line in the editor. */
  label: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a page break at the cursor. */
      setPageBreak: () => ReturnType
    }
  }
}

/**
 * A manual page break: where Word and printing start a new page.
 *
 * The editor does not reflow text into fixed-height pages, so this marks where a page
 * *starts*; the page count itself comes from Word or the print dialog.
 */
export const PageBreak = Node.create<PageBreakOptions>({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return { label: 'Page break' }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="page-break"]' },
      { tag: 'hr[data-type="page-break"]' },
      // Word and other editors export an *empty* element carrying a page-break style.
      // Only empty ones match: a paragraph with text plus `page-break-before` keeps its text.
      {
        tag: 'div[style], p[style], span[style], br[style]',
        // Beat the paragraph/div rules, which would otherwise claim these elements first.
        priority: 60,
        getAttrs: (el) => {
          const element = el as HTMLElement
          if (element.textContent?.trim()) return false
          const style = element.style
          const breaks = [style.pageBreakAfter, style.pageBreakBefore, style.breakAfter, style.breakBefore]
          return breaks.includes('always') || breaks.includes('page') ? {} : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'page-break',
        'data-label': this.options.label,
        class: 're-page-break',
        style: 'page-break-after: always; break-after: page;',
        'aria-label': this.options.label,
      }),
    ]
  },

  renderText() {
    return '\n\n'
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.setPageBreak(),
    }
  },
})

/** Markdown marker used by export and import, so page breaks survive a round trip. */
export const PAGE_BREAK_MARKER = '<!-- pagebreak -->'
export const PAGE_BREAK_HTML = '<div data-type="page-break"></div>'
