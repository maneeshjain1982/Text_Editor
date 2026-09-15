<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { documentsApi, type DocumentRecord } from '../api/documents'

const docs = ref<DocumentRecord[]>([])
const loading = ref(true)
const exporting = ref<string | null>(null)

onMounted(async () => {
  docs.value = await documentsApi.list()
  loading.value = false
})

// Integration guide §8.2: export without mounting the editor, using the '/docx' entry.
// Imported on demand so the list page stays light.
async function downloadDocx(doc: DocumentRecord) {
  exporting.value = doc.id
  try {
    const { exportDocx } = await import('@local/rich-editor/docx')
    const blob = await exportDocx(doc.content, { pageSize: 'A4', title: doc.title })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.title || 'document'}.docx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    exporting.value = null
  }
}

async function remove(doc: DocumentRecord) {
  if (!window.confirm(`Delete “${doc.title}”?`)) return
  await documentsApi.remove(doc.id)
  docs.value = docs.value.filter((d) => d.id !== doc.id)
}

const formatDate = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <section class="page">
    <div class="page-header">
      <h1>Documents</h1>
      <RouterLink to="/documents/new" class="btn btn-primary" data-testid="new-document">New document</RouterLink>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="!docs.length" class="muted">No documents yet.</p>

    <table v-else class="doc-table" data-testid="document-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Updated</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="doc in docs" :key="doc.id" :data-testid="`row-${doc.id}`">
          <td>
            <RouterLink :to="`/documents/${doc.id}`">{{ doc.title || 'Untitled' }}</RouterLink>
          </td>
          <td class="muted">{{ formatDate(doc.updatedAt) }}</td>
          <td class="actions">
            <RouterLink :to="`/documents/${doc.id}/edit`" class="btn">Edit</RouterLink>
            <button class="btn" type="button" :disabled="exporting === doc.id" @click="downloadDocx(doc)">
              {{ exporting === doc.id ? 'Exporting…' : 'Download .docx' }}
            </button>
            <button class="btn btn-danger" type="button" @click="remove(doc)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
