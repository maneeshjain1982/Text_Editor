import { reactive, ref, shallowRef, watch, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { Mapping } from '@tiptap/pm/transform'
import type { Transaction } from '@tiptap/pm/state'
import { getAiSuggestionState } from '../extensions/AiSuggestion'
import type { Translate } from '../i18n/messages'
import { AI_LIMITS, buildPrompt } from './prompts'
import { parseChatAnswer, stripCitations } from './chat-parse'
import { rangeToMarkdown } from './convert'
import {
  afterCurrentBlock,
  AiResultError,
  patchToSuggestions,
  scrollToSuggestion,
  suggestMarkdown,
  topLevelBlocks,
  type BlockRef,
} from './controller'
import type { AiAdapter, AiChatMessage, AiRequest } from './types'

export interface ChatCitation {
  id: string
  /** Short text of the cited block, shown in the link. */
  label: string
  from: number
  to: number
  /** The cited block was deleted or the citation is from an earlier session. */
  stale: boolean
}

export interface ChatMessage {
  key: number
  role: 'user' | 'assistant'
  /** Markdown shown to the user (assistant: without the edits block). */
  content: string
  status: 'streaming' | 'done' | 'error'
  citations: ChatCitation[]
  /** Suggestion ids created from this answer's edits. */
  suggestionIds: string[]
  /** Only part of a long document was sent with this question. */
  partial?: boolean
  /** The passage the user had selected when asking. */
  selection?: string
}

export interface ChatControllerOptions {
  editor: ShallowRef<Editor | undefined>
  adapter: () => AiAdapter | undefined
  t: Translate
  title: () => string | undefined
  /** Restored conversation (e.g. from the host's storage). */
  initialHistory?: AiChatMessage[]
  onRequest: (request: AiRequest) => void
  onMessage: (message: AiChatMessage, history: AiChatMessage[]) => void
  onError: (message: string, cause?: unknown) => void
  /** Called when the conversation is cleared. */
  onClear?: () => void
}

let messageKey = 0

/** Conversation with the document: questions, cited answers, and edits as suggestions. */
export function createChatController(opts: ChatControllerOptions) {
  const open = ref(false)
  const busy = ref(false)
  const messages = ref<ChatMessage[]>(
    (opts.initialHistory ?? []).map((m) => ({
      key: ++messageKey,
      role: m.role,
      content: m.content,
      status: 'done',
      // Citations from an earlier session can't be located reliably: shown, but not clickable.
      citations: m.role === 'assistant' ? parseChatAnswer(m.content).citations.map((id) => ({ id, label: id, from: 0, to: 0, stale: true })) : [],
      suggestionIds: [],
    })),
  )
  /** Selected passage attached to the next question. */
  const attached = shallowRef<{ from: number; to: number; text: string } | null>(null)
  /** Suggestion ids still pending in the document (to show per-message review buttons). */
  const pendingIds = ref<Set<string>>(new Set())
  let abort: AbortController | null = null

  // Keep citation positions and pending suggestions in sync with the document.
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    const editor = opts.editor.value
    if (!editor) return
    pendingIds.value = new Set(getAiSuggestionState(editor.state).suggestions.map((s) => s.id))
    if (!transaction.docChanged) return
    for (const message of messages.value) {
      for (const c of message.citations) {
        if (c.stale) continue
        const from = transaction.mapping.map(c.from, 1)
        const to = transaction.mapping.map(c.to, -1)
        if (to <= from) c.stale = true
        else Object.assign(c, { from, to })
      }
    }
    const a = attached.value
    if (a) {
      const from = transaction.mapping.map(a.from, 1)
      const to = transaction.mapping.map(a.to, -1)
      attached.value = to > from ? { ...a, from, to } : null
    }
  }
  watch(
    opts.editor,
    (editor, previous) => {
      previous?.off('transaction', onTransaction)
      editor?.on('transaction', onTransaction)
    },
    { immediate: true },
  )

  const history = (): AiChatMessage[] =>
    messages.value.filter((m) => m.status === 'done').map((m) => ({ role: m.role, content: m.content }))

  function setOpen(value = !open.value) {
    open.value = value
    if (value) attachSelection()
  }

  /** Attach the editor's current selection (if any) to the next question. */
  function attachSelection() {
    const editor = opts.editor.value
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    const text = empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim()
    attached.value = text ? { from, to, text } : null
  }

  function stop() {
    abort?.abort()
    abort = null
  }

  function clear() {
    stop()
    messages.value = []
    busy.value = false
    opts.onClear?.()
  }

  /** Blocks to send: the whole document, or, when too long, the part around the cursor. */
  function blocksToSend(editor: Editor): { blocks: BlockRef[]; partial: boolean } {
    const all = topLevelBlocks(editor)
    const total = all.reduce((n, b) => n + b.markdown.length, 0)
    if (total <= AI_LIMITS.chatDocumentChars) return { blocks: all, partial: false }
    const cursor = editor.state.selection.from
    let center = all.findIndex((b) => b.to >= cursor)
    if (center < 0) center = 0
    const kept = new Set<number>([center])
    let used = all[center].markdown.length
    for (let step = 1; used < AI_LIMITS.chatDocumentChars * 0.95 && (center - step >= 0 || center + step < all.length); step++) {
      for (const i of [center - step, center + step]) {
        if (i < 0 || i >= all.length) continue
        if (used + all[i].markdown.length > AI_LIMITS.chatDocumentChars * 0.95) continue
        kept.add(i)
        used += all[i].markdown.length
      }
    }
    return { blocks: all.filter((_, i) => kept.has(i)), partial: true }
  }

  async function send(question: string): Promise<void> {
    const editor = opts.editor.value
    const adapter = opts.adapter()
    const text = question.trim()
    if (!editor || !adapter || !text || busy.value) return

    const previous = history()
    const selection = attached.value && attached.value.to > attached.value.from ? rangeToMarkdown(editor, attached.value.from, attached.value.to) : undefined
    const { blocks, partial } = blocksToSend(editor)

    const userMessage: ChatMessage = { key: ++messageKey, role: 'user', content: text, status: 'done', citations: [], suggestionIds: [], selection: attached.value?.text }
    const answer = reactive<ChatMessage>({ key: ++messageKey, role: 'assistant', content: '', status: 'streaming', citations: [], suggestionIds: [], partial })
    messages.value = [...messages.value, userMessage, answer]
    attached.value = null
    opts.onMessage({ role: 'user', content: text }, history())

    const base: Omit<AiRequest, 'prompt'> = {
      task: 'chat',
      instruction: text,
      responseFormat: 'chat',
      selection,
      blocks: blocks.map(({ id, markdown }) => ({ id, markdown })),
      messages: previous,
      partial,
      context: { title: opts.title() },
    }
    const request: AiRequest = { ...base, prompt: buildPrompt(base) }
    opts.onRequest(request)

    const controller = new AbortController()
    abort = controller
    busy.value = true
    const mapping = new Mapping()
    const track = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged) mapping.appendMapping(transaction.mapping)
    }
    const startDoc = editor.state.doc
    editor.on('transaction', track)

    let streamed = ''
    try {
      const result = await adapter.complete(request, {
        signal: controller.signal,
        onChunk: (delta) => {
          if (controller.signal.aborted) return
          streamed += delta
          answer.content = parseChatAnswer(streamed).markdown
        },
      })
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const full = (typeof result === 'string' && result ? result : streamed).trim()
      if (!full) throw new AiResultError('empty')
      const parsed = parseChatAnswer(full)
      answer.content = parsed.markdown

      const byId = new Map(blocks.map((b) => [b.id, b]))
      answer.citations = parsed.citations.flatMap((id) => {
        const block = byId.get(id)
        if (!block) return []
        const from = mapping.map(block.from, 1)
        const to = mapping.map(block.to, -1)
        const label = labelFor(block.markdown)
        return [{ id, label, from, to, stale: to <= from }]
      })

      if (parsed.patch) {
        const { suggestions } = await patchToSuggestions(editor, JSON.stringify(parsed.patch), blocks, mapping, startDoc, opts.t('chatChangeLabel'))
        if (suggestions.length) {
          editor.commands.addAiSuggestions(suggestions)
          answer.suggestionIds = suggestions.map((s) => s.id)
          scrollToSuggestion(editor, suggestions[0])
        }
      }
      answer.status = 'done'
      opts.onMessage({ role: 'assistant', content: answer.content }, history())
    } catch (cause) {
      const aborted = controller.signal.aborted || (cause as Error)?.name === 'AbortError'
      if (aborted && answer.content) {
        answer.status = 'done'
        answer.content += `\n\n*${opts.t('chatStopped')}*`
      } else if (aborted) {
        messages.value = messages.value.filter((m) => m !== answer)
      } else {
        answer.status = 'error'
        answer.content = cause instanceof AiResultError ? opts.t('aiErrorEmpty') : opts.t('aiErrorRequest')
        opts.onError(answer.content, cause)
      }
    } finally {
      editor.off('transaction', track)
      if (abort === controller) abort = null
      busy.value = false
    }
  }

  /** Re-ask the question before a failed answer. */
  function retry(message: ChatMessage) {
    const index = messages.value.indexOf(message)
    const question = messages.value[index - 1]
    if (index < 1 || question?.role !== 'user') return
    messages.value = messages.value.slice(0, index - 1)
    return send(question.content)
  }

  function jumpTo(citation: ChatCitation) {
    const editor = opts.editor.value
    if (!editor || citation.stale) return
    editor.chain().setAiFlash({ from: citation.from, to: citation.to }).setTextSelection(citation.from + 1).run()
    const dom = editor.view.nodeDOM(citation.from) as HTMLElement | null
    dom?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setTimeout(() => {
      if (!editor.isDestroyed) editor.commands.setAiFlash(null)
    }, 1600)
  }

  /** Put an answer into the document as a suggestion: below the current block, or replacing the selection. */
  async function useAnswer(message: ChatMessage, how: 'insert' | 'replace') {
    const editor = opts.editor.value
    if (!editor) return
    const markdown = stripCitations(message.content)
    const { selection } = editor.state
    const target = how === 'replace' && !selection.empty ? { from: selection.from, to: selection.to } : { from: afterCurrentBlock(editor), to: afterCurrentBlock(editor) }
    try {
      const { suggestions } = await suggestMarkdown(editor, markdown, target, how === 'replace' ? 'edit-selection' : 'generate', opts.t('chatInsertLabel'))
      if (!suggestions.length) return
      editor.commands.addAiSuggestions(suggestions)
      scrollToSuggestion(editor, suggestions[0])
    } catch (cause) {
      opts.onError(opts.t('aiErrorFormat'), cause)
    }
  }

  const pendingFor = (message: ChatMessage) => message.suggestionIds.filter((id) => pendingIds.value.has(id))

  function resolve(message: ChatMessage, accept: boolean) {
    const editor = opts.editor.value
    if (!editor) return
    const ids = pendingFor(message)
    const chain = editor.chain().focus()
    if (accept) {
      // Accept this message's suggestions only, leaving others pending.
      const others = getAiSuggestionState(editor.state).suggestions.filter((s) => !ids.includes(s.id)).map((s) => s.id)
      if (!others.length) chain.acceptAllAiSuggestions().run()
      else for (const id of ids) editor.chain().acceptAiSuggestion(id).run()
    } else {
      for (const id of ids) chain.rejectAiSuggestion(id)
      chain.run()
    }
  }

  return { open, busy, messages, attached, setOpen, attachSelection, send, stop, clear, retry, jumpTo, useAnswer, pendingFor, resolve, history }
}

export type ChatController = ReturnType<typeof createChatController>

function labelFor(markdown: string): string {
  const text = markdown.replace(/\[[ xX]\]\s/g, '').replace(/[#*_`>|[\]()!]/g, ' ').replace(/^\s*(\d+\.|[-+])\s/gm, '').replace(/\s+/g, ' ').trim()
  return text.length > 40 ? `${text.slice(0, 38)}…` : text || '…'
}

