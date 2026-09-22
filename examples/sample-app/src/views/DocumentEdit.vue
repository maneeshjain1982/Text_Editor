<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  RichEditor,
  type AiChatMessage,
  type EditorContent,
  type EditorError,
  type JSONContent,
  type Messages,
  type RichEditorExpose,
} from '@local/rich-editor'
import { documentsApi } from '../api/documents'
import { aiAdapter } from '../api/ai'
import { useTheme } from '../composables/useTheme'

const route = useRoute()
const router = useRouter()
const { theme } = useTheme()

const id = computed(() => (route.params.id as string | undefined) ?? null)
const editorRef = ref<RichEditorExpose>()

const title = ref('')
const content = ref<EditorContent>({ type: 'doc', content: [] })
const savedSnapshot = ref('')
const loading = ref(true)
const saving = ref(false)
const notice = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)

const snapshot = () => JSON.stringify({ title: title.value, content: content.value })
const isDirty = computed(() => !loading.value && snapshot() !== savedSnapshot.value)

// Integration guide §7.5: override a few UI strings.
const messages: Partial<Messages> = { saved: 'Draft saved locally' }

function notify(kind: 'ok' | 'error', text: string) {
  notice.value = { kind, text }
  setTimeout(() => (notice.value = null), 3000)
}

onMounted(async () => {
  if (id.value) {
    const doc = await documentsApi.get(id.value)
    if (!doc) {
      router.replace('/')
      return
    }
    title.value = doc.title
    content.value = doc.content
  }
  loading.value = false
})

// Integration guide §5.2: the editor normalises content on load — use that as the saved state.
function onReady() {
  savedSnapshot.value = snapshot()
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const record = await documentsApi.save({
      id: id.value ?? undefined,
      title: title.value.trim() || 'Untitled',
      content: content.value as JSONContent,
    })
    title.value = record.title
    savedSnapshot.value = snapshot()
    try {
      localStorage.removeItem(draftKey.value)
    } catch {
      /* ignore */
    }
    notify('ok', 'Document saved')
    if (!id.value) router.replace(`/documents/${record.id}/edit`)
  } catch {
    notify('error', 'Could not save the document. Try again.')
  } finally {
    saving.value = false
  }
}

function onEditorError(error: EditorError) {
  const text: Record<EditorError['type'], string> = {
    'image-type': 'That file type is not supported.',
    'image-size': 'That image is too large.',
    'image-upload': 'The image could not be uploaded.',
    import: 'That file could not be opened.',
    export: 'Export failed.',
    clipboard: 'Clipboard access was blocked.',
    ai: error.message || 'The AI request failed.',
  }
  notify('error', text[error.type])
}

// Integration guide §8.1: trigger Word export from the page's own button.
function downloadWord() {
  editorRef.value?.download('docx', title.value || 'document')
}

// Slot example (§9): an app-specific button that uses the TipTap editor instance.
function insertSignature() {
  editorRef.value?.editor
    ?.chain()
    .focus()
    .insertContent([
      { type: 'horizontalRule' },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Reviewed by the Docs Hub team' }] },
    ])
    .run()
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

onBeforeRouteLeave(() => !isDirty.value || window.confirm('You have unsaved changes. Leave anyway?'))

const draftKey = computed(() => `docs-hub-draft-${id.value ?? 'new'}`)

// Chat history per document (integration guide §9.5). Stored locally here; a real app would
// save it through its API next to the document.
const chatKey = computed(() => `docs-hub-chat-${id.value ?? 'new'}`)
const chatHistory = ref<AiChatMessage[]>(readChat())
function readChat(): AiChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(`docs-hub-chat-${(route.params.id as string | undefined) ?? 'new'}`) ?? '[]')
  } catch {
    return []
  }
}
function saveChat(history: AiChatMessage[]) {
  chatHistory.value = history
  try {
    localStorage.setItem(chatKey.value, JSON.stringify(history))
  } catch {
    /* storage full or unavailable */
  }
}
</script>

<template>
  <section class="page page-editor">
    <div class="page-header">
      <input
        v-model="title"
        class="title-input"
        type="text"
        placeholder="Untitled document"
        aria-label="Document title"
        data-testid="title"
      />
      <div class="header-actions">
        <span class="status" data-testid="save-status">{{ isDirty ? 'Unsaved changes' : 'All changes saved' }}</span>
        <button class="btn" type="button" data-testid="download-docx" @click="downloadWord">Download .docx</button>
        <button class="btn btn-primary" type="button" :disabled="saving" data-testid="save" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <p v-if="notice" class="notice" :class="`notice-${notice.kind}`" role="status" data-testid="notice">{{ notice.text }}</p>

    <p v-if="loading" class="muted">Loading…</p>

    <div v-else class="editor-frame">
      <RichEditor
        :key="id ?? 'new'"
        ref="editorRef"
        v-model="content"
        content-format="json"
        layout="document"
        height="100%"
        :theme="theme"
        :upload-image="documentsApi.uploadImage"
        :max-image-size="3 * 1024 * 1024"
        :document-name="title || 'document'"
        :autosave-key="draftKey"
        :messages="messages"
        :ai="aiAdapter"
        :chat-history="chatHistory"
        @update:chat-history="saveChat"
        placeholder="Start writing your document…"
        @ready="onReady"
        @error="onEditorError"
      >
        <template #toolbar-end>
          <div class="editor-extras">
            <button class="btn btn-small" type="button" data-testid="insert-signature" @click="insertSignature">
              Insert sign-off
            </button>
          </div>
        </template>
      </RichEditor>
    </div>
  </section>
</template>
