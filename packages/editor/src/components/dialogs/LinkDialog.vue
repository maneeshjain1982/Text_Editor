<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEditorContext } from '../../context'
import Modal from '../ui/Modal.vue'

const open = defineModel<boolean>('open', { default: false })
const ctx = useEditorContext()
const { t } = ctx

const url = ref('')
const text = ref('')
const newTab = ref(false)
const hadLink = ref(false)
const hasSelection = ref(false)

watch(open, (value) => {
  const editor = ctx.editor.value
  if (!value || !editor) return
  editor.commands.extendMarkRange('link')
  const attrs = editor.getAttributes('link')
  const { from, to } = editor.state.selection
  hadLink.value = !!attrs.href
  url.value = attrs.href ?? ''
  newTab.value = attrs.target === '_blank'
  text.value = editor.state.doc.textBetween(from, to, ' ')
  hasSelection.value = from !== to
})

const normalized = computed(() => {
  const v = url.value.trim()
  if (!v) return ''
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return v
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`
  return `https://${v}`
})

function apply() {
  const editor = ctx.editor.value
  if (!editor) return
  if (!normalized.value) return remove()
  const attrs = { href: normalized.value, target: newTab.value ? '_blank' : null }
  const label = text.value.trim() || normalized.value
  const chain = editor.chain().focus()
  if (!hasSelection.value || label !== editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')) {
    // Replace/insert the visible text, keeping the link on it.
    chain.insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs }] })
  } else {
    chain.setLink(attrs)
  }
  chain.run()
  open.value = false
}

function remove() {
  ctx.editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  open.value = false
}
</script>

<template>
  <Modal v-model:open="open" :title="t('link')" :width="420">
    <form id="re-link-form" class="re-form" @submit.prevent="apply">
      <label class="re-field">
        <span>{{ t('linkUrl') }}</span>
        <input v-model="url" type="text" inputmode="url" placeholder="https://example.com" autofocus />
      </label>
      <label class="re-field">
        <span>{{ t('linkText') }}</span>
        <input v-model="text" type="text" />
      </label>
      <label class="re-checkbox">
        <input v-model="newTab" type="checkbox" />
        <span>{{ t('openInNewTab') }}</span>
      </label>
    </form>
    <template #footer>
      <button v-if="hadLink" type="button" class="re-button re-button-danger re-footer-start" @click="remove">{{ t('remove') }}</button>
      <button type="button" class="re-button" @click="open = false">{{ t('cancel') }}</button>
      <button type="submit" form="re-link-form" class="re-button re-button-primary" :disabled="!url.trim() && !hadLink">{{ t('apply') }}</button>
    </template>
  </Modal>
</template>
