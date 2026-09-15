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
}

export type ExportFormat = 'html' | 'json' | 'markdown' | 'text' | 'docx'

/** Upload adapter. Return the public URL of the stored image. */
export type UploadImageFn = (file: File) => Promise<string>

export interface EditorError {
  type: 'image-type' | 'image-size' | 'image-upload' | 'import' | 'export' | 'clipboard'
  message: string
  cause?: unknown
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
}
