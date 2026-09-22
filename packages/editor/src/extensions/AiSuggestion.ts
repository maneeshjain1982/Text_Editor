import { Extension } from '@tiptap/core'
import { DOMSerializer, Fragment, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * AI suggestions: proposed replacements shown inline (old text struck through, new
 * content highlighted) until accepted or rejected. Suggestions live in plugin state, not
 * in the document, so v-model, exports and autosave only ever contain accepted content.
 */
export interface AiSuggestion {
  id: string
  from: number
  to: number
  /** Document content in [from, to] when the suggestion was made; if it changes, the suggestion is dropped. */
  original: Fragment
  replacement: Fragment
  /** `true`: replacement is inline content that merges into the surrounding paragraph. */
  inline: boolean
  /** What produced it, e.g. "Make shorter" (used as the version label). */
  label: string
}

export interface AiSuggestionState {
  suggestions: AiSuggestion[]
  /** Range highlighted while the user writes an instruction for it. */
  target: { from: number; to: number } | null
  /** Range briefly highlighted when a chat citation is clicked. */
  flash: { from: number; to: number } | null
}

export interface AiSuggestionOptions {
  label: (key: 'aiAccept' | 'aiReject' | 'aiSuggestion') => string
  /** Called right before accepted content is applied (used to snapshot a version). */
  onBeforeApply: (label: string) => void
  /** Called after suggestions are accepted. */
  onApplied: (count: number) => void
  /** Called when a suggestion is dropped because the text it covers changed. */
  onDiscarded: () => void
}

type Meta =
  | { type: 'add'; suggestions: AiSuggestion[] }
  | { type: 'remove'; ids: string[] }
  | { type: 'clear' }
  | { type: 'target'; target: { from: number; to: number } | null }
  | { type: 'flash'; flash: { from: number; to: number } | null }

export const aiSuggestionKey = new PluginKey<AiSuggestionState>('aiSuggestion')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiSuggestion: {
      addAiSuggestions: (suggestions: AiSuggestion[]) => ReturnType
      acceptAiSuggestion: (id: string) => ReturnType
      rejectAiSuggestion: (id: string) => ReturnType
      acceptAllAiSuggestions: () => ReturnType
      rejectAllAiSuggestions: () => ReturnType
      setAiTarget: (target: { from: number; to: number } | null) => ReturnType
      setAiFlash: (flash: { from: number; to: number } | null) => ReturnType
    }
  }
}

export const getAiSuggestionState = (state: EditorState): AiSuggestionState =>
  aiSuggestionKey.getState(state) ?? { suggestions: [], target: null, flash: null }

/** Apply suggestions to a transaction, last first so earlier positions stay valid. */
function applySuggestions(tr: Transaction, list: AiSuggestion[]) {
  for (const s of [...list].sort((a, b) => b.from - a.from)) {
    if (s.inline) tr.replaceWith(s.from, s.to, s.replacement)
    else tr.replaceRange(s.from, s.to, new Slice(s.replacement, 0, 0))
  }
}

export const AiSuggestionExtension = Extension.create<AiSuggestionOptions>({
  name: 'aiSuggestion',

  addOptions() {
    return {
      label: (key) => ({ aiAccept: 'Accept', aiReject: 'Reject', aiSuggestion: 'AI suggestion' })[key],
      onBeforeApply: () => {},
      onApplied: () => {},
      onDiscarded: () => {},
    }
  },

  addCommands() {
    const accept = (list: AiSuggestion[], dispatch: ((tr: Transaction) => void) | undefined, tr: Transaction) => {
      if (!list.length) return false
      if (dispatch) {
        const labels = [...new Set(list.map((s) => s.label))]
        this.options.onBeforeApply(labels.join(', '))
        applySuggestions(tr, list)
        tr.setMeta(aiSuggestionKey, { type: 'remove', ids: list.map((s) => s.id) } satisfies Meta)
        tr.scrollIntoView()
        dispatch(tr)
        this.options.onApplied(list.length)
      }
      return true
    }
    const remove = (ids: string[], dispatch: ((tr: Transaction) => void) | undefined, tr: Transaction) => {
      if (!ids.length) return false
      if (dispatch) dispatch(tr.setMeta(aiSuggestionKey, { type: 'remove', ids } satisfies Meta).setMeta('addToHistory', false))
      return true
    }

    return {
      addAiSuggestions:
        (suggestions) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(aiSuggestionKey, { type: 'add', suggestions } satisfies Meta).setMeta('addToHistory', false))
          return true
        },
      acceptAiSuggestion:
        (id) =>
        ({ state, tr, dispatch }) =>
          accept(getAiSuggestionState(state).suggestions.filter((s) => s.id === id), dispatch, tr),
      rejectAiSuggestion:
        (id) =>
        ({ tr, dispatch }) =>
          remove([id], dispatch, tr),
      acceptAllAiSuggestions:
        () =>
        ({ state, tr, dispatch }) =>
          accept(getAiSuggestionState(state).suggestions, dispatch, tr),
      rejectAllAiSuggestions:
        () =>
        ({ state, tr, dispatch }) =>
          remove(getAiSuggestionState(state).suggestions.map((s) => s.id), dispatch, tr),
      setAiTarget:
        (target) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(aiSuggestionKey, { type: 'target', target } satisfies Meta).setMeta('addToHistory', false))
          return true
        },
      setAiFlash:
        (flash) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(aiSuggestionKey, { type: 'flash', flash } satisfies Meta).setMeta('addToHistory', false))
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      // Esc rejects suggestions only while some are pending; otherwise the key falls through.
      Escape: () => (getAiSuggestionState(this.editor.state).suggestions.length ? this.editor.commands.rejectAllAiSuggestions() : false),
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const options = this.options

    const renderWidget = (s: AiSuggestion) => () => {
      const doc = document
      const wrap = doc.createElement(s.inline ? 'span' : 'div')
      wrap.className = `re-ai-added ${s.inline ? 're-ai-added-inline' : 're-ai-added-block'}`
      wrap.setAttribute('data-suggestion-id', s.id)
      wrap.contentEditable = 'false'
      wrap.setAttribute('role', 'group')
      wrap.setAttribute('aria-label', options.label('aiSuggestion'))
      const content = doc.createElement(s.inline ? 'span' : 'div')
      content.className = 're-ai-added-content'
      content.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(s.replacement))
      wrap.appendChild(content)

      const bar = doc.createElement('span')
      bar.className = 're-ai-actions'
      const button = (key: 'aiAccept' | 'aiReject', run: () => void) => {
        const b = doc.createElement('button')
        b.type = 'button'
        b.className = `re-ai-action re-ai-${key === 'aiAccept' ? 'accept' : 'reject'}`
        b.textContent = options.label(key)
        b.addEventListener('mousedown', (e) => e.preventDefault())
        b.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          run()
        })
        return b
      }
      bar.append(
        button('aiAccept', () => editor.chain().focus().acceptAiSuggestion(s.id).run()),
        button('aiReject', () => editor.chain().focus().rejectAiSuggestion(s.id).run()),
      )
      wrap.appendChild(bar)
      return wrap
    }

    return [
      new Plugin<AiSuggestionState>({
        key: aiSuggestionKey,
        state: {
          init: () => ({ suggestions: [], target: null, flash: null }),
          apply(tr, value) {
            const meta = tr.getMeta(aiSuggestionKey) as Meta | undefined
            let { suggestions, target, flash } = value

            if (tr.docChanged) {
              let dropped = false
              suggestions = suggestions.flatMap((s) => {
                const from = tr.mapping.map(s.from, s.from === s.to ? -1 : 1)
                const to = s.from === s.to ? from : tr.mapping.map(s.to, -1)
                const unchanged = to >= from && to <= tr.doc.content.size && tr.doc.slice(from, to).content.eq(s.original)
                if (!unchanged) {
                  // Accepting removes its own suggestions in the same transaction; don't report those.
                  const removedByMeta = meta?.type === 'remove' && meta.ids.includes(s.id)
                  if (!removedByMeta) dropped = true
                  return []
                }
                return [{ ...s, from, to }]
              })
              if (dropped) queueMicrotask(() => options.onDiscarded())
              if (target) {
                const from = tr.mapping.map(target.from, 1)
                const to = tr.mapping.map(target.to, -1)
                target = to > from ? { from, to } : null
              }
              if (flash) {
                const from = tr.mapping.map(flash.from, 1)
                const to = tr.mapping.map(flash.to, -1)
                flash = to > from ? { from, to } : null
              }
            }

            if (meta?.type === 'add') suggestions = [...suggestions, ...meta.suggestions]
            if (meta?.type === 'remove') suggestions = suggestions.filter((s) => !meta.ids.includes(s.id))
            if (meta?.type === 'clear') suggestions = []
            if (meta?.type === 'target') target = meta.target
            if (meta?.type === 'flash') flash = meta.flash
            return { suggestions, target, flash }
          },
        },
        props: {
          decorations(state) {
            const { suggestions, target, flash } = getAiSuggestionState(state)
            if (!suggestions.length && !target && !flash) return null
            const decos: Decoration[] = []
            if (flash) {
              // Highlight whole blocks (node decoration), which also covers tables and images.
              state.doc.nodesBetween(flash.from, flash.to, (node, pos) => {
                if (pos >= flash.from && pos + node.nodeSize <= flash.to) {
                  decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 're-ai-flash' }))
                  return false
                }
                return true
              })
            }
            if (target && !suggestions.length) decos.push(Decoration.inline(target.from, target.to, { class: 're-ai-target' }))
            for (const s of suggestions) {
              if (s.to > s.from) {
                decos.push(Decoration.inline(s.from, s.to, { class: 're-ai-removed' }))
                state.doc.nodesBetween(s.from, s.to, (node, pos) => {
                  if (node.isBlock && node.isAtom && pos >= s.from && pos + node.nodeSize <= s.to) {
                    decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 're-ai-removed-node' }))
                  }
                })
              }
              decos.push(Decoration.widget(s.to, renderWidget(s), { key: `ai-${s.id}`, side: 1, ignoreSelection: true, stopEvent: () => true }))
            }
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
