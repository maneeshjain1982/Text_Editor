import type { EditorFeatures } from './types'

export const DEFAULT_FONTS = ['Arial', 'Calibri', 'Cambria', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana']

export const DEFAULT_FEATURES: Required<EditorFeatures> = {
  tables: true,
  images: true,
  taskList: true,
  codeHighlight: true,
  docx: true,
  statusBar: true,
}
