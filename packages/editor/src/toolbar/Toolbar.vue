<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Ellipsis } from 'lucide-vue-next'
import { useEditorContext } from '../context'
import type { ToolbarGroup } from '../types'
import ToolbarControl from './ToolbarControl.vue'
import ToolButton from '../components/ui/ToolButton.vue'
import Popover from '../components/ui/Popover.vue'

const props = defineProps<{ groups: ToolbarGroup[] }>()
const { t } = useEditorContext()

const rootRef = ref<HTMLElement>()
const groupRefs = ref<HTMLElement[]>([])
const widths: number[] = []
const visibleCount = ref(props.groups.length)
const moreOpen = ref(false)

const MORE_WIDTH = 44
const GAP = 9 // separator + margins

const visible = computed(() => props.groups.slice(0, visibleCount.value))
const overflow = computed(() => props.groups.slice(visibleCount.value))

/** Fit as many whole groups as possible; the rest move into the "More" menu. */
function measure() {
  const root = rootRef.value
  if (!root) return
  // Only visible groups can be measured; hidden ones keep their last known width.
  groupRefs.value.forEach((el, i) => {
    if (el?.isConnected && i < visibleCount.value) widths[i] = el.offsetWidth
  })
  const available = root.clientWidth
  const total = props.groups.reduce((sum, _g, i) => sum + (widths[i] ?? 0) + (i ? GAP : 0), 0)
  if (total <= available) {
    visibleCount.value = props.groups.length
    return
  }
  let used = MORE_WIDTH
  let count = 0
  for (let i = 0; i < props.groups.length; i++) {
    const w = (widths[i] ?? 0) + (i ? GAP : 0)
    if (used + w > available) break
    used += w
    count++
  }
  visibleCount.value = Math.max(1, count)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  measure()
  observer = new ResizeObserver(() => measure())
  if (rootRef.value) observer.observe(rootRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

watch(
  () => props.groups,
  async () => {
    widths.length = 0
    visibleCount.value = props.groups.length
    await nextTick()
    measure()
  },
)

/** Roving focus: arrow keys move between toolbar buttons (WAI-ARIA toolbar pattern). */
function onKeydown(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  const buttons = Array.from(rootRef.value?.querySelectorAll<HTMLButtonElement>('.re-toolbar-group > * button, .re-toolbar-group > button, .re-toolbar-more button') ?? []).filter(
    (b) => !b.disabled && b.offsetParent !== null,
  )
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  e.preventDefault()
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next].focus()
}
</script>

<template>
  <div ref="rootRef" class="re-toolbar" role="toolbar" :aria-label="t('toolbar')" @keydown="onKeydown">
    <template v-for="(group, gi) in visible" :key="gi">
      <div v-if="gi" class="re-toolbar-separator" aria-hidden="true" />
      <div :ref="(el) => (groupRefs[gi] = el as HTMLElement)" class="re-toolbar-group">
        <ToolbarControl v-for="item in group" :key="item" :item="item" />
      </div>
    </template>

    <div v-if="overflow.length" class="re-toolbar-more">
      <Popover v-model:open="moreOpen" placement="bottom-end" :label="t('more')">
        <template #trigger="{ toggle }">
          <ToolButton :icon="Ellipsis" :label="t('more')" :expanded="moreOpen" :active="moreOpen" @click="toggle" />
        </template>
        <div class="re-toolbar-overflow">
          <div v-for="(group, gi) in overflow" :key="gi" class="re-toolbar-group">
            <ToolbarControl v-for="item in group" :key="item" :item="item" />
          </div>
        </div>
      </Popover>
    </div>
  </div>
</template>
