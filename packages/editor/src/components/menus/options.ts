import type { Editor } from '@tiptap/core'

type Placement = 'top' | 'bottom'

/**
 * Floating-UI options shared by the bubble menus.
 *
 * TipTap measures the menu on show *before* it applies `width: max-content`, so the first
 * position is computed with the wrong width. `onShow` asks the plugin to re-measure on the
 * next frame via its `updatePosition` meta.
 */
export function bubbleOptions(editor: Editor, pluginKey: string, placement: Placement, scrollTarget?: HTMLElement) {
  return {
    placement,
    strategy: 'fixed' as const,
    offset: 8,
    flip: { padding: 8 },
    shift: { padding: 8 },
    scrollTarget,
    onShow: () => {
      requestAnimationFrame(() => {
        if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(pluginKey, 'updatePosition'))
      })
    },
  }
}
