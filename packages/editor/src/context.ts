import { inject, type InjectionKey, type Ref, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import type { Translate } from './i18n/messages'
import type { EditorError, EditorFeatures, ExportFormat } from './types'

export interface EditorContext {
  editor: ShallowRef<Editor | undefined>
  t: Translate
  features: Ref<Required<EditorFeatures>>
  fonts: Ref<string[]>
  maxImageSize: Ref<number>
  /** Classes (theme) to put on teleported popovers so they share the design tokens. */
  portalClass: Ref<string[]>
  isFullscreen: Ref<boolean>
  findOpen: Ref<boolean>
  openDialog: (name: DialogName, payload?: unknown) => void
  toggleFullscreen: (value?: boolean) => void
  download: (format: ExportFormat) => Promise<void>
  importFile: (file: File) => Promise<void>
  newDocument: () => void
  print: () => void
  pastePlain: () => Promise<void>
  reportError: (error: EditorError) => void
}

export type DialogName = 'link' | 'image' | 'specialChars'

export const EDITOR_CONTEXT: InjectionKey<EditorContext> = Symbol('rich-editor')

export function useEditorContext(): EditorContext {
  const ctx = inject(EDITOR_CONTEXT)
  if (!ctx) throw new Error('Rich editor components must be used inside <RichEditor>')
  return ctx
}
