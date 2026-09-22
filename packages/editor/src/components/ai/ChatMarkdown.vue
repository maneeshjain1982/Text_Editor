<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { DOMSerializer } from '@tiptap/pm/model'
import { useEditorContext } from '../../context'
import { markdownToFragment } from '../../ai/convert'
import type { ChatCitation } from '../../ai/chat'

/**
 * Renders a chat answer. Markdown goes through the editor schema (never raw HTML), so
 * model output can't inject scripts or markup; [b3] citations become numbered links.
 */
const props = defineProps<{ markdown: string; citations: ChatCitation[] }>()
const emit = defineEmits<{ cite: [citation: ChatCitation] }>()
const ctx = useEditorContext()
const root = ref<HTMLElement>()
let frame = 0
let version = 0

const CITE = /\[(b\d+)\]/g
const HAS_CITE = /\[b\d+\]/

async function render() {
  const editor = ctx.editor.value
  const el = root.value
  if (!editor || !el) return
  const current = ++version
  const fragment = await markdownToFragment(editor.schema, props.markdown || '')
  if (current !== version) return
  const dom = DOMSerializer.fromSchema(editor.schema).serializeFragment(fragment)
  linkCitations(dom)
  el.replaceChildren(dom)
}

function linkCitations(container: Node) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) if (HAS_CITE.test((walker.currentNode as Text).data)) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const parts = node.data.split(CITE) // [text, id, text, id, …]
    const out = document.createDocumentFragment()
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        if (part) out.append(part)
        return
      }
      const index = props.citations.findIndex((c) => c.id === part)
      const citation = props.citations[index]
      if (!citation) return // cited an id we don't know (or still streaming): hide it
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `re-chat-cite${citation.stale ? ' re-chat-cite-stale' : ''}`
      button.textContent = String(index + 1)
      button.title = citation.stale ? ctx.t('chatSourceGone') : citation.label
      button.setAttribute('aria-label', `${ctx.t('chatSources')} ${index + 1}: ${citation.label}`)
      button.addEventListener('click', () => emit('cite', citation))
      out.append(button)
    })
    node.replaceWith(out)
  }
}

watch(
  () => [props.markdown, props.citations.length, props.citations.map((c) => c.stale).join()],
  () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => void render())
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div ref="root" class="re-chat-markdown" />
</template>
