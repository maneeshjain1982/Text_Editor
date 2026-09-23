import { createTranslator, type MessageKey, type Translate } from '../i18n/messages'
import type { AiQuickAction } from './types'

// Kept deliberately short: anything else goes through "Ask AI".
const ACTIONS: { id: string; label: MessageKey; instruction: string; prefill?: boolean }[] = [
  { id: 'improve', label: 'aiActionImprove', instruction: 'Improve the clarity and flow of this text without changing its meaning.' },
  { id: 'shorter', label: 'aiActionShorter', instruction: 'Make this text shorter and more concise while keeping the key points.' },
  { id: 'longer', label: 'aiActionLonger', instruction: 'Expand this text with more detail and explanation.' },
  { id: 'formal', label: 'aiActionFormal', instruction: 'Rewrite this text in a more formal, professional tone.' },
  { id: 'translate-ko', label: 'aiActionTranslateKo', instruction: 'Translate this text to Korean. Return only the Korean translation.' },
  { id: 'translate-en', label: 'aiActionTranslateEn', instruction: 'Translate this text to English. Return only the English translation.' },
]

/** Quick actions with labels from the editor's messages (so the `messages` prop translates them). */
export function createDefaultAiActions(t: Translate = createTranslator()): AiQuickAction[] {
  return ACTIONS.map((a) => ({ ...a, label: t(a.label) }))
}

/** English default quick actions. Spread and extend them for your own `aiActions`. */
export const DEFAULT_AI_ACTIONS: AiQuickAction[] = createDefaultAiActions()
