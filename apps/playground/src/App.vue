<script setup lang="ts">
import { ref } from 'vue'
import {
  RichEditor,
  createDemoAiAdapter,
  type ChatMode,
  type EditorContent,
  type EditorError,
  type EditorLayout,
  type EditorTheme,
  type PageSize,
  type RichEditorExpose,
} from '@local/rich-editor'
import { SAMPLE_HTML } from './sample'

// The demo chrome is deliberately minimal: layout, theme, page size and read-only
// are props of the editor, so they are set here from the URL
// (?layout=inline&theme=dark&page=Letter&editable=false) instead of on-screen controls.
const params = new URLSearchParams(location.search)
const layout = (params.get('layout') as EditorLayout) || 'document'
const theme = (params.get('theme') as EditorTheme) || 'light'
const pageSize = (params.get('page') as PageSize) || 'A4'
const editable = params.get('editable') !== 'false'

const content = ref<EditorContent>(SAMPLE_HTML)
const aiEnabled = ref(true)
const chatMode = ref<ChatMode>('panel')
// Offline demo AI; the sample app (examples/sample-app) uses a real AI backend.
const demoAi = createDemoAiAdapter()
const log = ref<string[]>([])

const editorRef = ref<RichEditorExpose>()
const fileInput = ref<HTMLInputElement>()

// The toolbar only downloads .docx; opening a file stays a host action (api.importFile).
function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void editorRef.value?.importFile(file)
  input.value = ''
}

function onError(error: EditorError) {
  log.value.unshift(`error: ${error.type} ${error.message}`)
}
</script>

<template>
  <div class="pg-shell" :class="{ 'pg-dark': theme === 'dark' }">
    <main class="pg-main">
      <header class="pg-header">
        <div>
          <div class="pg-breadcrumb">Rich editor demo</div>
          <h1>Quarterly Business Review</h1>
        </div>
        <div class="pg-actions">
          <label class="pg-toggle"><input v-model="aiEnabled" type="checkbox" data-testid="ai-toggle" /> AI Canvas</label>
          <label class="pg-toggle">
            <input v-model="chatMode" type="checkbox" true-value="floating" false-value="panel" data-testid="chat-float" /> Floating chat
          </label>
          <button class="pg-btn" data-testid="open-file" @click="fileInput?.click()">Open file…</button>
          <!-- Not in the AI menu any more: hosts drive these two through the API. -->
          <button v-if="aiEnabled" class="pg-btn" data-testid="ai-edit-document" @click="editorRef?.aiEditDocument('Tighten the wording')">
            AI: edit document
          </button>
          <button v-if="aiEnabled" class="pg-btn" data-testid="ai-continue" @click="editorRef?.aiContinue()">AI: continue</button>
          <button class="pg-btn" data-testid="export-docx" @click="editorRef?.download('docx', 'quarterly-review')">Export .docx</button>
          <button class="pg-btn pg-btn-primary" @click="log.unshift(`saved ${editorRef?.getText().length} chars`)">Save</button>
          <input
            ref="fileInput"
            type="file"
            class="pg-file-input"
            accept=".docx,.html,.htm,.md,.markdown,.txt,.json"
            @change="onFilePicked"
          />
        </div>
      </header>

      <section class="pg-card pg-editor-card" :class="{ 'pg-inline': layout === 'inline' }">
        <RichEditor
          ref="editorRef"
          v-model="content"
          :layout="layout"
          :theme="theme"
          :page-size="pageSize"
          :editable="editable"
          :ai="aiEnabled ? demoAi : undefined"
          :chat-mode="chatMode"
          :height="layout === 'inline' ? 420 : '100%'"
          document-name="quarterly-review"
          placeholder="Write your report…"
          @error="onError"
        />
      </section>

      <ul v-if="log.length" class="pg-log">
        <li v-for="(entry, i) in log.slice(0, 3)" :key="i">{{ entry }}</li>
      </ul>

      <!-- The bound value, off-screen: the end-to-end tests assert on what v-model emits. -->
      <pre class="pg-model" data-testid="output">{{ content }}</pre>
    </main>
  </div>
</template>
