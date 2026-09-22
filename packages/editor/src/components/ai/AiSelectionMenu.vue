<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { Sparkles, WandSparkles } from 'lucide-vue-next'
import { useEditorContext } from '../../context'
import { bubbleOptions } from '../menus/options'
import { getAiSuggestionState } from '../../extensions/AiSuggestion'
import type { AiController } from '../../ai/controller'
import type { AiQuickAction } from '../../ai/types'
import type { MenuOption } from '../ui/menu'
import ToolButton from '../ui/ToolButton.vue'
import Popover from '../ui/Popover.vue'
import MenuList from '../ui/MenuList.vue'

const props = defineProps<{ editor: Editor; controller: AiController; scrollTarget?: HTMLElement }>()
const ctx = useEditorContext()
const { t } = ctx
const actionsOpen = ref(false)
const appendTo = () => (props.editor.view.dom.closest('.re-root') as HTMLElement | null) ?? document.body
// Below the selection so it doesn't collide with the table menu, which sits above tables.
const menuOptions = computed(() => bubbleOptions(props.editor, 're-ai-selection-menu', 'bottom', props.scrollTarget))

const shouldShow = ({ editor }: { editor: Editor }) => {
  const { selection } = editor.state
  return (
    editor.isEditable &&
    selection instanceof TextSelection &&
    !selection.empty &&
    !editor.isActive('codeBlock') &&
    !props.controller.state.open &&
    getAiSuggestionState(editor.state).suggestions.length === 0 &&
    editor.state.doc.textBetween(selection.from, selection.to).trim().length > 0
  )
}

// shouldShow is only re-checked on selection/document changes, so hide the menu explicitly
// when the AI bar opens or suggestions appear (both are metadata-only transactions).
const busy = computed(() => props.controller.state.open || props.controller.pendingCount.value > 0)
watch(busy, (value) => {
  if (value && !props.editor.isDestroyed) props.editor.view.dispatch(props.editor.state.tr.setMeta('re-ai-selection-menu', 'hide'))
})

const options = computed<MenuOption<string>[]>(() => ctx.aiActions.value.map((a) => ({ value: a.id, label: a.label })))

function ask() {
  props.controller.open('edit-selection')
}

function runAction(id: string) {
  actionsOpen.value = false
  const action = ctx.aiActions.value.find((a) => a.id === id) as AiQuickAction
  if (!props.controller.open('edit-selection', action.prefill ? action.instruction : '')) return
  if (!action.prefill) void props.controller.run(action.instruction, action.label)
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    plugin-key="re-ai-selection-menu"
    :should-show="shouldShow"
    :append-to="appendTo"
    :options="menuOptions"
  >
    <div v-if="!busy" class="re-bubble" role="toolbar" :aria-label="t('ai')">
      <ToolButton :icon="Sparkles" :label="t('aiAsk')" :shortcut="'Mod-J'" show-label class="re-ai-ask" @click="ask" />
      <Popover v-model:open="actionsOpen" :label="t('aiQuickActions')">
        <template #trigger="{ toggle }">
          <ToolButton :icon="WandSparkles" :label="t('aiQuickActions')" has-menu :expanded="actionsOpen" @click="toggle" />
        </template>
        <MenuList :options="options" :label="t('aiQuickActions')" @select="runAction" />
      </Popover>
    </div>
  </BubbleMenu>
</template>
