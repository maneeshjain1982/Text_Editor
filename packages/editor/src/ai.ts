/**
 * `@local/rich-editor/ai`: AI Canvas helpers with no DOM or Vue dependency, usable in
 * the browser and on a Node backend (build prompts server-side, demo adapter for tests).
 */
export { buildPrompt, responseFormatFor, AI_LIMITS, type PromptInput } from './ai/prompts'
export { createDemoAiAdapter } from './ai/demo'
export { createHttpAiAdapter, type HttpAiAdapterOptions } from './ai/http'
export { DEFAULT_AI_ACTIONS, createDefaultAiActions } from './ai/actions'
export { parseBlockPatch, stripOuterFence } from './ai/parse'
export { parseChatAnswer, stripCitations, type ParsedChatAnswer } from './ai/chat-parse'
export type * from './ai/types'
