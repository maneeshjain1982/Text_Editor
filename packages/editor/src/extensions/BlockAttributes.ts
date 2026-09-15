import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockAttributes: {
      /** Increase indent; inside lists this nests the item instead. */
      indent: () => ReturnType
      outdent: () => ReturnType
      /** Paragraph line spacing multiplier, e.g. '1.15'. `null` resets. */
      setBlockLineHeight: (lineHeight: string | null) => ReturnType
    }
  }
}

export const INDENT_STEP_PX = 40
export const MAX_INDENT = 8

const BLOCK_TYPES = ['paragraph', 'heading']

/**
 * Paragraph-level `indent` and `lineHeight` attributes. Kept on the block (not
 * inline spans) so they map 1:1 to Word paragraph properties on export.
 */
export const BlockAttributes = Extension.create({
  name: 'blockAttributes',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const px = parseFloat(el.style.marginLeft || '0')
              const level = Number(el.getAttribute('data-indent')) || Math.round(px / INDENT_STEP_PX)
              return Math.min(MAX_INDENT, Math.max(0, level))
            },
            renderHTML: (attrs) =>
              attrs.indent
                ? { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * INDENT_STEP_PX}px` }
                : {},
          },
          lineHeight: {
            default: null,
            parseHTML: (el) => {
              const value = el.style.lineHeight
              return value && /^[\d.]+$/.test(value) ? value : null
            },
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    const shift =
      (delta: number) =>
      () =>
      ({ tr, state, dispatch, editor, commands }: any) => {
        if (editor.isActive('listItem') || editor.isActive('taskItem')) {
          const type = editor.isActive('taskItem') ? 'taskItem' : 'listItem'
          // Use the chained `commands` so this runs in the same transaction.
          return delta > 0 ? commands.sinkListItem(type) : commands.liftListItem(type)
        }
        let changed = false
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number) => {
          if (!BLOCK_TYPES.includes(node.type.name)) return
          const indent = Math.min(MAX_INDENT, Math.max(0, (node.attrs.indent || 0) + delta))
          if (indent !== node.attrs.indent) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent })
            changed = true
          }
        })
        if (changed && dispatch) dispatch(tr)
        return changed
      }

    return {
      indent: shift(1),
      outdent: shift(-1),
      setBlockLineHeight:
        (lineHeight) =>
        ({ commands }) =>
          BLOCK_TYPES.map((type) => commands.updateAttributes(type, { lineHeight })).some(Boolean),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-]': () => this.editor.commands.indent(),
      'Mod-[': () => this.editor.commands.outdent(),
    }
  },
})
