import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/extensions'
import { getAiSuggestionState } from '../src/extensions/AiSuggestion'
import { DEFAULT_FEATURES } from '../src/defaults'
import { buildPrompt, AI_LIMITS } from '../src/ai/prompts'
import { parseChatAnswer, stripCitations } from '../src/ai/chat-parse'
import { createChatController } from '../src/ai/chat'
import { createDemoAiAdapter } from '../src/ai/demo'
import { createTranslator } from '../src/i18n/messages'
import type { AiAdapter, AiChatMessage, AiRequest } from '../src/ai/types'

const DOC =
  '<h1>Plan</h1><p>We can\'t ship before March.</p><h2>Next steps</h2><ol><li><p>Hire two engineers</p></li><li><p>Book the launch venue</p></li></ol><p>The budget is 40k.</p>'

let editor: Editor | undefined
afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function createEditor(content = DOC) {
  editor = new Editor({
    content,
    extensions: buildExtensions({
      placeholder: () => '',
      features: { ...DEFAULT_FEATURES, images: false },
      image: { maxImageSize: 1024, onError: () => {} },
    }),
  })
  return editor
}

const t = createTranslator()
function makeChat(e: Editor, adapter: AiAdapter = createDemoAiAdapter({ delayMs: 0 }), initialHistory?: AiChatMessage[]) {
  const requests: AiRequest[] = []
  const saved: AiChatMessage[][] = []
  const errors: string[] = []
  const chat = createChatController({
    editor: shallowRef(e),
    adapter: () => adapter,
    t,
    title: () => 'Plan',
    initialHistory,
    onRequest: (r) => requests.push(r),
    onMessage: (_m, history) => saved.push(history),
    onError: (m) => errors.push(m),
  })
  return { chat, requests, saved, errors }
}

describe('chat answer parsing', () => {
  it('separates the answer, its citations and an edits block', () => {
    const parsed = parseChatAnswer('Ship date moved [b2]. Owners are listed [b4][b2].\n\n```edits\n{"edits":[{"id":"b2","markdown":"New text"}]}\n```')
    expect(parsed.markdown).toBe('Ship date moved [b2]. Owners are listed [b4][b2].')
    expect(parsed.citations).toEqual(['b2', 'b4'])
    expect(parsed.patch?.edits).toEqual([{ id: 'b2', markdown: 'New text' }])
  })

  it('hides an unfinished edits block while streaming', () => {
    expect(parseChatAnswer('Done [b1].\n\n```edits\n{"edits":[{"id"').markdown).toBe('Done [b1].')
  })

  it('strips citations for copy/insert', () => {
    expect(stripCitations('Budget is 40k [b5]. Venue booked [b4][b5].')).toBe('Budget is 40k. Venue booked.')
  })
})

describe('chat prompt', () => {
  it('puts the document in the system prompt and history as turns', () => {
    const p = buildPrompt({
      task: 'chat',
      instruction: 'And the budget?',
      blocks: [{ id: 'b1', markdown: '# Plan' }],
      messages: [
        { role: 'user', content: 'When do we ship?' },
        { role: 'assistant', content: 'In March [b1].' },
      ],
    })
    expect(p.system).toContain('[b1]\n# Plan')
    expect(p.system).toContain('Answer from the document only')
    expect(p.user).toBe('And the budget?')
    expect(p.history).toHaveLength(2)
  })

  it('keeps only the most recent turns', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }))
    const p = buildPrompt({ task: 'chat', instruction: 'q', blocks: [], messages: many })
    expect(p.history).toHaveLength(AI_LIMITS.chatTurns * 2)
    expect(p.history!.at(-1)!.content).toBe('m49')
  })
})

describe('chat controller', () => {
  it('answers with citations that point at the source blocks, and records history', async () => {
    const e = createEditor()
    const { chat, requests, saved } = makeChat(e)
    await chat.send('What are the action items?')

    expect(requests[0].task).toBe('chat')
    expect(requests[0].blocks?.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
    const answer = chat.messages.value[1]
    expect(answer.status).toBe('done')
    expect(answer.content).toContain('Hire two engineers [b4]')
    expect(answer.citations.map((c) => c.id)).toEqual(['b4'])
    const c = answer.citations[0]
    expect(e.state.doc.nodeAt(c.from)?.type.name).toBe('orderedList')
    expect(saved.at(-1)).toHaveLength(2)

    // Follow-up questions send the earlier turns
    await chat.send('What does the document say about budget?')
    expect(requests[1].messages).toHaveLength(2)
    expect(chat.messages.value[3].content).toContain('The budget is 40k." [b5]')
  })

  it('citations follow edits and become stale when their block is deleted', async () => {
    const e = createEditor()
    const { chat } = makeChat(e)
    await chat.send('What does it say about the budget?')
    const citation = chat.messages.value[1].citations[0]
    const before = citation.from
    e.commands.insertContentAt(0, '<p>Intro</p>')
    await nextTick()
    expect(citation.from).toBeGreaterThan(before)
    e.commands.deleteRange({ from: citation.from, to: citation.to })
    expect(citation.stale).toBe(true)
  })

  it('turns requested changes into suggestions and lets the message accept them', async () => {
    const e = createEditor()
    const { chat } = makeChat(e)
    await chat.send('Make the opening more formal')
    const answer = chat.messages.value[1]
    expect(answer.content).not.toContain('```edits')
    expect(answer.suggestionIds).toHaveLength(1)
    expect(getAiSuggestionState(e.state).suggestions).toHaveLength(1)
    expect(e.getText()).toContain("We can't ship") // not applied yet
    expect(chat.pendingFor(answer)).toHaveLength(1)

    chat.resolve(answer, true)
    expect(e.getText()).toContain('We cannot ship before March.')
    expect(chat.pendingFor(answer)).toHaveLength(0)
  })

  it('inserts an answer as a suggestion, without citations', async () => {
    const e = createEditor()
    const { chat } = makeChat(e)
    await chat.send('Summarize this')
    e.commands.setTextSelection(2)
    await chat.useAnswer(chat.messages.value[1], 'insert')
    const [s] = getAiSuggestionState(e.state).suggestions
    expect(s).toBeTruthy()
    e.commands.acceptAllAiSuggestions()
    expect(e.getHTML()).toContain('<p>Summary:</p>')
    expect(e.getHTML()).not.toContain('[b')
  })

  it('sends the selected passage with the question', async () => {
    const e = createEditor()
    let from = 0
    e.state.doc.descendants((n, pos) => {
      if (n.isText && n.text?.startsWith('The budget')) from = pos
    })
    e.commands.setTextSelection({ from, to: from + 10 })
    const { chat, requests } = makeChat(e)
    chat.setOpen(true)
    expect(chat.attached.value?.text).toBe('The budget')
    await chat.send('Is this final?')
    expect(requests[0].selection).toBe('The budget')
    expect(chat.messages.value[0].selection).toBe('The budget')
    expect(chat.attached.value).toBeNull()
  })

  it('sends only part of a very long document, around the cursor', async () => {
    const paragraph = `<p>${'Lorem ipsum dolor sit amet. '.repeat(200)}</p>`
    const e = createEditor(paragraph.repeat(40)) // ~220k characters
    const { chat, requests } = makeChat(e)
    await chat.send('What is this about?')
    expect(requests[0].partial).toBe(true)
    const sent = requests[0].blocks!.reduce((n, b) => n + b.markdown.length, 0)
    expect(sent).toBeLessThanOrEqual(AI_LIMITS.chatDocumentChars)
    expect(chat.messages.value[1].partial).toBe(true)
  })

  it('shows failures on the answer and retries the same question', async () => {
    const e = createEditor()
    let calls = 0
    const flaky: AiAdapter = {
      complete: async (r, o) => {
        if (++calls === 1) throw new Error('503')
        return createDemoAiAdapter({ delayMs: 0 }).complete(r, o)
      },
    }
    const { chat, errors } = makeChat(e, flaky)
    await chat.send('What does it say about the budget?')
    expect(chat.messages.value[1].status).toBe('error')
    expect(errors).toEqual([t('aiErrorRequest')])
    await chat.retry(chat.messages.value[1])
    expect(chat.messages.value).toHaveLength(2)
    expect(chat.messages.value[1].status).toBe('done')
  })

  it('restores earlier history with non-clickable citations', () => {
    const e = createEditor()
    const { chat } = makeChat(e, undefined, [
      { role: 'user', content: 'Budget?' },
      { role: 'assistant', content: 'It is 40k [b5].' },
    ])
    expect(chat.messages.value).toHaveLength(2)
    expect(chat.messages.value[1].citations[0].stale).toBe(true)
  })
})
