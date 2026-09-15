<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ImagePlus, Link } from 'lucide-vue-next'
import { NodeSelection } from '@tiptap/pm/state'
import { useEditorContext } from '../../context'
import { ACCEPTED_IMAGE_TYPES, formatBytes, validateImage } from '../../services/image'
import Modal from '../ui/Modal.vue'

const props = defineProps<{ replace?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const ctx = useEditorContext()
const { t } = ctx

const tab = ref<'upload' | 'url'>('upload')
const url = ref('')
const alt = ref('')
const caption = ref('')
const dragging = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement>()
const replacePos = ref<number | null>(null)

const maxSize = computed(() => formatBytes(ctx.maxImageSize.value))

watch(open, (value) => {
  if (!value) return
  const editor = ctx.editor.value
  const sel = editor?.state.selection
  const current = props.replace && sel instanceof NodeSelection && sel.node.type.name === 'image' ? sel.node : null
  replacePos.value = current ? sel!.from : null
  url.value = ''
  alt.value = current?.attrs.alt ?? ''
  caption.value = current?.attrs.caption ?? ''
  error.value = ''
  tab.value = 'upload'
})

function insertFile(file: File | undefined) {
  const editor = ctx.editor.value
  if (!file || !editor) return
  const check = validateImage(file, ctx.maxImageSize.value)
  if (!check.ok) {
    error.value = check.reason === 'image-type' ? t('errorImageType') : t('errorImageSize', { size: maxSize.value })
    return
  }
  if (replacePos.value !== null) editor.chain().focus().setNodeSelection(replacePos.value).deleteSelection().run()
  editor.chain().focus().insertImageFiles([file]).run()
  open.value = false
}

function onDrop(e: DragEvent) {
  dragging.value = false
  insertFile(e.dataTransfer?.files?.[0])
}

function insertUrl() {
  const editor = ctx.editor.value
  const src = url.value.trim()
  if (!editor || !src) return
  const attrs = { src, alt: alt.value, caption: caption.value }
  if (replacePos.value !== null) {
    editor.chain().focus().setNodeSelection(replacePos.value).updateAttributes('image', attrs).run()
  } else {
    editor.chain().focus().setImage(attrs).run()
  }
  open.value = false
}
</script>

<template>
  <Modal v-model:open="open" :title="replace ? t('replaceImage') : t('insertImage')" :width="480">
    <div class="re-tabs" role="tablist">
      <button type="button" role="tab" class="re-tab" :aria-selected="tab === 'upload'" @click="tab = 'upload'">
        <ImagePlus :size="16" aria-hidden="true" /> {{ t('upload') }}
      </button>
      <button type="button" role="tab" class="re-tab" :aria-selected="tab === 'url'" @click="tab = 'url'">
        <Link :size="16" aria-hidden="true" /> {{ t('byUrl') }}
      </button>
    </div>

    <div v-if="tab === 'upload'" role="tabpanel">
      <button
        type="button"
        class="re-dropzone"
        :class="{ 're-dropzone-active': dragging }"
        @click="fileInput?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <ImagePlus :size="32" :stroke-width="1.5" aria-hidden="true" />
        <strong>{{ t('dropImage') }}</strong>
        <span>{{ t('imageTypes', { size: maxSize }) }}</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        class="re-visually-hidden"
        :accept="ACCEPTED_IMAGE_TYPES.join(',')"
        @change="insertFile(($event.target as HTMLInputElement).files?.[0])"
      />
    </div>

    <form v-else id="re-image-form" role="tabpanel" class="re-form" @submit.prevent="insertUrl">
      <label class="re-field">
        <span>{{ t('imageUrl') }}</span>
        <input v-model="url" type="url" placeholder="https://…/image.png" autofocus required />
      </label>
      <label class="re-field">
        <span>{{ t('altText') }}</span>
        <input v-model="alt" type="text" :placeholder="t('altTextHint')" />
      </label>
      <label class="re-field">
        <span>{{ t('caption') }}</span>
        <input v-model="caption" type="text" />
      </label>
      <div v-if="url" class="re-image-preview"><img :src="url" alt="" /></div>
    </form>

    <p v-if="error" class="re-error" role="alert">{{ error }}</p>

    <template v-if="tab === 'url'" #footer>
      <button type="button" class="re-button" @click="open = false">{{ t('cancel') }}</button>
      <button type="submit" form="re-image-form" class="re-button re-button-primary" :disabled="!url.trim()">{{ t('insert') }}</button>
    </template>
  </Modal>
</template>
