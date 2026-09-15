<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  RichEditor,
  type EditorContent,
  type EditorError,
  type EditorLayout,
  type EditorTheme,
  type PageSize,
  type RichEditorExpose,
  type ToolbarConfig,
} from '@local/rich-editor'
import { SAMPLE_HTML } from './sample'

const content = ref<EditorContent>(SAMPLE_HTML)
const layout = ref<EditorLayout>('document')
const theme = ref<EditorTheme>('light')
const pageSize = ref<PageSize>('A4')
const toolbarPreset = ref<'full' | 'basic' | 'custom'>('full')
const editable = ref(true)
const simulateUpload = ref(false)
const outputTab = ref<'html' | 'json'>('html')
const log = ref<string[]>([])

const editorRef = ref<RichEditorExpose>()

const toolbar = computed<ToolbarConfig>(() =>
  toolbarPreset.value === 'custom' ? [['bold', 'italic', 'underline'], ['bulletList', 'orderedList'], ['link', 'image', 'table']] : toolbarPreset.value,
)

// Fake backend: waits, then returns an object URL like a CDN would return a public URL.
async function uploadImage(file: File) {
  await new Promise((r) => setTimeout(r, 1200))
  return URL.createObjectURL(file)
}

const pretty = computed(() =>
  outputTab.value === 'html' ? editorRef.value?.getHTML() ?? '' : JSON.stringify(editorRef.value?.getJSON() ?? {}, null, 2),
)

function onError(error: EditorError) {
  log.value.unshift(`error: ${error.type} ${error.message}`)
}
</script>

<template>
  <div class="pg-shell" :class="{ 'pg-dark': theme === 'dark' }">
    <aside class="pg-sidebar">
      <div class="pg-logo">◆ Acme Dashboard</div>
      <nav>
        <a>Overview</a>
        <a class="active">Documents</a>
        <a>Reports</a>
        <a>Settings</a>
      </nav>
    </aside>

    <main class="pg-main">
      <header class="pg-header">
        <div>
          <div class="pg-breadcrumb">Documents / Reviews</div>
          <h1>Quarterly Business Review</h1>
        </div>
        <div class="pg-actions">
          <button class="pg-btn" data-testid="export-docx" @click="editorRef?.download('docx', 'quarterly-review')">Export .docx</button>
          <button class="pg-btn pg-btn-primary" @click="log.unshift(`saved ${editorRef?.getText().length} chars`)">Save</button>
        </div>
      </header>

      <div class="pg-controls">
        <label>Layout
          <select v-model="layout" data-testid="layout">
            <option value="document">Document (page)</option>
            <option value="inline">Inline</option>
          </select>
        </label>
        <label>Page
          <select v-model="pageSize">
            <option>A4</option>
            <option>Letter</option>
          </select>
        </label>
        <label>Theme
          <select v-model="theme" data-testid="theme">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto</option>
          </select>
        </label>
        <label>Toolbar
          <select v-model="toolbarPreset">
            <option value="full">Full</option>
            <option value="basic">Basic</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label><input v-model="editable" type="checkbox" /> Editable</label>
        <label><input v-model="simulateUpload" type="checkbox" /> Simulate server upload</label>
      </div>

      <section class="pg-card pg-editor-card" :class="{ 'pg-inline': layout === 'inline' }">
        <RichEditor
          ref="editorRef"
          v-model="content"
          :layout="layout"
          :theme="theme"
          :page-size="pageSize"
          :toolbar="toolbar"
          :editable="editable"
          :upload-image="simulateUpload ? uploadImage : undefined"
          :height="layout === 'inline' ? 420 : '100%'"
          document-name="quarterly-review"
          placeholder="Write your report…"
          @error="onError"
        />
      </section>

      <section class="pg-card">
        <div class="pg-output-header">
          <h3>Output</h3>
          <div class="pg-tabs">
            <button :class="{ active: outputTab === 'html' }" @click="outputTab = 'html'">HTML</button>
            <button :class="{ active: outputTab === 'json' }" @click="outputTab = 'json'">JSON</button>
          </div>
        </div>
        <pre class="pg-output" data-testid="output">{{ content && pretty }}</pre>
        <ul v-if="log.length" class="pg-log">
          <li v-for="(entry, i) in log.slice(0, 5)" :key="i">{{ entry }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>
