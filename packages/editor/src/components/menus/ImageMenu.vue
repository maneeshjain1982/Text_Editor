<script setup lang="ts">
import { computed, ref } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import {
  AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, ImageUpscale, Pencil,
  Replace, TextWrap, Trash2,
} from 'lucide-vue-next'
import { useEditorContext } from '../../context'
import { bubbleOptions } from './options'
import ToolButton from '../ui/ToolButton.vue'
import Popover from '../ui/Popover.vue'
import type { ImageAlign } from '../../extensions/Image'

const props = defineProps<{ editor: Editor; scrollTarget?: HTMLElement }>()
const ctx = useEditorContext()
// Mount inside .re-root so the menu inherits the theme tokens (position is fixed, so no clipping).
const appendTo = () => (props.editor.view.dom.closest('.re-root') as HTMLElement | null) ?? document.body
const { t } = ctx
// Created once: a new object per render would make the menu re-apply its options on every update.
const menuOptions = computed(() => bubbleOptions(props.editor, 're-image-menu', 'top', props.scrollTarget))
const altOpen = ref(false)
const altDraft = ref('')

const attrs = computed(() => props.editor.getAttributes('image'))

const shouldShow = ({ editor }: { editor: Editor }) => {
  const sel = editor.state.selection
  return editor.isEditable && sel instanceof NodeSelection && sel.node.type.name === 'image'
}

/** Resolve the element on every measurement: the menu may first be positioned before the node selection settles. */
function imageRect() {
  return {
    getBoundingClientRect: () => {
      const { view, state } = props.editor
      const dom = view.nodeDOM(state.selection.from) as HTMLElement | null
      const img = dom?.querySelector?.('img') ?? dom
      return img?.getBoundingClientRect?.() ?? new DOMRect()
    },
  }
}

const update = (a: Record<string, unknown>) => props.editor.chain().focus().updateAttributes('image', a).run()
const setAlign = (align: ImageAlign) => update({ align })

const aligns: { value: ImageAlign; icon: any; label: 'imageAlignLeft' | 'imageAlignCenter' | 'imageAlignRight' | 'imageWrapLeft' | 'imageWrapRight' }[] = [
  { value: 'left', icon: AlignHorizontalJustifyStart, label: 'imageAlignLeft' },
  { value: 'center', icon: AlignHorizontalJustifyCenter, label: 'imageAlignCenter' },
  { value: 'right', icon: AlignHorizontalJustifyEnd, label: 'imageAlignRight' },
  { value: 'wrapLeft', icon: TextWrap, label: 'imageWrapLeft' },
  { value: 'wrapRight', icon: TextWrap, label: 'imageWrapRight' },
]

function openAlt(toggle: () => void) {
  altDraft.value = attrs.value.alt ?? ''
  toggle()
}
function saveAlt() {
  update({ alt: altDraft.value })
  altOpen.value = false
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    plugin-key="re-image-menu"
    :should-show="shouldShow"
    :get-referenced-virtual-element="imageRect"
    :append-to="appendTo"
    :options="menuOptions"
  >
    <div class="re-bubble" role="toolbar" :aria-label="t('image')">
      <ToolButton
        v-for="a in aligns"
        :key="a.value"
        :icon="a.icon"
        :label="t(a.label)"
        :active="attrs.align === a.value"
        :class="{ 're-flip': a.value === 'wrapRight' }"
        @click="setAlign(a.value)"
      />
      <div class="re-toolbar-separator" />
      <Popover v-model:open="altOpen" :label="t('altText')">
        <template #trigger="{ toggle }">
          <ToolButton :icon="Pencil" :label="t('altText')" show-label :expanded="altOpen" @click="openAlt(toggle)" />
        </template>
        <form class="re-form re-form-compact" @submit.prevent="saveAlt">
          <label class="re-field">
            <span>{{ t('altText') }}</span>
            <input v-model="altDraft" type="text" :placeholder="t('altTextHint')" autofocus />
          </label>
          <div class="re-form-actions">
            <button type="button" class="re-button" @click="altOpen = false">{{ t('cancel') }}</button>
            <button type="submit" class="re-button re-button-primary">{{ t('apply') }}</button>
          </div>
        </form>
      </Popover>
      <ToolButton :icon="ImageUpscale" :label="t('resetSize')" :disabled="!attrs.width" @click="update({ width: null })" />
      <ToolButton :icon="Replace" :label="t('replaceImage')" @click="ctx.openDialog('image', { replace: true })" />
      <div class="re-toolbar-separator" />
      <ToolButton :icon="Trash2" :label="t('deleteImage')" class="re-btn-danger" @click="editor.chain().focus().deleteSelection().run()" />
    </div>
  </BubbleMenu>
</template>
