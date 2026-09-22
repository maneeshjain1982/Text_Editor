import { reactive, ref, watch, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { Mapping } from '@tiptap/pm/transform'
import { getAiSuggestionState, type AiSuggestion } from '../extensions/AiSuggestion'
import type { Translate } from '../i18n/messages'
import { AI_LIMITS, buildPrompt, responseFormatFor } from './prompts'
import { parseBlockPatch, stripOuterFence } from './parse'
import { asInline, markdownToFragment, nodeToMarkdown, rangeToMarkdown, textAround } from './convert'
import type { AiAdapter, AiBlock, AiRequest, AiTask } from './types'

export type AiMode = AiTask
export type AiStatus = 'idle' | 'running' | 'review' | 'error'

export interface AiControllerOptions {
  editor: ShallowRef<Editor | undefined>
  adapter: () => AiAdapter | undefined
  t: Translate
  title: () => string | undefined
  onRequest: (request: AiRequest) => void
  onError: (message: string, cause?: unknown) => void
}

interface Range {
  from: number
  to: number
}

let suggestionCounter = 0
const newId = () => `s${Date.now().toString(36)}${(++suggestionCounter).toString(36)}`

/**
 * Runs AI requests for one editor: captures the target range, calls the adapter
 * (with streaming and cancel), and turns the answer into reviewable suggestions.
 */
export function createAiController(opts: AiControllerOptions) {
  const state = reactive({
    open: false,
    mode: 'edit-selection' as AiMode,
    status: 'idle' as AiStatus,
    preview: '',
    message: '',
    /** Instruction of the last request, for Try again and follow-ups. */
    lastInstruction: '',
    lastLabel: '',
    /** Prefilled text for the input (quick actions with `prefill`). */
    draft: '',
    draftVersion: 0,
  })

  let abort: AbortController | null = null
  let range: Range | null = null

  // Kept in sync from editor transactions (works with any Editor instance, reactive or not).
  const pendingCount = ref(0)
  const syncCount = () => {
    const editor = opts.editor.value
    pendingCount.value = editor && !editor.isDestroyed ? getAiSuggestionState(editor.state).suggestions.length : 0
  }
  watch(
    opts.editor,
    (editor, previous) => {
      previous?.off('transaction', syncCount)
      editor?.on('transaction', syncCount)
      syncCount()
    },
    { immediate: true },
  )

  const selectionEmpty = () => {
    const e = opts.editor.value
    return !e || e.state.selection.empty
  }

  function captureRange(mode: AiMode): Range | null {
    const editor = opts.editor.value
    if (!editor) return null
    const { selection, doc } = editor.state
    switch (mode) {
      case 'edit-selection':
        return selection.empty ? null : { from: selection.from, to: selection.to }
      case 'continue':
        return { from: selection.to, to: selection.to }
      case 'generate': {
        if (editor.isEmpty) return { from: 0, to: doc.content.size }
        // Insert after the top-level block containing the cursor.
        const $pos = selection.$to
        const after = $pos.depth > 0 ? $pos.after(1) : $pos.pos
        return { from: after, to: after }
      }
      case 'edit-document':
        return { from: 0, to: doc.content.size }
      case 'chat':
        return null // handled by the chat controller
    }
  }

  /** Open the AI bar. Returns false if the mode needs a selection and there is none. */
  function open(mode: AiMode, draft = ''): boolean {
    const editor = opts.editor.value
    if (!editor) return false
    if (mode === 'edit-selection' && selectionEmpty()) {
      opts.onError(opts.t('aiSelectionRequired'))
      return false
    }
    stop()
    state.open = true
    state.mode = mode
    state.status = pendingCount.value ? 'review' : 'idle'
    state.preview = ''
    state.message = ''
    state.draft = draft
    state.draftVersion++
    range = captureRange(mode)
    editor.commands.setAiTarget(mode === 'edit-selection' && range ? range : null)
    return true
  }

  function close() {
    stop()
    state.open = false
    state.status = 'idle'
    opts.editor.value?.commands.setAiTarget(null)
  }

  function stop() {
    abort?.abort()
    abort = null
    if (state.status === 'running') state.status = 'idle'
  }

  function buildRequest(mode: AiMode, instruction: string, target: Range): AiRequest {
    const editor = opts.editor.value!
    const title = opts.title()
    const request: Omit<AiRequest, 'prompt'> = { task: mode, instruction, responseFormat: responseFormatFor(mode) }
    if (mode === 'edit-document') {
      request.blocks = topLevelBlocks(editor).map(({ id, markdown }) => ({ id, markdown }))
      request.context = { title }
    } else {
      request.context = { ...textAround(editor, target.from, target.to, AI_LIMITS.contextChars), title }
      if (mode === 'edit-selection') request.selection = rangeToMarkdown(editor, target.from, target.to)
    }
    return { ...request, prompt: buildPrompt(request) }
  }

  /**
   * Run a request. `label` names the change in version history (defaults to the instruction).
   * If suggestions from a previous run are pending, they are replaced (follow-up / refine).
   */
  async function run(instruction: string, label?: string, modeOverride?: AiMode): Promise<void> {
    const editor = opts.editor.value
    const adapter = opts.adapter()
    if (!editor || !adapter) return
    const mode = modeOverride ?? state.mode

    // A follow-up while suggestions are pending refines the same target.
    const refining = pendingCount.value > 0 && state.lastInstruction && mode === state.mode
    if (refining) {
      editor.commands.rejectAllAiSuggestions()
      instruction = `${state.lastInstruction}\nThen: ${instruction}`
    }
    // The highlighted target is kept up to date by the suggestion plugin as the document changes.
    const liveTarget = getAiSuggestionState(editor.state).target
    if (mode === 'edit-selection' && liveTarget && !modeOverride) range = liveTarget
    else if (!range || modeOverride || mode === 'edit-document') range = captureRange(mode)
    if (!range) {
      opts.onError(opts.t('aiSelectionRequired'))
      return
    }

    stop()
    const controller = new AbortController()
    abort = controller
    state.mode = mode
    state.status = 'running'
    state.preview = ''
    state.message = ''
    state.lastInstruction = instruction
    state.lastLabel = label ?? (instruction.length > 60 ? `${instruction.slice(0, 57)}…` : instruction)

    const target = range
    const blocks = mode === 'edit-document' ? topLevelBlocks(editor) : []
    const request = buildRequest(mode, instruction, target)
    opts.onRequest(request)

    // Track edits made while the model is working, to map positions afterwards.
    const mapping = new Mapping()
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean; mapping: Mapping } }) => {
      if (transaction.docChanged) mapping.appendMapping(transaction.mapping)
    }
    const startDoc = editor.state.doc
    editor.on('transaction', onTransaction)

    try {
      let streamed = ''
      const result = await adapter.complete(request, {
        signal: controller.signal,
        onChunk: (delta) => {
          if (controller.signal.aborted) return
          streamed += delta
          state.preview = streamed
        },
      })
      if (controller.signal.aborted) return
      const text = (typeof result === 'string' && result ? result : streamed).trim()
      if (!text) throw new AiResultError('empty')
      state.preview = text

      const { suggestions, discarded } =
        mode === 'edit-document'
          ? await patchToSuggestions(editor, text, blocks, mapping, startDoc, state.lastLabel)
          : await textToSuggestions(editor, text, target, mode, mapping, startDoc, state.lastLabel)

      if (controller.signal.aborted) return
      if (!suggestions.length) {
        state.status = 'idle'
        state.message = discarded ? opts.t('aiDiscarded') : opts.t('aiNoChanges')
        return
      }
      editor.chain().setAiTarget(null).addAiSuggestions(suggestions).run()
      state.status = 'review'
      state.message = suggestions.length > 1 ? opts.t('aiReviewMany', { count: suggestions.length }) : opts.t('aiReview')
      scrollToSuggestion(editor, suggestions[0])
    } catch (cause) {
      if (controller.signal.aborted || (cause as Error)?.name === 'AbortError') return
      state.status = 'error'
      state.message =
        cause instanceof AiResultError ? opts.t(cause.message === 'empty' ? 'aiErrorEmpty' : 'aiErrorFormat') : opts.t('aiErrorRequest')
      opts.onError(state.message, cause)
    } finally {
      editor.off('transaction', onTransaction as never)
      if (abort === controller) abort = null
    }
  }

  function retry() {
    if (!state.lastInstruction) return
    const editor = opts.editor.value
    editor?.commands.rejectAllAiSuggestions()
    const instruction = state.lastInstruction
    state.lastInstruction = ''
    // Rejecting doesn't change the document, so the original target range is still valid.
    return run(instruction, state.lastLabel)
  }

  function acceptAll() {
    opts.editor.value?.chain().focus().acceptAllAiSuggestions().run()
  }

  function rejectAll() {
    opts.editor.value?.chain().focus().rejectAllAiSuggestions().run()
  }

  /** Called when the pending count drops to zero (accepted/rejected in the document). */
  function onSuggestionsResolved() {
    if (state.status === 'review') {
      state.status = 'idle'
      state.message = ''
      state.lastInstruction = ''
    }
  }

  return { state, pendingCount, open, close, stop, run, retry, acceptAll, rejectAll, onSuggestionsResolved, selectionEmpty }
}

export type AiController = ReturnType<typeof createAiController>

/** `message` is 'empty' or 'format'. */
export class AiResultError extends Error {}

export interface SuggestionResult {
  suggestions: AiSuggestion[]
  /** True when the target text changed while the AI was working. */
  discarded: boolean
}

export interface BlockRef extends AiBlock {
  from: number
  to: number
}

export function topLevelBlocks(editor: Editor): BlockRef[] {
  const blocks: BlockRef[] = []
  editor.state.doc.forEach((node, offset, index) => {
    const markdown = nodeToMarkdown(editor.schema, node)
    blocks.push({ id: `b${index + 1}`, markdown: markdown || '(empty)', from: offset, to: offset + node.nodeSize })
  })
  return blocks
}

/** Map a range captured at request time to the current document; null if its content changed. */
function mapRange(editor: Editor, mapping: Mapping, startDoc: Editor['state']['doc'], from: number, to: number) {
  const original = startDoc.slice(from, to).content
  const mappedFrom = mapping.map(from, from === to ? -1 : 1)
  const mappedTo = from === to ? mappedFrom : mapping.map(to, -1)
  if (mappedTo < mappedFrom) return null
  const now = editor.state.doc.slice(mappedFrom, mappedTo).content
  return now.eq(original) ? { from: mappedFrom, to: mappedTo, original } : null
}

async function textToSuggestions(
  editor: Editor,
  text: string,
  target: Range,
  mode: AiMode,
  mapping: Mapping,
  startDoc: Editor['state']['doc'],
  label: string,
): Promise<SuggestionResult> {
  const fragment = await markdownToFragment(editor.schema, stripOuterFence(text))
  if (!fragment.size) throw new AiResultError('empty')
  const mapped = mapRange(editor, mapping, startDoc, target.from, target.to)
  if (!mapped) return { suggestions: [], discarded: true }

  const $from = editor.state.doc.resolve(mapped.from)
  const $to = editor.state.doc.resolve(mapped.to)
  const inTextblock = $from.parent.isTextblock && $from.sameParent($to)
  const inline = inTextblock ? asInline(fragment) : null

  let replacement: Fragment = inline ?? fragment
  // "Continue" inside a sentence: separate the new text from the existing text with a space.
  if (inline && mode === 'continue' && mapped.from > $from.start() && !/\s$/.test($from.parent.textBetween(0, $from.parentOffset))) {
    replacement = Fragment.from(editor.schema.text(' ')).append(inline)
  }
  // Identical to what's there: nothing to review.
  if (replacement.eq(mapped.original) || (inline && mapped.original.childCount === 1 && mapped.original.firstChild!.isTextblock && mapped.original.firstChild!.content.eq(inline))) {
    return { suggestions: [], discarded: false }
  }
  return { suggestions: [{ id: newId(), from: mapped.from, to: mapped.to, original: mapped.original, replacement, inline: !!inline, label }], discarded: false }
}

export async function patchToSuggestions(
  editor: Editor,
  text: string,
  blocks: BlockRef[],
  mapping: Mapping,
  startDoc: Editor['state']['doc'],
  label: string,
): Promise<SuggestionResult> {
  const patch = parseBlockPatch(text)
  if (!patch) throw new AiResultError('format')
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const suggestions: AiSuggestion[] = []
  let discarded = false

  for (const edit of patch.edits) {
    if ('after' in edit) {
      const block = byId.get(edit.after)
      if (!block) continue
      const fragment = await markdownToFragment(editor.schema, edit.markdown)
      const mapped = mapRange(editor, mapping, startDoc, block.to, block.to)
      if (!mapped) discarded = true
      else if (fragment.size) suggestions.push({ id: newId(), ...mapped, replacement: fragment, inline: false, label })
      continue
    }
    const block = byId.get(edit.id)
    if (!block) continue
    const mapped = mapRange(editor, mapping, startDoc, block.from, block.to)
    if (!mapped) {
      discarded = true
      continue
    }
    let replacement = 'delete' in edit ? Fragment.empty : await markdownToFragment(editor.schema, edit.markdown)
    replacement = keepBlockAttributes(mapped.original, replacement)
    // Skip "changes" that parse back to identical content.
    if (replacement.eq(mapped.original)) continue
    suggestions.push({ id: newId(), ...mapped, replacement, inline: false, label })
  }
  return { suggestions: suggestions.sort((a, b) => a.from - b.from), discarded: discarded && !suggestions.length }
}

/**
 * Markdown can't express alignment, indent or line spacing. When one block is replaced by
 * one block of the same type, carry those attributes over so the layout doesn't change.
 */
const LAYOUT_ATTRS = ['textAlign', 'indent', 'lineHeight']
function keepBlockAttributes(original: Fragment, replacement: Fragment): Fragment {
  if (original.childCount !== 1 || replacement.childCount !== 1) return replacement
  const before = original.firstChild!
  const after = replacement.firstChild!
  if (before.type !== after.type || !before.isTextblock) return replacement
  const attrs = { ...after.attrs }
  for (const name of LAYOUT_ATTRS) if (name in before.attrs && name in attrs) attrs[name] = before.attrs[name]
  return Fragment.from(after.type.create(attrs, after.content, after.marks))
}

/** Turn Markdown (e.g. a chat answer) into a suggestion for a range of the current document. */
export function suggestMarkdown(editor: Editor, markdown: string, target: Range, mode: AiMode, label: string) {
  return textToSuggestions(editor, markdown, target, mode, new Mapping(), editor.state.doc, label)
}

/** Position after the top-level block containing the cursor (where generated content is inserted). */
export function afterCurrentBlock(editor: Editor): number {
  const $pos = editor.state.selection.$to
  return $pos.depth > 0 ? $pos.after(1) : $pos.pos
}

export function scrollToSuggestion(editor: Editor, s: AiSuggestion) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return
    const el = editor.view.dom.querySelector(`[data-suggestion-id="${s.id}"]`)
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  })
}
