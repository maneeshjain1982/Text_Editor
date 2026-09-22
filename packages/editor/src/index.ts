import type { App, Plugin } from 'vue'
import RichEditor from './RichEditor.vue'
import './styles/index.css'

export { RichEditor }
export type * from './types'
export type { JSONContent } from '@tiptap/core'
export type { Messages, MessageKey } from './i18n/messages'
export { defaultMessages } from './i18n/messages'

// Headless utilities — usable without mounting the component.
// DOCX conversion lives in '@local/rich-editor/docx' so the base bundle stays small.
export { toHtmlDocument, toMarkdown } from './services/exporters'
export { buildExtensions } from './extensions'
export { TOOLBAR_PRESETS } from './toolbar/items'

// AI Canvas: browser helpers. Server-side prompt building lives in '@local/rich-editor/ai'.
export { DEFAULT_AI_ACTIONS, createDefaultAiActions } from './ai/actions'
export { createDemoAiAdapter } from './ai/demo'
export { createHttpAiAdapter, type HttpAiAdapterOptions } from './ai/http'

/** Optional global registration: `app.use(RichEditorPlugin)` → `<RichEditor />` everywhere. */
export const RichEditorPlugin: Plugin = {
  install(app: App) {
    app.component('RichEditor', RichEditor)
  },
}

export default RichEditor
