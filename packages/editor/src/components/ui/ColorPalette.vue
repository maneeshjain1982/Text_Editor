<script setup lang="ts">
import { ref } from 'vue'
import { useEditorContext } from '../../context'

defineProps<{ current?: string | null }>()
const emit = defineEmits<{ select: [color: string | null] }>()
const { t } = useEditorContext()

const PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#d9d9d9', '#efefef', '#ffffff'],
  ['#dc2626', '#ea580c', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'],
  ['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8'],
  ['#991b1b', '#9a3412', '#854d0e', '#166534', '#155e75', '#1e40af', '#5b21b6', '#9d174d'],
]

const custom = ref('#2563eb')
const same = (a?: string | null, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
</script>

<template>
  <div class="re-palette">
    <button type="button" class="re-palette-none" @mousedown.prevent @click="emit('select', null)">
      <span class="re-swatch re-swatch-none" aria-hidden="true" />
      {{ t('noColor') }}
    </button>
    <div class="re-palette-grid" role="listbox" :aria-label="t('color')">
      <template v-for="(row, r) in PALETTE" :key="r">
        <button
          v-for="color in row"
          :key="color"
          type="button"
          role="option"
          class="re-swatch"
          :class="{ 're-swatch-active': same(current, color) }"
          :aria-selected="same(current, color)"
          :style="{ background: color }"
          :title="color"
          :aria-label="color"
          @mousedown.prevent
          @click="emit('select', color)"
        />
      </template>
    </div>
    <label class="re-palette-custom">
      <input v-model="custom" type="color" @change="emit('select', custom)" />
      <span>{{ t('customColor') }}</span>
    </label>
  </div>
</template>
