import { afterEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { Editor } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { buildExtensions } from '../src/extensions'
import { getAiSuggestionState, type AiSuggestion } from '../src/extensions/AiSuggestion'
import { DEFAULT_FEATURES } from '../src/defaults'
import { buildPrompt } from '../src/ai/prompts'
import { parseBlockPatch, stripOuterFence } from '../src/ai/parse'
import { createDemoAiAdapter, demoResponse } from '../src/ai/demo'
import { createAiController } from '../src/ai/controller'
import { markdownToFragment } from '../src/ai/convert'
import { createTranslator } from '../src/i18n/messages'
import type { AiAdapter, AiRequest } from '../src/ai/types'

let editor: Editor | undefined
const applied = vi.fn()
const snapshots: string[] = []

function createEditor(content: string) {
  editor = new Editor({
    content,
    extensions: buildExtensions({
      placeholder: () => '',
      features: { ...DEFAULT_FEATURES, images: false },
      image: { maxImageSize: 1024, onError: () => {} },
      ai: { onBeforeApply: (label) => snapshots.push(label), onApplied: applied },
    }),
  })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = undefined
  applied.mockReset()
  snapshots.length = 0
})

const findText = (e: Editor, text: string) => {
  let found = -1
  e.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text)
  })
  if (found < 0) throw new Error(`"${text}" not found`)
  return { from: found, to: found + text.length }
}

function suggestion(e: Editor, from: number, to: number, replacement: Fragment, inline: boolean): AiSuggestion {
  return { id: `t${from}`, from, to, original: e.state.doc.slice(from, to).content, replacement, inline, label: 'Test' }
}

describe('prompts', () => {
  it('builds a selection prompt that only asks for the replacement', () => {
    const p = buildPrompt({ task: 'edit-selection', instruction: 'Make it formal', selection: 'hey there', context: { before: 'A', after: 'B' } })
    expect(p.system).toContain('rewrite ONLY the passage inside <selection>')
    expect(p.user).toContain('<selection>hey there</selection>')
    expect(p.user).toContain('Instruction: Make it formal')
  })

  it('asks for a JSON block patch for whole-document edits and appends extra system text', () => {
    const p = buildPrompt({ task: 'edit-document', instruction: 'Shorter', blocks: [{ id: 'b1', markdown: '# Title' }] }, 'Use British English.')
    expect(p.system).toContain('Respond with JSON only')
    expect(p.system).toContain('Use British English.')
    expect(p.user).toContain('[b1]\n# Title')
  })

  it('clips long context', () => {
    const p = buildPrompt({ task: 'continue', instruction: '', context: { before: 'x'.repeat(10_000) } })
    expect(p.user.length).toBeLessThan(3000)
  })
})

describe('response parsing', () => {
  it('strips a code fence around the whole answer', () => {
    expect(stripOuterFence('```markdown\n# Hi\n```')).toBe('# Hi')
    expect(stripOuterFence('Plain text')).toBe('Plain text')
  })

  it('parses block patches, tolerating fences and dropping invalid edits', () => {
    const patch = parseBlockPatch('```json\n{"edits":[{"id":"b1","markdown":"x"},{"id":"b2","delete":true},{"after":"b3","markdown":"y"},{"bogus":1}]}\n```')
    expect(patch?.edits).toHaveLength(3)
    expect(parseBlockPatch('not json')).toBeNull()
  })

  it('converts Markdown (tables, task lists) through the schema and drops scripts', async () => {
    const e = createEditor('<p></p>')
    const fragment = await markdownToFragment(e.schema, '| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n<script>alert(1)</script>')
    const types: string[] = []
    fragment.forEach((n) => types.push(n.type.name))
    expect(types).toContain('table')
    expect(types).toContain('taskList')
    expect(JSON.stringify(fragment.toJSON())).not.toContain('alert')
  })
})

describe('suggestions', () => {
  it('shows a suggestion without changing the document, then accepts it as one undo step', () => {
    const e = createEditor('<p>The quick fox.</p>')
    const { from, to } = findText(e, 'quick')
    e.commands.addAiSuggestions([suggestion(e, from, to, Fragment.from(e.schema.text('slow')), true)])
    expect(e.getText()).toBe('The quick fox.')
    expect(getAiSuggestionState(e.state).suggestions).toHaveLength(1)

    e.commands.acceptAiSuggestion(`t${from}`)
    expect(e.getText()).toBe('The slow fox.')
    expect(getAiSuggestionState(e.state).suggestions).toHaveLength(0)
    expect(snapshots).toEqual(['Test'])
    expect(applied).toHaveBeenCalledWith(1)

    e.commands.undo()
    expect(e.getText()).toBe('The quick fox.')
  })

  it('rejects without touching the document', () => {
    const e = createEditor('<p>Keep me.</p>')
    const { from, to } = findText(e, 'Keep')
    e.commands.addAiSuggestions([suggestion(e, from, to, Fragment.from(e.schema.text('Drop')), true)])
    e.commands.rejectAllAiSuggestions()
    expect(e.getText()).toBe('Keep me.')
    expect(snapshots).toEqual([])
  })

  it('follows edits elsewhere and is discarded when its own text changes', () => {
    const e = createEditor('<p>Alpha beta gamma.</p>')
    const { from, to } = findText(e, 'gamma')
    e.commands.addAiSuggestions([suggestion(e, from, to, Fragment.from(e.schema.text('delta')), true)])

    e.commands.insertContentAt(1, 'New ')
    const [s] = getAiSuggestionState(e.state).suggestions
    expect(e.state.doc.textBetween(s.from, s.to)).toBe('gamma')

    e.commands.insertContentAt(s.from + 2, 'X')
    expect(getAiSuggestionState(e.state).suggestions).toHaveLength(0)
  })

  it('replaces whole blocks and accepts several suggestions at once', async () => {
    const e = createEditor('<p>One.</p><p>Two.</p><p>Three.</p>')
    const blocks: { from: number; to: number }[] = []
    e.state.doc.forEach((node, offset) => blocks.push({ from: offset, to: offset + node.nodeSize }))
    const replacement = await markdownToFragment(e.schema, '## First')
    e.commands.addAiSuggestions([
      suggestion(e, blocks[0].from, blocks[0].to, replacement, false),
      { ...suggestion(e, blocks[2].from, blocks[2].to, Fragment.empty, false), id: 'del' },
    ])
    e.commands.acceptAllAiSuggestions()
    expect(e.getHTML()).toBe('<h2>First</h2><p>Two.</p>')
    expect(applied).toHaveBeenCalledWith(2)
  })
})

describe('AI controller with the demo adapter', () => {
  const t = createTranslator()
  const make = (e: Editor, adapter: AiAdapter = createDemoAiAdapter({ delayMs: 0 })) => {
    const requests: AiRequest[] = []
    const errors: string[] = []
    const controller = createAiController({
      editor: shallowRef(e),
      adapter: () => adapter,
      t,
      title: () => 'Report',
      onRequest: (r) => requests.push(r),
      onError: (m) => errors.push(m),
    })
    return { controller, requests, errors }
  }

  it('edits only the selection and keeps the rest of the document', async () => {
    const e = createEditor('<h1>Title</h1><p>We can\'t get a lot of big wins.</p><p>Untouched.</p>')
    const { from, to } = findText(e, "We can't get a lot of big wins.")
    e.commands.setTextSelection({ from, to })
    const { controller, requests } = make(e)
    expect(controller.open('edit-selection')).toBe(true)
    await controller.run('Make it more formal')

    expect(requests[0].task).toBe('edit-selection')
    expect(requests[0].selection).toBe("We can't get a lot of big wins.")
    expect(requests[0].prompt.user).toContain('Document title: Report')
    expect(controller.state.status).toBe('review')
    expect(controller.pendingCount.value).toBe(1)

    controller.acceptAll()
    expect(e.getHTML()).toBe('<h1>Title</h1><p>We cannot obtain a considerable amount of significant wins.</p><p>Untouched.</p>')
  })

  it('whole-document edits only change the blocks named in the patch', async () => {
    const e = createEditor("<h1>Plan</h1><p>It's great.</p><p>We won't stop.</p>")
    const { controller, requests } = make(e)
    controller.open('edit-document')
    await controller.run('More formal')
    expect(requests[0].blocks?.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
    expect(controller.pendingCount.value).toBe(2)
    controller.acceptAll()
    expect(e.getHTML()).toBe('<h1>Plan</h1><p>It is excellent.</p><p>We will not stop.</p>')
  })

  it('says so when the AI returns the text unchanged, instead of showing an identical suggestion', async () => {
    const e = createEditor('<p>Nothing to formalize here.</p>')
    e.commands.setTextSelection({ from: 1, to: e.state.doc.content.size - 1 })
    const same: AiAdapter = { complete: async (r) => r.selection ?? '' }
    const { controller } = make(e, same)
    controller.open('edit-selection')
    await controller.run('More formal')
    expect(controller.pendingCount.value).toBe(0)
    expect(controller.state.message).toBe(t('aiNoChanges'))
  })

  it('discards the answer when the selected text changed while the AI was working', async () => {
    const e = createEditor('<p>Original words.</p>')
    e.commands.setTextSelection({ from: 1, to: 9 })
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const slow: AiAdapter = { complete: async () => (await gate, 'Replacement') }
    const { controller } = make(e, slow)
    controller.open('edit-selection')
    const pending = controller.run('Rewrite')
    e.commands.insertContentAt(3, 'X')
    release()
    await pending
    expect(controller.pendingCount.value).toBe(0)
    expect(controller.state.message).toBe(t('aiDiscarded'))
  })

  it('keeps alignment when a block is rewritten', async () => {
    const e = createEditor('<p style="text-align: center">Centered text here.</p>')
    const { controller } = make(e)
    controller.open('edit-document')
    await controller.run('Improve it')
    controller.acceptAll()
    expect(e.getHTML()).toBe('<p style="text-align: center;">Centered text here. (revised)</p>')
  })

  it('generates into an empty document', async () => {
    const e = createEditor('')
    const { controller } = make(e)
    controller.open('generate')
    await controller.run('Write a project update')
    controller.acceptAll()
    expect(e.getHTML()).toContain('<h1>Project update</h1>')
    expect(e.getHTML()).toContain('<table')
  })

  it('continues writing inside the paragraph', async () => {
    const e = createEditor('<p>We finished the first phase.</p>')
    e.commands.setTextSelection(e.state.doc.content.size - 1)
    const { controller } = make(e)
    controller.open('continue')
    await controller.run('')
    controller.acceptAll()
    expect(e.getHTML()).toMatch(/^<p>We finished the first phase\. Building on this/)
  })

  it('reports adapter failures and supports stop', async () => {
    const e = createEditor('<p>Text here.</p>')
    e.commands.setTextSelection({ from: 1, to: 5 })
    const failing: AiAdapter = { complete: async () => Promise.reject(new Error('503')) }
    const { controller, errors } = make(e, failing)
    controller.open('edit-selection')
    await controller.run('Shorter')
    expect(controller.state.status).toBe('error')
    expect(errors).toEqual([t('aiErrorRequest')])

    const slow = make(e, createDemoAiAdapter({ delayMs: 50, chunkSize: 2 }))
    slow.controller.open('edit-selection')
    const pending = slow.controller.run('Shorter')
    slow.controller.stop()
    await pending
    expect(slow.controller.pendingCount.value).toBe(0)
    expect(slow.errors).toEqual([])
  })
})

describe('HTTP adapter', () => {
  const request: AiRequest = { task: 'continue', instruction: '', responseFormat: 'markdown', prompt: { system: 's', user: 'u' } }
  const ndjsonResponse = (lines: string[], chunkAt = 7) => {
    const text = lines.map((l) => `${l}\n`).join('')
    const bytes = new TextEncoder().encode(text)
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        // Split mid-line to exercise buffering.
        for (let i = 0; i < bytes.length; i += chunkAt) c.enqueue(bytes.slice(i, i + chunkAt))
        c.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('streams NDJSON chunks and posts the request', async () => {
    const fetchMock = vi.fn(async () => ndjsonResponse(['{"type":"chunk","text":"Hello "}', '{"type":"chunk","text":"world"}', '{"type":"done"}']))
    vi.stubGlobal('fetch', fetchMock)
    const { createHttpAiAdapter } = await import('../src/ai/http')
    const chunks: string[] = []
    const out = await createHttpAiAdapter({ url: '/api/ai/complete', headers: () => ({ Authorization: 'Bearer t' }) }).complete(request, {
      signal: new AbortController().signal,
      onChunk: (d) => chunks.push(d),
    })
    expect(out).toBe('Hello world')
    expect(chunks).toEqual(['Hello ', 'world'])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/complete')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
    expect(JSON.parse(init.body as string).task).toBe('continue')
  })

  it('throws server-reported errors', async () => {
    const { createHttpAiAdapter } = await import('../src/ai/http')
    vi.stubGlobal('fetch', async () => ndjsonResponse(['{"type":"error","message":"The AI service is busy."}']))
    await expect(createHttpAiAdapter({ url: '/x' }).complete(request, { signal: new AbortController().signal, onChunk: () => {} })).rejects.toThrow('The AI service is busy.')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'Too many AI requests.' }), { status: 429 }))
    await expect(createHttpAiAdapter({ url: '/x' }).complete(request, { signal: new AbortController().signal, onChunk: () => {} })).rejects.toThrow('Too many AI requests.')
  })
})

describe('demo adapter', () => {
  it('returns a JSON patch for edit-document requests', () => {
    const out = demoResponse({ task: 'edit-document', instruction: 'shorter', responseFormat: 'block-patch', blocks: [{ id: 'b1', markdown: 'First sentence. Second one.' }], prompt: { system: '', user: '' } })
    expect(JSON.parse(out)).toEqual({ edits: [{ id: 'b1', markdown: 'First sentence.' }] })
  })
})
