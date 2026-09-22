import type { Editor, Extensions, JSONContent } from '@tiptap/core'
import type { Messages } from './i18n/messages'

export type ContentFormat = 'html' | 'json'
export type EditorTheme = 'light' | 'dark' | 'auto'
export type EditorLayout = 'document' | 'inline'
export type PageSize = 'A4' | 'Letter'

/** Value accepted by `v-model`: an HTML string or TipTap JSON document. */
export type EditorContent = string | JSONContent

/** Every built-in toolbar control. */
export type ToolbarItem =
  | 'undo' | 'redo'
  | 'heading' | 'fontFamily' | 'fontSize'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'superscript' | 'subscript'
  | 'color' | 'highlight' | 'clearFormatting'
  | 'align' | 'lineHeight' | 'indent' | 'outdent'
  | 'bulletList' | 'orderedList' | 'taskList'
  | 'blockquote' | 'codeBlock' | 'horizontalRule'
  | 'link' | 'image' | 'table' | 'specialChars'
  | 'findReplace' | 'pastePlain'
  | 'file' | 'print' | 'fullscreen'
  | 'ai' | 'chat'

/** A toolbar group is rendered between separators. */
export type ToolbarGroup = ToolbarItem[]

export type ToolbarConfig = 'full' | 'basic' | 'none' | ToolbarGroup[]

export interface EditorFeatures {
  tables?: boolean
  images?: boolean
  taskList?: boolean
  codeHighlight?: boolean
  docx?: boolean
  statusBar?: boolean
  /** AI Canvas. Only active when an `ai` adapter is also provided. */
  ai?: boolean
  /** Chat with the document (part of the AI Canvas; needs the `ai` adapter). */
  chat?: boolean
}

export type ExportFormat = 'html' | 'json' | 'markdown' | 'text' | 'docx'

/** Upload adapter. Return the public URL of the stored image. */
export type UploadImageFn = (file: File) => Promise<string>

export interface EditorError {
  type: 'image-type' | 'image-size' | 'image-upload' | 'import' | 'export' | 'clipboard' | 'ai'
  message: string
  cause?: unknown
}

export type {
  AiAdapter,
  AiAdapterOptions,
  AiPrompt,
  AiQuickAction,
  AiRequest,
  AiTask,
  AiBlock,
  AiResponseFormat,
  AiChatMessage,
} from './ai/types'

export interface AiAppliedEvent {
  task: import('./ai/types').AiTask
  /** Number of suggestions accepted in this action. */
  accepted: number
}

export interface EditorVersion {
  id: string
  /** What happened after this snapshot, e.g. "AI: Make shorter". */
  label: string
  createdAt: number
  content: JSONContent
}

export interface RichEditorProps {
  /** Bound via `v-model`. HTML string (default) or JSON when `contentFormat="json"`. */
  modelValue?: EditorContent
  /** Format emitted through `update:modelValue`. */
  contentFormat?: ContentFormat
  placeholder?: string
  /** Set to `false` for read-only mode (toolbar is hidden). */
  editable?: boolean
  autofocus?: boolean
  theme?: EditorTheme
  layout?: EditorLayout
  pageSize?: PageSize
  /** CSS height of the editor, e.g. `400` or `'60vh'`. Defaults to 400px for `inline`, 100% for `document`. */
  height?: number | string
  toolbar?: ToolbarConfig
  features?: EditorFeatures
  /** Stores images through your backend. Without it images are embedded as data URLs. */
  uploadImage?: UploadImageFn
  /** Max image size in bytes (default 5 MB). */
  maxImageSize?: number
  /** Fonts offered in the font picker. */
  fonts?: string[]
  /** Enables localStorage autosave under this key. */
  autosaveKey?: string
  /** Base file name used for downloads (without extension). */
  documentName?: string
  /** Override any UI string. */
  messages?: Partial<Messages>
  /** Extra TipTap extensions appended to the built-in set. */
  extensions?: Extensions
  /**
   * AI Canvas adapter. It sends requests to *your* backend, which calls the model
   * (the editor never holds an API key). Without it, no AI controls are shown.
   */
  ai?: import('./ai/types').AiAdapter
  /** Quick actions offered for a selection. Defaults to `DEFAULT_AI_ACTIONS`. */
  aiActions?: import('./ai/types').AiQuickAction[]
  /** Max versions kept in memory (default 30). */
  maxVersions?: number
  /** Chat conversation, for `v-model:chat-history` (restore or save it per document). */
  chatHistory?: import('./ai/types').AiChatMessage[]
  /** Starter questions shown in an empty chat. */
  chatStarters?: string[]
}

export interface RichEditorExpose {
  /** Underlying TipTap editor instance (undefined until mounted). */
  readonly editor: Editor | undefined
  getHTML: () => string
  getJSON: () => JSONContent
  getText: () => string
  getMarkdown: () => string
  isEmpty: () => boolean
  setContent: (content: EditorContent) => void
  clear: () => void
  focus: () => void
  /** Build a .docx Blob of the current document. */
  exportDocx: () => Promise<Blob>
  /** Trigger a browser download in the given format. */
  download: (format: ExportFormat, fileName?: string) => Promise<void>
  /** Replace the content with an imported .docx / .html / .md / .txt / .json file. */
  importFile: (file: File) => Promise<void>
  print: () => void
  toggleFullscreen: (value?: boolean) => void

  // --- AI Canvas (require the `ai` prop) ---
  /** Generate content from a prompt: replaces an empty document, otherwise inserts after the current block. */
  aiGenerate: (prompt: string) => Promise<void>
  /** Rewrite the current selection according to an instruction. */
  aiEditSelection: (instruction: string) => Promise<void>
  /** Continue writing at the cursor. */
  aiContinue: (guidance?: string) => Promise<void>
  /** Apply an instruction to the whole document; only changed blocks become suggestions. */
  aiEditDocument: (instruction: string) => Promise<void>
  /** Cancel the running AI request. */
  aiStop: () => void
  /** Pending AI suggestions. */
  getSuggestionCount: () => number
  acceptAllSuggestions: () => void
  rejectAllSuggestions: () => void
  /** Snapshots saved before each accepted AI change (newest first). */
  getVersions: () => EditorVersion[]
  restoreVersion: (id: string) => void
  /** Open, close or toggle the document chat. */
  openChat: (open?: boolean) => void
  /** Ask the document chat a question (opens the panel). */
  askDocument: (question: string) => Promise<void>
  clearChat: () => void
}
