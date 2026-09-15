<script setup lang="ts">
import { computed, type Component } from 'vue'

const props = defineProps<{
  icon?: Component
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  /** Show the label text next to the icon. */
  showLabel?: boolean
  /** Adds a chevron, for buttons that open a menu. */
  hasMenu?: boolean
  expanded?: boolean
}>()

defineEmits<{ click: [event: MouseEvent] }>()

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const title = computed(() => {
  if (!props.shortcut) return props.label
  const keys = props.shortcut.replace(/Mod/g, isMac ? '⌘' : 'Ctrl').replace(/Shift/g, isMac ? '⇧' : 'Shift').replace(/Alt/g, isMac ? '⌥' : 'Alt')
  return `${props.label} (${keys})`
})
</script>

<template>
  <button
    type="button"
    class="re-btn"
    :class="{ 're-btn-active': active, 're-btn-labelled': showLabel, 're-btn-menu': hasMenu }"
    :disabled="disabled"
    :title="title"
    :aria-label="label"
    :aria-pressed="hasMenu ? undefined : active === undefined ? undefined : active"
    :aria-haspopup="hasMenu ? 'true' : undefined"
    :aria-expanded="hasMenu ? !!expanded : undefined"
    @mousedown.prevent
    @click="$emit('click', $event)"
  >
    <component :is="icon" v-if="icon" class="re-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
    <slot />
    <span v-if="showLabel" class="re-btn-text">{{ label }}</span>
    <svg v-if="hasMenu" class="re-chevron" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>
