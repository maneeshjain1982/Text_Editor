<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../context'

defineProps<{ saved?: boolean; pageSize: string; layout: string }>()
const ctx = useEditorContext()
const { t } = ctx

const counts = computed(() => {
  const editor = ctx.editor.value
  void editor?.state
  const storage = editor?.storage.characterCount
  return { words: storage?.words() ?? 0, characters: storage?.characters() ?? 0 }
})
</script>

<template>
  <div class="re-statusbar">
    <span>{{ t('words', { count: counts.words.toLocaleString() }) }}</span>
    <span>{{ t('characters', { count: counts.characters.toLocaleString() }) }}</span>
    <span class="re-statusbar-spacer" />
    <span v-if="saved" class="re-statusbar-saved">{{ t('saved') }}</span>
    <span v-if="layout === 'document'">{{ pageSize }}</span>
  </div>
</template>
