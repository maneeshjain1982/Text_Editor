import type { Component } from 'vue'
import type { Editor } from '@tiptap/core'
import {
  Bold, ClipboardType, Code, Italic, ListIndentDecrease, ListIndentIncrease, List, ListOrdered, ListTodo,
  Maximize2, MessagesSquare, Minus, Printer, Redo2, RemoveFormatting, SquareCode, Strikethrough, Subscript, Superscript,
  TextQuote, TextSearch, Underline, Undo2,
} from 'lucide-vue-next'
import type { EditorContext } from '../context'
import type { MessageKey } from '../i18n/messages'
import type { EditorFeatures, ToolbarConfig, ToolbarGroup, ToolbarItem } from '../types'

export interface ButtonItem {
  icon: Component
  label: MessageKey
  shortcut?: string
  run: (editor: Editor, ctx: EditorContext) => void
  isActive?: (editor: Editor, ctx: EditorContext) => boolean
  isDisabled?: (editor: Editor) => boolean
}

const chain = (editor: Editor) => editor.chain().focus()

export const BUTTON_ITEMS: Partial<Record<ToolbarItem, ButtonItem>> = {
  undo: { icon: Undo2, label: 'undo', shortcut: 'Mod-Z', run: (e) => chain(e).undo().run(), isDisabled: (e) => !e.can().undo() },
  redo: { icon: Redo2, label: 'redo', shortcut: 'Mod-Shift-Z', run: (e) => chain(e).redo().run(), isDisabled: (e) => !e.can().redo() },
  bold: { icon: Bold, label: 'bold', shortcut: 'Mod-B', run: (e) => chain(e).toggleBold().run(), isActive: (e) => e.isActive('bold') },
  italic: { icon: Italic, label: 'italic', shortcut: 'Mod-I', run: (e) => chain(e).toggleItalic().run(), isActive: (e) => e.isActive('italic') },
  underline: { icon: Underline, label: 'underline', shortcut: 'Mod-U', run: (e) => chain(e).toggleUnderline().run(), isActive: (e) => e.isActive('underline') },
  strike: { icon: Strikethrough, label: 'strike', shortcut: 'Mod-Shift-S', run: (e) => chain(e).toggleStrike().run(), isActive: (e) => e.isActive('strike') },
  code: { icon: Code, label: 'code', shortcut: 'Mod-E', run: (e) => chain(e).toggleCode().run(), isActive: (e) => e.isActive('code') },
  superscript: { icon: Superscript, label: 'superscript', shortcut: 'Mod-.', run: (e) => chain(e).toggleSuperscript().run(), isActive: (e) => e.isActive('superscript') },
  subscript: { icon: Subscript, label: 'subscript', shortcut: 'Mod-,', run: (e) => chain(e).toggleSubscript().run(), isActive: (e) => e.isActive('subscript') },
  clearFormatting: { icon: RemoveFormatting, label: 'clearFormatting', run: (e) => chain(e).unsetAllMarks().run() },
  indent: { icon: ListIndentIncrease, label: 'indent', shortcut: 'Mod-]', run: (e) => chain(e).indent().run() },
  outdent: { icon: ListIndentDecrease, label: 'outdent', shortcut: 'Mod-[', run: (e) => chain(e).outdent().run() },
  bulletList: { icon: List, label: 'bulletList', shortcut: 'Mod-Shift-8', run: (e) => chain(e).toggleBulletList().run(), isActive: (e) => e.isActive('bulletList') },
  orderedList: { icon: ListOrdered, label: 'orderedList', shortcut: 'Mod-Shift-7', run: (e) => chain(e).toggleOrderedList().run(), isActive: (e) => e.isActive('orderedList') },
  taskList: { icon: ListTodo, label: 'taskList', shortcut: 'Mod-Shift-9', run: (e) => chain(e).toggleTaskList().run(), isActive: (e) => e.isActive('taskList') },
  blockquote: { icon: TextQuote, label: 'blockquote', shortcut: 'Mod-Shift-B', run: (e) => chain(e).toggleBlockquote().run(), isActive: (e) => e.isActive('blockquote') },
  codeBlock: { icon: SquareCode, label: 'codeBlock', shortcut: 'Mod-Alt-C', run: (e) => chain(e).toggleCodeBlock().run(), isActive: (e) => e.isActive('codeBlock') },
  horizontalRule: { icon: Minus, label: 'horizontalRule', run: (e) => chain(e).setHorizontalRule().run() },
  findReplace: { icon: TextSearch, label: 'findReplace', shortcut: 'Mod-F', run: (_e, ctx) => (ctx.findOpen.value = !ctx.findOpen.value), isActive: (_e, ctx) => ctx.findOpen.value },
  pastePlain: { icon: ClipboardType, label: 'pastePlain', shortcut: 'Mod-Shift-V', run: (_e, ctx) => void ctx.pastePlain() },
  print: { icon: Printer, label: 'print', run: (_e, ctx) => ctx.print() },
  chat: { icon: MessagesSquare, label: 'chatTitle', shortcut: 'Mod-Alt-J', run: (_e, ctx) => ctx.chat.value?.setOpen(), isActive: (_e, ctx) => !!ctx.chat.value?.open.value },
  fullscreen: { icon: Maximize2, label: 'fullscreen', run: (_e, ctx) => ctx.toggleFullscreen(), isActive: (_e, ctx) => ctx.isFullscreen.value },
}

export const TOOLBAR_PRESETS: Record<'full' | 'basic', ToolbarGroup[]> = {
  full: [
    ['file', 'ai', 'chat'],
    ['undo', 'redo'],
    ['heading', 'fontFamily', 'fontSize'],
    ['bold', 'italic', 'underline', 'strike', 'color', 'highlight'],
    ['align', 'lineHeight', 'bulletList', 'orderedList', 'taskList', 'outdent', 'indent'],
    ['link', 'image', 'table'],
    ['blockquote', 'codeBlock', 'horizontalRule', 'specialChars'],
    ['code', 'superscript', 'subscript', 'clearFormatting'],
    ['findReplace', 'pastePlain', 'print', 'fullscreen'],
  ],
  basic: [
    ['ai', 'chat'],
    ['undo', 'redo'],
    ['heading'],
    ['bold', 'italic', 'underline', 'strike'],
    ['color', 'highlight'],
    ['align', 'bulletList', 'orderedList'],
    ['link', 'image', 'table'],
  ],
}

const FEATURE_ITEMS: Partial<Record<ToolbarItem, keyof EditorFeatures>> = {
  image: 'images',
  table: 'tables',
  taskList: 'taskList',
  ai: 'ai',
  chat: 'chat',
}

export function resolveToolbar(config: ToolbarConfig, features: Required<EditorFeatures>): ToolbarGroup[] {
  if (config === 'none') return []
  const groups = typeof config === 'string' ? TOOLBAR_PRESETS[config] : config
  return groups
    .map((group) => group.filter((item) => !FEATURE_ITEMS[item] || features[FEATURE_ITEMS[item]!]))
    .filter((group) => group.length)
}
