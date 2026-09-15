import { TableCell, TableHeader } from '@tiptap/extension-table'

const backgroundColor = {
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute('data-background') || el.style.backgroundColor || null,
  renderHTML: (attrs: Record<string, any>) =>
    attrs.backgroundColor
      ? { 'data-background': attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` }
      : {},
}

/** Table cells with a `backgroundColor` attribute (exported to Word as cell shading). */
export const ColoredTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor }
  },
})

export const ColoredTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor }
  },
})
