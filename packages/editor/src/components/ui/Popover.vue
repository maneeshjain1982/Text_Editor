<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, provide, ref, watch, type Ref } from 'vue'
import { autoUpdate, computePosition, flip, offset, shift, size, type Placement } from '@floating-ui/dom'
import { useEditorContext } from '../../context'

// Nested popovers (e.g. a colour picker inside the toolbar "More" menu) are
// teleported separately, so a parent must treat clicks in its children as inside.
const POPOVER_CHILDREN = 're-popover-children'

const props = withDefaults(defineProps<{ placement?: Placement; label?: string }>(), {
  placement: 'bottom-start',
})
const open = defineModel<boolean>('open', { default: false })

const ctx = useEditorContext()
const triggerRef = ref<HTMLElement>()
const panelRef = ref<HTMLElement>()
let cleanup: (() => void) | undefined

const children = new Set<Ref<HTMLElement | undefined>>()
provide(POPOVER_CHILDREN, children)
const parentChildren = inject<Set<Ref<HTMLElement | undefined>> | null>(POPOVER_CHILDREN, null)
parentChildren?.add(panelRef)
onBeforeUnmount(() => parentChildren?.delete(panelRef))

function containsTarget(target: Node): boolean {
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return true
  return Array.from(children).some((child) => child.value?.contains(target))
}

function toggle() {
  open.value = !open.value
}

function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) (triggerRef.value?.querySelector('button, [tabindex]') as HTMLElement | null)?.focus()
}

function onPointerDown(e: PointerEvent) {
  if (containsTarget(e.target as Node)) return
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close(true)
  }
}

watch(open, async (value) => {
  cleanup?.()
  cleanup = undefined
  if (!value) {
    document.removeEventListener('pointerdown', onPointerDown, true)
    return
  }
  await nextTick()
  const reference = triggerRef.value
  const floating = panelRef.value
  if (!reference || !floating) return
  document.addEventListener('pointerdown', onPointerDown, true)
  cleanup = autoUpdate(reference, floating, () => {
    computePosition(reference, floating, {
      placement: props.placement,
      strategy: 'fixed',
      middleware: [
        offset(6),
        flip({ padding: 8 }),
        shift({ padding: 8 }),
        size({
          padding: 8,
          apply({ availableHeight }) {
            floating.style.maxHeight = `${Math.max(160, availableHeight)}px`
          },
        }),
      ],
    }).then(({ x, y }) => {
      Object.assign(floating.style, { left: `${x}px`, top: `${y}px` })
    })
  })
  // Move focus into the panel for keyboard users.
  const focusable = floating.querySelector<HTMLElement>('[autofocus], input, button, [tabindex="0"]')
  focusable?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  cleanup?.()
  document.removeEventListener('pointerdown', onPointerDown, true)
})

defineExpose({ close, toggle })
</script>

<template>
  <span ref="triggerRef" class="re-popover-trigger">
    <slot name="trigger" :open="open" :toggle="toggle" />
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelRef"
      class="re-portal re-popover"
      :class="ctx.portalClass.value"
      role="dialog"
      :aria-label="label"
      @keydown="onKeydown"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>
