<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Baseline, Download, Highlighter, History, Image as ImageIcon, Link, MessagesSquare, Omega, PenLine, Sparkles,
  Table as TableIcon, TextAlignCenter, TextAlignEnd, TextAlignJustify, TextAlignStart, UnfoldVertical,
} from 'lucide-vue-next'
import { useEditorContext } from '../context'
import type { ToolbarItem } from '../types'
import { BUTTON_ITEMS } from './items'
import ToolButton from '../components/ui/ToolButton.vue'
import Popover from '../components/ui/Popover.vue'
import MenuList from '../components/ui/MenuList.vue'
import ColorPalette from '../components/ui/ColorPalette.vue'
import TableGridPicker from '../components/ui/TableGridPicker.vue'
import type { MenuOption } from '../components/ui/menu'

const props = defineProps<{ item: ToolbarItem }>()
const ctx = useEditorContext()
const { t } = ctx
const editor = computed(() => ctx.editor.value)
const open = ref(false)

const button = computed(() => BUTTON_ITEMS[props.item])

// ---- text style -----------------------------------------------------------
const headingOptions = computed<MenuOption<number>[]>(() => {
  const e = editor.value
  return [0, 1, 2, 3, 4, 5, 6].map((level) => ({
    value: level,
    label: level ? t('headingLevel', { level }) : t('paragraph'),
    active: level ? !!e?.isActive('heading', { level }) : !!e?.isActive('paragraph'),
    style: { fontSize: level ? `${[0, 1.5, 1.3, 1.15, 1.05, 1, 0.9][level]}em` : '1em', fontWeight: level ? '600' : '400' },
  }))
})
const headingLabel = computed(() => headingOptions.value.find((o) => o.active)?.label ?? t('paragraph'))
function setHeading(level: number) {
  const chain = editor.value!.chain().focus()
  ;(level ? chain.setHeading({ level: level as 1 }) : chain.setParagraph()).run()
  open.value = false
}

// ---- font family / size ----------------------------------------------------
const currentFont = computed(() => (editor.value?.getAttributes('textStyle').fontFamily as string | undefined) ?? '')
const fontOptions = computed<MenuOption<string>[]>(() => [
  { value: '', label: t('defaultFont'), active: !currentFont.value },
  ...ctx.fonts.value.map((font) => ({
    value: font,
    label: font,
    active: currentFont.value.replace(/["']/g, '').startsWith(font),
    style: { fontFamily: font },
  })),
])
const fontLabel = computed(() => currentFont.value.split(',')[0].replace(/["']/g, '') || t('defaultFont'))
function setFont(font: string) {
  const chain = editor.value!.chain().focus()
  ;(font ? chain.setFontFamily(/\s/.test(font) ? `"${font}"` : font) : chain.unsetFontFamily()).run()
  open.value = false
}

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]
const currentSize = computed(() => (editor.value?.getAttributes('textStyle').fontSize as string | undefined) ?? '')
const sizeOptions = computed<MenuOption<string>[]>(() => [
  { value: '', label: t('defaultSize'), active: !currentSize.value },
  ...SIZES.map((s) => ({ value: `${s}pt`, label: String(s), active: currentSize.value === `${s}pt` })),
])
const sizeLabel = computed(() => currentSize.value.replace('pt', '') || '11')
function setSize(size: string) {
  const chain = editor.value!.chain().focus()
  ;(size ? chain.setFontSize(size) : chain.unsetFontSize()).run()
  open.value = false
}

// ---- colors -----------------------------------------------------------------
const textColor = computed(() => editor.value?.getAttributes('textStyle').color as string | undefined)
const highlightColor = computed(() => editor.value?.getAttributes('highlight').color as string | undefined)
function setColor(color: string | null) {
  const chain = editor.value!.chain().focus()
  ;(color ? chain.setColor(color) : chain.unsetColor()).run()
  open.value = false
}
function setHighlight(color: string | null) {
  const chain = editor.value!.chain().focus()
  ;(color ? chain.setHighlight({ color }) : chain.unsetHighlight()).run()
  open.value = false
}

// ---- alignment / spacing -----------------------------------------------------
const ALIGNS = [
  { value: 'left', label: 'alignLeft', icon: TextAlignStart, shortcut: 'Mod-Shift-L' },
  { value: 'center', label: 'alignCenter', icon: TextAlignCenter, shortcut: 'Mod-Shift-E' },
  { value: 'right', label: 'alignRight', icon: TextAlignEnd, shortcut: 'Mod-Shift-R' },
  { value: 'justify', label: 'alignJustify', icon: TextAlignJustify, shortcut: 'Mod-Shift-J' },
] as const
const currentAlign = computed(() => ALIGNS.find((a) => editor.value?.isActive({ textAlign: a.value })) ?? ALIGNS[0])
const alignOptions = computed<MenuOption<string>[]>(() =>
  ALIGNS.map((a) => ({ value: a.value, label: t(a.label), icon: a.icon, active: currentAlign.value.value === a.value })),
)
function setAlign(value: string) {
  editor.value!.chain().focus().setTextAlign(value).run()
  open.value = false
}

const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3']
const currentLineHeight = computed(
  () => (editor.value?.getAttributes('paragraph').lineHeight ?? editor.value?.getAttributes('heading').lineHeight ?? null) as string | null,
)
const lineHeightOptions = computed<MenuOption<string | null>[]>(() => [
  { value: null, label: t('defaultSize'), active: !currentLineHeight.value },
  ...LINE_HEIGHTS.map((v) => ({ value: v, label: v, active: currentLineHeight.value === v })),
])
function setLineHeight(value: string | null) {
  editor.value!.chain().focus().setBlockLineHeight(value).run()
  open.value = false
}

// ---- table -------------------------------------------------------------------
function insertTable({ rows, cols }: { rows: number; cols: number }) {
  const e = editor.value!
  const { selection } = e.state
  const chain = e.chain().focus()
  // Insert after selected text instead of replacing it.
  if (!selection.empty && e.isActive('table') === false) chain.setTextSelection(selection.to)
  chain.insertTable({ rows, cols, withHeaderRow: true }).run()
  open.value = false
}

// ---- AI ----------------------------------------------------------------------
// "Continue writing" and "Edit whole document" are deliberately not in the menu; hosts
// that want them call api.aiContinue() / api.aiEditDocument() from their own buttons.
type AiMenuAction = 'ask' | 'generate' | 'chat' | 'versions'
const aiOptions = computed<MenuOption<AiMenuAction>[]>(() => {
  void editor.value?.state
  const hasSelection = !!editor.value && !editor.value.state.selection.empty
  return [
    { value: 'ask', label: t('aiAsk'), icon: Sparkles, disabled: !hasSelection, hint: hasSelection ? undefined : t('aiSelectionRequired') },
    { value: 'generate', label: t('aiGenerate'), icon: PenLine },
    ...(ctx.chat.value ? [{ value: 'chat' as const, label: t('chatTitle'), icon: MessagesSquare, hint: 'Ctrl+Alt+J' }] : []),
    { value: 'versions', label: t('aiVersions'), icon: History, separatorBefore: true },
  ]
})
function onAiAction(action: AiMenuAction) {
  open.value = false
  const ai = ctx.ai.value
  if (!ai) return
  if (action === 'versions') ctx.openDialog('versions')
  else if (action === 'chat') ctx.chat.value?.setOpen(true)
  else if (action === 'ask') ai.open('edit-selection')
  else ai.open('generate')
}

// ---- file --------------------------------------------------------------------
// The toolbar only offers the Word download. Hosts that want New / Open / other
// formats call api.newDocument(), api.importFile() and api.download() themselves.
</script>

<template>
  <ToolButton
    v-if="button && editor"
    :icon="button.icon"
    :label="t(button.label)"
    :shortcut="button.shortcut"
    :active="button.isActive ? button.isActive(editor, ctx) : undefined"
    :disabled="button.isDisabled?.(editor)"
    @click="button.run(editor, ctx)"
  />

  <Popover v-else-if="item === 'heading'" v-model:open="open" :label="t('heading')">
    <template #trigger="{ toggle }">
      <ToolButton class="re-select re-select-heading" :label="t('heading')" has-menu :expanded="open" @click="toggle">
        <span class="re-select-value">{{ headingLabel }}</span>
      </ToolButton>
    </template>
    <MenuList :options="headingOptions" :label="t('heading')" @select="setHeading" />
  </Popover>

  <Popover v-else-if="item === 'fontFamily'" v-model:open="open" :label="t('fontFamily')">
    <template #trigger="{ toggle }">
      <ToolButton class="re-select re-select-font" :label="t('fontFamily')" has-menu :expanded="open" @click="toggle">
        <span class="re-select-value">{{ fontLabel }}</span>
      </ToolButton>
    </template>
    <MenuList :options="fontOptions" :label="t('fontFamily')" @select="setFont" />
  </Popover>

  <Popover v-else-if="item === 'fontSize'" v-model:open="open" :label="t('fontSize')">
    <template #trigger="{ toggle }">
      <ToolButton class="re-select re-select-size" :label="t('fontSize')" has-menu :expanded="open" @click="toggle">
        <span class="re-select-value">{{ sizeLabel }}</span>
      </ToolButton>
    </template>
    <MenuList :options="sizeOptions" :label="t('fontSize')" @select="setSize" />
  </Popover>

  <Popover v-else-if="item === 'color'" v-model:open="open" :label="t('color')">
    <template #trigger="{ toggle }">
      <ToolButton :icon="Baseline" :label="t('color')" has-menu :expanded="open" class="re-color-btn" @click="toggle">
        <span class="re-color-bar" :style="{ background: textColor || 'currentColor' }" />
      </ToolButton>
    </template>
    <ColorPalette :current="textColor" @select="setColor" />
  </Popover>

  <Popover v-else-if="item === 'highlight'" v-model:open="open" :label="t('highlight')">
    <template #trigger="{ toggle }">
      <ToolButton :icon="Highlighter" :label="t('highlight')" has-menu :expanded="open" class="re-color-btn" @click="toggle">
        <span class="re-color-bar" :style="{ background: highlightColor || '#fef08a' }" />
      </ToolButton>
    </template>
    <ColorPalette :current="highlightColor" @select="setHighlight" />
  </Popover>

  <Popover v-else-if="item === 'align'" v-model:open="open" :label="t('align')">
    <template #trigger="{ toggle }">
      <ToolButton :icon="currentAlign.icon" :label="t('align')" has-menu :expanded="open" @click="toggle" />
    </template>
    <MenuList :options="alignOptions" :label="t('align')" @select="setAlign" />
  </Popover>

  <Popover v-else-if="item === 'lineHeight'" v-model:open="open" :label="t('lineHeight')">
    <template #trigger="{ toggle }">
      <ToolButton :icon="UnfoldVertical" :label="t('lineHeight')" has-menu :expanded="open" @click="toggle" />
    </template>
    <MenuList :options="lineHeightOptions" :label="t('lineHeight')" @select="setLineHeight" />
  </Popover>

  <ToolButton
    v-else-if="item === 'link'"
    :icon="Link"
    :label="t('link')"
    shortcut="Mod-K"
    :active="editor?.isActive('link')"
    @click="ctx.openDialog('link')"
  />

  <ToolButton v-else-if="item === 'image'" :icon="ImageIcon" :label="t('image')" @click="ctx.openDialog('image')" />

  <Popover v-else-if="item === 'table'" v-model:open="open" :label="t('insertTable')">
    <template #trigger="{ toggle }">
      <ToolButton :icon="TableIcon" :label="t('table')" has-menu :expanded="open" :active="editor?.isActive('table')" @click="toggle" />
    </template>
    <TableGridPicker @select="insertTable" />
  </Popover>

  <Popover v-else-if="item === 'ai'" v-model:open="open" :label="t('ai')">
    <template #trigger="{ toggle }">
      <ToolButton :icon="Sparkles" :label="t('ai')" show-label has-menu :expanded="open" class="re-ai-trigger" @click="toggle" />
    </template>
    <MenuList :options="aiOptions" :label="t('ai')" @select="onAiAction" />
  </Popover>

  <ToolButton v-else-if="item === 'specialChars'" :icon="Omega" :label="t('specialChars')" @click="ctx.openDialog('specialChars')" />

  <ToolButton
    v-else-if="item === 'file'"
    :icon="Download"
    :label="t('downloadDocx')"
    @click="ctx.download('docx')"
  />
</template>
