<script setup lang="ts" generic="T">
import { ref } from 'vue'
import type { MenuOption } from './menu'

defineProps<{ options: MenuOption<T>[]; label?: string }>()
const emit = defineEmits<{ select: [value: T] }>()

const listRef = ref<HTMLElement>()

function move(e: KeyboardEvent) {
  const items = Array.from(listRef.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
  if (!items.length) return
  const index = items.indexOf(document.activeElement as HTMLElement)
  let next = index
  if (e.key === 'ArrowDown') next = (index + 1) % items.length
  else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = items.length - 1
  else return
  e.preventDefault()
  items[next].focus()
}
</script>

<template>
  <div ref="listRef" class="re-menu" role="menu" :aria-label="label" @keydown="move">
    <template v-for="(option, i) in options" :key="i">
      <div v-if="option.separatorBefore" class="re-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        class="re-menu-item"
        :class="{ 're-menu-item-active': option.active, 're-menu-item-danger': option.danger }"
        :disabled="option.disabled"
        :tabindex="i === 0 ? 0 : -1"
        @mousedown.prevent
        @click="emit('select', option.value)"
      >
        <component :is="option.icon" v-if="option.icon" class="re-icon" :size="16" aria-hidden="true" />
        <span class="re-menu-label" :style="option.style">{{ option.label }}</span>
        <span v-if="option.hint" class="re-menu-hint">{{ option.hint }}</span>
        <svg v-if="option.active" class="re-menu-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </template>
  </div>
</template>
