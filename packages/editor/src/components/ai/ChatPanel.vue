<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ArrowDownToLine, Check, CircleStop, Copy, MessagesSquare, Replace, RotateCcw, SendHorizontal, Trash2, X } from 'lucide-vue-next'
import { useEditorContext } from '../../context'
import { stripCitations } from '../../ai/chat-parse'
import type { ChatController, ChatMessage } from '../../ai/chat'
import ToolButton from '../ui/ToolButton.vue'
import ChatMarkdown from './ChatMarkdown.vue'

const props = defineProps<{ chat: ChatController; starters: string[] }>()
const ctx = useEditorContext()
const { t } = ctx
const chat = props.chat

const input = ref('')
const inputRef = ref<HTMLTextAreaElement>()
const listRef = ref<HTMLElement>()
const copiedKey = ref<number | null>(null)

const hasSelection = computed(() => {
  void ctx.editor.value?.state
  return !!ctx.editor.value && !ctx.editor.value.state.selection.empty
})

function scrollToEnd() {
  nextTick(() => listRef.value?.scrollTo({ top: listRef.value.scrollHeight }))
}

// Follow new messages and streaming text.
watch(
  () => [chat.messages.value.length, chat.messages.value[chat.messages.value.length - 1]?.content],
  scrollToEnd,
)

onMounted(() => {
  scrollToEnd()
  inputRef.value?.focus()
})

function send(text = input.value) {
  if (!text.trim() || chat.busy.value) return
  input.value = ''
  void chat.send(text)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (chat.busy.value) chat.stop()
    else close()
  }
}

function close() {
  chat.setOpen(false)
  ctx.editor.value?.commands.focus()
}

async function copy(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(stripCitations(message.content))
    copiedKey.value = message.key
    setTimeout(() => (copiedKey.value = null), 1500)
  } catch (cause) {
    ctx.reportError({ type: 'clipboard', message: '', cause })
  }
}
</script>

<template>
  <aside class="re-chat" :aria-label="t('chatTitle')" data-testid="re-chat">
    <header class="re-chat-header">
      <MessagesSquare :size="16" aria-hidden="true" class="re-chat-header-icon" />
      <h2>{{ t('chatTitle') }}</h2>
      <ToolButton :icon="Trash2" :label="t('chatClear')" :disabled="!chat.messages.value.length" @click="chat.clear()" />
      <ToolButton :icon="X" :label="t('close')" @click="close" />
    </header>

    <div ref="listRef" class="re-chat-list" role="log" aria-live="polite" :aria-busy="chat.busy.value">
      <div v-if="!chat.messages.value.length" class="re-chat-empty">
        <strong>{{ t('chatEmptyTitle') }}</strong>
        <p>{{ t('chatEmptyHint') }}</p>
        <div class="re-chat-starters">
          <button v-for="starter in starters" :key="starter" type="button" class="re-ai-chip" @click="send(starter)">{{ starter }}</button>
        </div>
      </div>

      <article
        v-for="message in chat.messages.value"
        :key="message.key"
        class="re-chat-message"
        :class="[`re-chat-${message.role}`, { 're-chat-error': message.status === 'error' }]"
      >
        <div class="re-chat-role">{{ message.role === 'user' ? t('chatYou') : t('chatAssistant') }}</div>

        <template v-if="message.role === 'user'">
          <blockquote v-if="message.selection" class="re-chat-quote">{{ message.selection }}</blockquote>
          <p class="re-chat-question">{{ message.content }}</p>
        </template>

        <template v-else>
          <div v-if="message.status === 'streaming' && !message.content" class="re-ai-status">
            <span class="re-ai-spinner" aria-hidden="true" /> {{ t('aiWriting') }}
          </div>
          <ChatMarkdown v-else :markdown="message.content" :citations="message.citations" @cite="chat.jumpTo" />

          <p v-if="message.partial && message.status === 'done'" class="re-chat-note">{{ t('chatPartial') }}</p>

          <ol v-if="message.citations.length && message.status === 'done'" class="re-chat-sources" :aria-label="t('chatSources')">
            <li v-for="(citation, i) in message.citations" :key="citation.id">
              <button type="button" :disabled="citation.stale" :title="citation.stale ? t('chatSourceGone') : undefined" @click="chat.jumpTo(citation)">
                <span class="re-chat-source-num">{{ i + 1 }}</span> {{ citation.label }}
              </button>
            </li>
          </ol>

          <div v-if="chat.pendingFor(message).length" class="re-chat-changes">
            <span>{{ chat.pendingFor(message).length === 1 ? t('chatChangesOne') : t('chatChanges', { count: chat.pendingFor(message).length }) }}</span>
            <button type="button" class="re-button re-button-primary" @click="chat.resolve(message, true)">
              <Check :size="14" aria-hidden="true" /> {{ t('aiAccept') }}
            </button>
            <button type="button" class="re-button" @click="chat.resolve(message, false)">{{ t('aiReject') }}</button>
          </div>

          <div v-if="message.status === 'done' && message.content" class="re-chat-actions">
            <button type="button" class="re-chat-action" @click="copy(message)">
              <Copy :size="14" aria-hidden="true" /> {{ copiedKey === message.key ? t('chatCopied') : t('chatCopy') }}
            </button>
            <button type="button" class="re-chat-action" @click="chat.useAnswer(message, 'insert')">
              <ArrowDownToLine :size="14" aria-hidden="true" /> {{ t('chatInsert') }}
            </button>
            <button v-if="hasSelection" type="button" class="re-chat-action" @click="chat.useAnswer(message, 'replace')">
              <Replace :size="14" aria-hidden="true" /> {{ t('chatReplace') }}
            </button>
          </div>
          <button v-if="message.status === 'error'" type="button" class="re-button re-chat-retry" @click="chat.retry(message)">
            <RotateCcw :size="14" aria-hidden="true" /> {{ t('aiRetry') }}
          </button>
        </template>
      </article>
    </div>

    <footer class="re-chat-footer">
      <div v-if="chat.attached.value" class="re-chat-attached">
        <span class="re-chat-attached-text" :title="chat.attached.value.text">{{ t('chatSelectionAttached') }}: “{{ chat.attached.value.text }}”</span>
        <ToolButton :icon="X" :label="t('chatRemoveSelection')" @click="chat.attached.value = null" />
      </div>
      <div class="re-chat-input-row">
        <textarea
          ref="inputRef"
          v-model="input"
          class="re-ai-input re-chat-input"
          rows="2"
          :placeholder="t('chatPlaceholder')"
          :aria-label="t('chatQuestionLabel')"
          @keydown="onKeydown"
          @focus="!chat.attached.value && chat.attachSelection()"
        />
        <button v-if="chat.busy.value" type="button" class="re-button" @click="chat.stop()">
          <CircleStop :size="16" aria-hidden="true" /> {{ t('aiStop') }}
        </button>
        <button v-else type="button" class="re-button re-button-primary" :disabled="!input.trim()" :aria-label="t('aiSend')" @click="send()">
          <SendHorizontal :size="16" aria-hidden="true" />
        </button>
      </div>
    </footer>
  </aside>
</template>
