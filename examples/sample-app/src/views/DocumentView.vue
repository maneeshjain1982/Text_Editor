<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { RichEditor } from '@local/rich-editor'
import { documentsApi, type DocumentRecord } from '../api/documents'
import { useTheme } from '../composables/useTheme'

const route = useRoute()
const { theme } = useTheme()
const doc = ref<DocumentRecord>()
const missing = ref(false)

onMounted(async () => {
  doc.value = await documentsApi.get(route.params.id as string)
  missing.value = !doc.value
})
</script>

<template>
  <section class="page">
    <p v-if="missing" class="muted">Document not found. <RouterLink to="/">Back to documents</RouterLink></p>
    <template v-else-if="doc">
      <div class="page-header">
        <h1 data-testid="view-title">{{ doc.title }}</h1>
        <RouterLink :to="`/documents/${doc.id}/edit`" class="btn btn-primary">Edit</RouterLink>
      </div>
      <!-- Integration guide §9: read-only display with the same rendering as the editor -->
      <RichEditor
        :model-value="doc.content"
        content-format="json"
        :editable="false"
        height="auto"
        :theme="theme"
        :features="{ statusBar: false }"
        data-testid="read-only-editor"
      />
    </template>
  </section>
</template>
