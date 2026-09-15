<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-vue-next'
import { useEditorContext } from '../context'
import ToolButton from './ui/ToolButton.vue'

const ctx = useEditorContext()
const { t } = ctx
const term = ref('')
const replacement = ref('')
const caseSensitive = ref(false)
const inputRef = ref<HTMLInputElement>()

const editor = computed(() => ctx.editor.value)
// Re-read storage on every editor state change (editor.state is reactive in @tiptap/vue-3).
const stats = computed(() => {
  void editor.value?.state
  const s = editor.value?.storage.searchReplace
  return { total: s?.results.length ?? 0, index: s?.index ?? 0 }
})

watch(term, (v) => editor.value?.commands.setSearchTerm(v))
watch(replacement, (v) => editor.value?.commands.setReplaceTerm(v))
watch(caseSensitive, (v) => editor.value?.commands.setCaseSensitive(v))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'Enter' && e.target === inputRef.value) {
    e.preventDefault()
    if (e.shiftKey) editor.value?.commands.previousMatch()
    else editor.value?.commands.nextMatch()
  }
}

function close() {
  ctx.findOpen.value = false
}

// Replacing can disable the clicked button (no matches left), which drops focus to <body>
// and breaks Escape/Enter. Return focus to the search field.
function replace(all: boolean) {
  if (all) editor.value?.commands.replaceAll()
  else editor.value?.commands.replaceCurrent()
  inputRef.value?.focus()
}

onMounted(async () => {
  const e = editor.value
  if (e) {
    const { from, to } = e.state.selection
    const selected = e.state.doc.textBetween(from, to, ' ')
    if (selected && selected.length < 100) term.value = selected
  }
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

onBeforeUnmount(() => {
  editor.value?.commands.clearSearch()
  editor.value?.commands.focus()
})
</script>

<template>
  <div class="re-find" role="search" @keydown="onKeydown">
    <div class="re-find-row">
      <div class="re-find-input">
        <input ref="inputRef" v-model="term" type="text" :placeholder="t('find')" :aria-label="t('find')" />
        <span class="re-find-count" aria-live="polite">
          {{ term ? (stats.total ? t('matchCount', { current: stats.index + 1, total: stats.total }) : t('noResults')) : '' }}
        </span>
      </div>
      <ToolButton :icon="CaseSensitive" :label="t('matchCase')" :active="caseSensitive" @click="caseSensitive = !caseSensitive" />
      <ToolButton :icon="ArrowUp" :label="t('previous')" shortcut="Shift-Enter" :disabled="!stats.total" @click="editor?.commands.previousMatch()" />
      <ToolButton :icon="ArrowDown" :label="t('next')" shortcut="Enter" :disabled="!stats.total" @click="editor?.commands.nextMatch()" />
      <ToolButton :icon="X" :label="t('close')" @click="close" />
    </div>
    <div v-if="editor?.isEditable" class="re-find-row">
      <div class="re-find-input">
        <input v-model="replacement" type="text" :placeholder="t('replaceWith')" :aria-label="t('replaceWith')" />
      </div>
      <button type="button" class="re-button" :disabled="!stats.total" @click="replace(false)">{{ t('replace') }}</button>
      <button type="button" class="re-button" :disabled="!stats.total" @click="replace(true)">{{ t('replaceAll') }}</button>
    </div>
  </div>
</template>
