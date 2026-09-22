<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Check, CircleStop, RotateCcw, SendHorizontal, Sparkles, X } from 'lucide-vue-next'
import { useEditorContext } from '../../context'
import type { AiController } from '../../ai/controller'
import type { AiQuickAction } from '../../ai/types'
import type { MessageKey } from '../../i18n/messages'
import ToolButton from '../ui/ToolButton.vue'

const props = defineProps<{ controller: AiController }>()
const ctx = useEditorContext()
const { t } = ctx
const ai = props.controller
const state = ai.state

const input = ref('')
const inputRef = ref<HTMLTextAreaElement>()

const MODE: Record<string, { title: MessageKey; placeholder: MessageKey }> = {
  'edit-selection': { title: 'aiModeSelection', placeholder: 'aiPlaceholderSelection' },
  generate: { title: 'aiModeGenerate', placeholder: 'aiPlaceholderGenerate' },
  continue: { title: 'aiModeContinue', placeholder: 'aiPlaceholderContinue' },
  'edit-document': { title: 'aiModeDocument', placeholder: 'aiPlaceholderDocument' },
}
const mode = computed(() => MODE[state.mode])
const running = computed(() => state.status === 'running')
const canSend = computed(() => !running.value && (input.value.trim().length > 0 || state.mode === 'continue'))
const showActions = computed(() => state.mode === 'edit-selection' && !running.value && ai.pendingCount.value === 0)

// Prefill from quick actions such as "Translate to…".
watch(
  () => state.draftVersion,
  async () => {
    input.value = state.draft
    await nextTick()
    focusInput()
  },
)

// When every suggestion has been accepted or rejected in the document, go back to idle.
watch(ai.pendingCount, (count, before) => {
  if (count === 0 && before > 0) ai.onSuggestionsResolved()
})

function focusInput() {
  const el = inputRef.value
  if (!el) return
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

onMounted(focusInput)

function send() {
  if (!canSend.value) return
  const instruction = input.value.trim()
  input.value = ''
  void ai.run(instruction)
}

function runAction(action: AiQuickAction) {
  if (action.prefill) {
    input.value = action.instruction
    focusInput()
    return
  }
  void ai.run(action.instruction, action.label)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (running.value) ai.stop()
    else close()
  }
}

function close() {
  ai.close()
  ctx.editor.value?.commands.focus()
}
</script>

<template>
  <section class="re-ai-bar" :aria-label="t('ai')" data-testid="re-ai-bar">
    <div class="re-ai-row">
      <span class="re-ai-mode">
        <Sparkles :size="16" aria-hidden="true" />
        {{ t(mode.title) }}
      </span>
      <textarea
        ref="inputRef"
        v-model="input"
        class="re-ai-input"
        rows="1"
        :placeholder="t(mode.placeholder)"
        :aria-label="t('aiInstructionLabel')"
        :disabled="running"
        @keydown="onKeydown"
      />
      <button v-if="running" type="button" class="re-button" @click="ai.stop()">
        <CircleStop :size="16" aria-hidden="true" /> {{ t('aiStop') }}
      </button>
      <button v-else type="button" class="re-button re-button-primary" :disabled="!canSend" @click="send">
        <SendHorizontal :size="16" aria-hidden="true" /> {{ t('aiSend') }}
      </button>
      <ToolButton :icon="X" :label="t('close')" @click="close" />
    </div>

    <div v-if="showActions" class="re-ai-chips" role="group" :aria-label="t('aiQuickActions')">
      <button v-for="action in ctx.aiActions.value" :key="action.id" type="button" class="re-ai-chip" @click="runAction(action)">
        {{ action.label }}
      </button>
    </div>

    <div v-if="running" class="re-ai-status" aria-live="polite">
      <span class="re-ai-spinner" aria-hidden="true" />
      <span>{{ t('aiWriting') }}</span>
    </div>
    <pre v-if="running && state.preview" class="re-ai-preview">{{ state.preview }}</pre>

    <div v-if="!running && (state.message || ai.pendingCount.value)" class="re-ai-status" :class="{ 're-ai-status-error': state.status === 'error' }" aria-live="polite">
      <span>{{ state.message || t('aiReviewMany', { count: ai.pendingCount.value }) }}</span>
      <span class="re-ai-status-actions">
        <template v-if="ai.pendingCount.value">
          <button type="button" class="re-button re-button-primary" data-testid="re-ai-accept-all" @click="ai.acceptAll()">
            <Check :size="16" aria-hidden="true" /> {{ ai.pendingCount.value > 1 ? t('aiAcceptAll') : t('aiAccept') }}
          </button>
          <button type="button" class="re-button" @click="ai.rejectAll()">
            {{ ai.pendingCount.value > 1 ? t('aiRejectAll') : t('aiReject') }}
          </button>
        </template>
        <button v-if="state.lastInstruction && state.status !== 'idle'" type="button" class="re-button" @click="ai.retry()">
          <RotateCcw :size="16" aria-hidden="true" /> {{ t('aiRetry') }}
        </button>
      </span>
    </div>
    <p v-if="ai.pendingCount.value && !running" class="re-ai-hint">{{ t('aiRefineHint') }}</p>
  </section>
</template>
