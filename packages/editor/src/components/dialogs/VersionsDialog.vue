<script setup lang="ts">
import { useEditorContext } from '../../context'
import Modal from '../ui/Modal.vue'
import type { EditorVersion } from '../../types'

defineProps<{ versions: EditorVersion[] }>()
const emit = defineEmits<{ restore: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useEditorContext()

const formatTime = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function restore(id: string) {
  if (typeof window !== 'undefined' && !window.confirm(t('confirmRestore'))) return
  emit('restore', id)
  open.value = false
}
</script>

<template>
  <Modal v-model:open="open" :title="t('aiVersions')" :width="480">
    <p v-if="!versions.length" class="re-versions-empty">{{ t('versionsEmpty') }}</p>
    <ol v-else class="re-versions" data-testid="re-versions">
      <li v-for="version in versions" :key="version.id" class="re-version">
        <div class="re-version-text">
          <strong>{{ t('versionBefore', { label: version.label }) }}</strong>
          <span>{{ formatTime(version.createdAt) }}</span>
        </div>
        <button type="button" class="re-button" @click="restore(version.id)">{{ t('versionRestore') }}</button>
      </li>
    </ol>
  </Modal>
</template>
