<script setup lang="ts">
import { computed, ref } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useEditorContext } from '../context'

const props = defineProps(nodeViewProps)
const ctx = useEditorContext()
const t = ctx.t

const imgRef = ref<HTMLImageElement>()
const resizing = ref(false)
const previewWidth = ref<number | null>(null)

const attrs = computed(() => props.node.attrs)
const editable = computed(() => props.editor.isEditable)
const width = computed(() => previewWidth.value ?? attrs.value.width)
const uploading = computed(() => !!attrs.value.uploadId)

function startResize(event: PointerEvent, direction: 1 | -1) {
  const img = imgRef.value
  if (!img) return
  event.preventDefault()
  event.stopPropagation()
  const startX = event.clientX
  const startWidth = img.getBoundingClientRect().width
  // Never wider than the editable area.
  const maxWidth = (props.editor.view.dom as HTMLElement).clientWidth || Infinity
  // Centered images grow on both sides, so pointer movement counts double.
  const factor = attrs.value.align === 'center' ? 2 : 1
  resizing.value = true

  const onMove = (e: PointerEvent) => {
    const next = startWidth + (e.clientX - startX) * direction * factor
    previewWidth.value = Math.round(Math.min(maxWidth, Math.max(40, next)))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    resizing.value = false
    if (previewWidth.value) props.updateAttributes({ width: previewWidth.value })
    previewWidth.value = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onCaption(event: Event) {
  props.updateAttributes({ caption: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <NodeViewWrapper
    as="figure"
    class="re-image"
    :class="[`re-image-${attrs.align}`, { 're-image-selected': selected && editable, 're-image-resizing': resizing, 're-image-uploading': uploading }]"
    :style="{ width: width ? `${width}px` : undefined }"
    data-type="image"
    :data-align="attrs.align"
  >
    <div class="re-image-frame" data-drag-handle>
      <img ref="imgRef" :src="attrs.src" :alt="attrs.alt" :title="attrs.title || undefined" draggable="false" />
      <div v-if="uploading" class="re-image-progress">{{ t('uploading') }}</div>
      <template v-if="selected && editable && !uploading">
        <span class="re-handle re-handle-w" @pointerdown="startResize($event, -1)" />
        <span class="re-handle re-handle-e" @pointerdown="startResize($event, 1)" />
        <span class="re-handle re-handle-sw" @pointerdown="startResize($event, -1)" />
        <span class="re-handle re-handle-se" @pointerdown="startResize($event, 1)" />
        <span v-if="width" class="re-image-size">{{ width }}px</span>
      </template>
    </div>
    <input
      v-if="editable && (selected || attrs.caption)"
      class="re-image-caption-input"
      :value="attrs.caption"
      :placeholder="t('addCaption')"
      :aria-label="t('caption')"
      @input="onCaption"
    />
    <figcaption v-else-if="attrs.caption">{{ attrs.caption }}</figcaption>
  </NodeViewWrapper>
</template>
