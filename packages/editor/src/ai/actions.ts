import { createTranslator, type MessageKey, type Translate } from '../i18n/messages'
import type { AiQuickAction } from './types'

const ACTIONS: { id: string; label: MessageKey; instruction: string; prefill?: boolean }[] = [
  { id: 'improve', label: 'aiActionImprove', instruction: 'Improve the clarity and flow of this text without changing its meaning.' },
  { id: 'grammar', label: 'aiActionGrammar', instruction: 'Fix spelling, grammar and punctuation only. Do not change anything else.' },
  { id: 'shorter', label: 'aiActionShorter', instruction: 'Make this text shorter and more concise while keeping the key points.' },
  { id: 'longer', label: 'aiActionLonger', instruction: 'Expand this text with more detail and explanation.' },
  { id: 'formal', label: 'aiActionFormal', instruction: 'Rewrite this text in a more formal, professional tone.' },
  { id: 'casual', label: 'aiActionCasual', instruction: 'Rewrite this text in a more casual, friendly tone.' },
  { id: 'simplify', label: 'aiActionSimplify', instruction: 'Rewrite this text in simpler language that is easy to understand.' },
  { id: 'summarize', label: 'aiActionSummarize', instruction: 'Summarize this text in a few sentences.' },
  { id: 'list', label: 'aiActionList', instruction: 'Turn this text into a bulleted list of its key points.' },
  { id: 'table', label: 'aiActionTable', instruction: 'Turn this information into a Markdown table with suitable column headers.' },
  { id: 'translate', label: 'aiActionTranslate', instruction: 'Translate this text to ', prefill: true },
]

/** Quick actions with labels from the editor's messages (so the `messages` prop translates them). */
export function createDefaultAiActions(t: Translate = createTranslator()): AiQuickAction[] {
  return ACTIONS.map((a) => ({ ...a, label: t(a.label) }))
}

/** English default quick actions. Spread and extend them for your own `aiActions`. */
export const DEFAULT_AI_ACTIONS: AiQuickAction[] = createDefaultAiActions()
