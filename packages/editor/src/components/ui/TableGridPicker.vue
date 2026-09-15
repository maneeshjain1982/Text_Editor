<script setup lang="ts">
import { ref } from 'vue'
import { useEditorContext } from '../../context'

const emit = defineEmits<{ select: [size: { rows: number; cols: number }] }>()
const { t } = useEditorContext()

const MAX_ROWS = 8
const MAX_COLS = 10
const rows = ref(3)
const cols = ref(3)

function onKey(e: KeyboardEvent) {
  const map: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('select', { rows: rows.value, cols: cols.value })
    return
  }
  const d = map[e.key]
  if (!d) return
  e.preventDefault()
  rows.value = Math.min(MAX_ROWS, Math.max(1, rows.value + d[0]))
  cols.value = Math.min(MAX_COLS, Math.max(1, cols.value + d[1]))
}
</script>

<template>
  <div class="re-grid-picker">
    <div
      class="re-grid"
      tabindex="0"
      role="grid"
      :aria-label="t('insertTable')"
      :aria-description="t('tableSize', { rows, cols })"
      :style="{ gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)` }"
      @keydown="onKey"
    >
      <template v-for="r in MAX_ROWS" :key="r">
        <button
          v-for="c in MAX_COLS"
          :key="c"
          type="button"
          tabindex="-1"
          class="re-grid-cell"
          :class="{ 're-grid-cell-on': r <= rows && c <= cols }"
          :aria-label="t('tableSize', { rows: r, cols: c })"
          @mouseenter="rows = r; cols = c"
          @mousedown.prevent
          @click="emit('select', { rows: r, cols: c })"
        />
      </template>
    </div>
    <div class="re-grid-label" aria-live="polite">{{ t('tableSize', { rows, cols }) }}</div>
  </div>
</template>
