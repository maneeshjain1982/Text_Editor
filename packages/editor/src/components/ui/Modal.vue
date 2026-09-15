<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useEditorContext } from '../../context'

const props = defineProps<{ title: string; width?: number }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [] }>()
const ctx = useEditorContext()
const dialogRef = ref<HTMLElement>()
let previousFocus: HTMLElement | null = null

function close() {
  open.value = false
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
    return
  }
  // Simple focus trap.
  if (e.key !== 'Tab' || !dialogRef.value) return
  const focusables = Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]'),
  )
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  open,
  async (value) => {
    if (value) {
      previousFocus = document.activeElement as HTMLElement
      await nextTick()
      dialogRef.value?.querySelector<HTMLElement>('[autofocus], input, button:not(.re-modal-close)')?.focus()
    } else {
      previousFocus?.focus?.({ preventScroll: true })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => previousFocus?.focus?.({ preventScroll: true }))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="re-portal re-modal-backdrop" :class="ctx.portalClass.value" @mousedown.self="close">
      <div
        ref="dialogRef"
        class="re-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="props.title"
        :style="{ width: `${props.width ?? 440}px` }"
        @keydown="onKeydown"
      >
        <header class="re-modal-header">
          <h2>{{ props.title }}</h2>
          <button type="button" class="re-btn re-modal-close" :aria-label="ctx.t('close')" @click="close">
            <X :size="18" aria-hidden="true" />
          </button>
        </header>
        <div class="re-modal-body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="re-modal-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
