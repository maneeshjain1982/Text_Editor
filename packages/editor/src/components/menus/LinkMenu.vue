<script setup lang="ts">
import { computed } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/core'
import { Copy, ExternalLink, Pencil, Unlink } from 'lucide-vue-next'
import { useEditorContext } from '../../context'
import { bubbleOptions } from './options'
import ToolButton from '../ui/ToolButton.vue'

const props = defineProps<{ editor: Editor; scrollTarget?: HTMLElement }>()
const ctx = useEditorContext()
// Mount inside .re-root so the menu inherits the theme tokens (position is fixed, so no clipping).
const appendTo = () => (props.editor.view.dom.closest('.re-root') as HTMLElement | null) ?? document.body
const { t } = ctx
// Created once: a new object per render would make the menu re-apply its options on every update.
const menuOptions = computed(() => bubbleOptions(props.editor, 're-link-menu', 'bottom', props.scrollTarget))

const href = computed(() => (props.editor.getAttributes('link').href as string | undefined) ?? '')
const shouldShow = ({ editor }: { editor: Editor }) => editor.isActive('link') && editor.state.selection.empty

function openHref() {
  window.open(href.value, '_blank', 'noopener,noreferrer')
}

function copy() {
  navigator.clipboard?.writeText(href.value).catch(() => ctx.reportError({ type: 'clipboard', message: t('errorClipboard') }))
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    plugin-key="re-link-menu"
    :should-show="shouldShow"
    :append-to="appendTo"
    :options="menuOptions"
  >
    <div class="re-bubble re-link-bubble" role="toolbar" :aria-label="t('link')">
      <a class="re-link-preview" :href="href" target="_blank" rel="noopener noreferrer" :title="href">{{ href }}</a>
      <ToolButton :icon="ExternalLink" :label="t('openLink')" @click="openHref" />
      <ToolButton :icon="Copy" :label="t('copyLink')" @click="copy" />
      <template v-if="editor.isEditable">
        <div class="re-toolbar-separator" />
        <ToolButton :icon="Pencil" :label="t('edit')" @click="ctx.openDialog('link')" />
        <ToolButton :icon="Unlink" :label="t('remove')" @click="editor.chain().focus().extendMarkRange('link').unsetLink().run()" />
      </template>
    </div>
  </BubbleMenu>
</template>
