<script setup lang="ts">
import { computed, ref } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/core'
import {
  BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, PaintBucket, PanelLeft,
  PanelTop, TableCellsMerge, TableCellsSplit, Trash2,
} from 'lucide-vue-next'
import { useEditorContext } from '../../context'
import { bubbleOptions } from './options'
import ToolButton from '../ui/ToolButton.vue'
import Popover from '../ui/Popover.vue'
import MenuList from '../ui/MenuList.vue'
import ColorPalette from '../ui/ColorPalette.vue'
import type { MenuOption } from '../ui/menu'

const props = defineProps<{ editor: Editor; scrollTarget?: HTMLElement }>()
const ctx = useEditorContext()
// Mount inside .re-root so the menu inherits the theme tokens (position is fixed, so no clipping).
const appendTo = () => (props.editor.view.dom.closest('.re-root') as HTMLElement | null) ?? document.body
const { t } = ctx
// Created once: a new object per render would make the menu re-apply its options on every update.
const menuOptions = computed(() => bubbleOptions(props.editor, 're-table-menu', 'top', props.scrollTarget))
const colorOpen = ref(false)
const rowsOpen = ref(false)
const colsOpen = ref(false)

const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => fn(props.editor.chain().focus()).run()

const shouldShow = ({ editor }: { editor: Editor }) =>
  editor.isEditable && editor.isActive('table') && !editor.isActive('image')

/** Anchor the menu to the table's top edge instead of the caret, so it never hides the text being typed. */
function currentTable(): HTMLElement | null {
  const { view, state } = props.editor
  const $pos = state.selection.$anchor
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'table') {
      const dom = view.nodeDOM($pos.before(d)) as HTMLElement | null
      return (dom?.closest?.('.tableWrapper') as HTMLElement | null) ?? dom
    }
  }
  return null
}

// Resolved lazily on every measurement so the menu follows the table as rows/columns change.
const tableRect = () => ({ getBoundingClientRect: () => currentTable()?.getBoundingClientRect() ?? new DOMRect() })

const cellColor = computed(() => props.editor.getAttributes('tableCell').backgroundColor ?? props.editor.getAttributes('tableHeader').backgroundColor)

const rowOptions = computed<MenuOption<string>[]>(() => [
  { value: 'before', label: t('addRowBefore'), icon: BetweenHorizontalStart },
  { value: 'after', label: t('addRowAfter'), icon: BetweenHorizontalEnd },
  { value: 'header', label: t('toggleHeaderRow'), icon: PanelTop, separatorBefore: true },
  { value: 'delete', label: t('deleteRow'), icon: Trash2, danger: true, separatorBefore: true },
])
const colOptions = computed<MenuOption<string>[]>(() => [
  { value: 'before', label: t('addColumnBefore'), icon: BetweenVerticalStart },
  { value: 'after', label: t('addColumnAfter'), icon: BetweenVerticalEnd },
  { value: 'header', label: t('toggleHeaderColumn'), icon: PanelLeft, separatorBefore: true },
  { value: 'delete', label: t('deleteColumn'), icon: Trash2, danger: true, separatorBefore: true },
])

function onRow(action: string) {
  rowsOpen.value = false
  run((c) => (action === 'before' ? c.addRowBefore() : action === 'after' ? c.addRowAfter() : action === 'header' ? c.toggleHeaderRow() : c.deleteRow()))
}
function onCol(action: string) {
  colsOpen.value = false
  run((c) => (action === 'before' ? c.addColumnBefore() : action === 'after' ? c.addColumnAfter() : action === 'header' ? c.toggleHeaderColumn() : c.deleteColumn()))
}
function setCellColor(color: string | null) {
  colorOpen.value = false
  run((c) => c.setCellAttribute('backgroundColor', color))
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    plugin-key="re-table-menu"
    :should-show="shouldShow"
    :get-referenced-virtual-element="tableRect"
    :append-to="appendTo"
    :options="menuOptions"
  >
    <div class="re-bubble" role="toolbar" :aria-label="t('table')">
      <Popover v-model:open="rowsOpen" :label="t('rows')">
        <template #trigger="{ toggle }">
          <ToolButton :icon="BetweenHorizontalEnd" :label="t('rows')" show-label has-menu :expanded="rowsOpen" @click="toggle" />
        </template>
        <MenuList :options="rowOptions" @select="onRow" />
      </Popover>
      <Popover v-model:open="colsOpen" :label="t('columns')">
        <template #trigger="{ toggle }">
          <ToolButton :icon="BetweenVerticalEnd" :label="t('columns')" show-label has-menu :expanded="colsOpen" @click="toggle" />
        </template>
        <MenuList :options="colOptions" @select="onCol" />
      </Popover>
      <div class="re-toolbar-separator" />
      <ToolButton :icon="TableCellsMerge" :label="t('mergeCells')" :disabled="!editor.can().mergeCells()" @click="run((c) => c.mergeCells())" />
      <ToolButton :icon="TableCellsSplit" :label="t('splitCell')" :disabled="!editor.can().splitCell()" @click="run((c) => c.splitCell())" />
      <Popover v-model:open="colorOpen" :label="t('cellBackground')">
        <template #trigger="{ toggle }">
          <ToolButton :icon="PaintBucket" :label="t('cellBackground')" has-menu :expanded="colorOpen" class="re-color-btn" @click="toggle">
            <span class="re-color-bar" :style="{ background: cellColor || 'transparent' }" />
          </ToolButton>
        </template>
        <ColorPalette :current="cellColor" @select="setCellColor" />
      </Popover>
      <div class="re-toolbar-separator" />
      <ToolButton :icon="Trash2" :label="t('deleteTable')" class="re-btn-danger" @click="run((c) => c.deleteTable())" />
    </div>
  </BubbleMenu>
</template>
