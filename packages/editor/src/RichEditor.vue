<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { EditorContent as TiptapContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { buildExtensions } from './extensions'
import { createTranslator } from './i18n/messages'
import { EDITOR_CONTEXT, type DialogName, type EditorContext } from './context'
import { DEFAULT_MAX_IMAGE_SIZE, formatBytes } from './services/image'
import { EXTENSIONS, MIME_TYPES, downloadBlob, printHtml, toHtmlDocument, toMarkdown } from './services/exporters'
import { importFile as readImportFile } from './services/importers'
import { normalizeContent } from './services/content'
import { resolveToolbar } from './toolbar/items'
import Toolbar from './toolbar/Toolbar.vue'
import FindReplace from './components/FindReplace.vue'
import StatusBar from './components/StatusBar.vue'
import TableMenu from './components/menus/TableMenu.vue'
import ImageMenu from './components/menus/ImageMenu.vue'
import LinkMenu from './components/menus/LinkMenu.vue'
import LinkDialog from './components/dialogs/LinkDialog.vue'
import ImageDialog from './components/dialogs/ImageDialog.vue'
import SpecialCharsDialog from './components/dialogs/SpecialCharsDialog.vue'
import { DEFAULT_FEATURES, DEFAULT_FONTS } from './defaults'
import type { EditorContent, EditorError, ExportFormat, RichEditorExpose, RichEditorProps } from './types'

defineOptions({ name: 'RichEditor' })

const props = withDefaults(defineProps<RichEditorProps>(), {
  modelValue: '',
  contentFormat: 'html',
  placeholder: 'Start typing…',
  editable: true,
  autofocus: false,
  theme: 'light',
  layout: 'inline',
  pageSize: 'A4',
  height: undefined,
  toolbar: 'full',
  features: () => ({}),
  uploadImage: undefined,
  maxImageSize: DEFAULT_MAX_IMAGE_SIZE,
  fonts: () => DEFAULT_FONTS,
  autosaveKey: undefined,
  documentName: 'document',
  messages: () => ({}),
  extensions: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: EditorContent]
  ready: [api: RichEditorExpose]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  error: [error: EditorError]
  saved: [content: EditorContent]
}>()

const t = computed(() => createTranslator(props.messages))
const translate: EditorContext['t'] = (key, params) => t.value(key, params)
const features = computed(() => ({ ...DEFAULT_FEATURES, ...props.features }))

// ---------------------------------------------------------------------------
// Toasts / errors
// ---------------------------------------------------------------------------
const toasts = ref<{ id: number; message: string }[]>([])
let toastId = 0

function reportError(error: EditorError) {
  emit('error', error)
  const size = formatBytes(props.maxImageSize)
  const messages: Record<EditorError['type'], string> = {
    'image-type': translate('errorImageType'),
    'image-size': translate('errorImageSize', { size }),
    'image-upload': translate('errorImageUpload'),
    import: translate('errorImport'),
    export: translate('errorExport'),
    clipboard: translate('errorClipboard'),
  }
  const id = ++toastId
  const detail = error.type.startsWith('image') && error.message ? ` (${error.message})` : ''
  toasts.value.push({ id, message: messages[error.type] + detail })
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== id)), 5000)
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
const autosaved = readAutosave()

const serialize = (): EditorContent =>
  props.contentFormat === 'json' ? editor.value!.getJSON() : editor.value!.getHTML()

const isSameContent = (raw: EditorContent) => {
  if (!editor.value) return true
  const value = normalizeContent(raw)
  return typeof value === 'string'
    ? value === editor.value.getHTML() || (!value && editor.value.isEmpty)
    : JSON.stringify(value) === JSON.stringify(editor.value.getJSON())
}

const editor = useEditor({
  content: normalizeContent(autosaved ?? props.modelValue),
  editable: props.editable,
  autofocus: props.autofocus,
  extensions: buildExtensions({
    placeholder: () => props.placeholder,
    features: features.value,
    image: {
      uploadImage: props.uploadImage,
      maxImageSize: props.maxImageSize,
      onError: reportError,
    },
    extra: props.extensions,
  }),
  editorProps: {
    attributes: {
      class: 're-content',
      spellcheck: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': translate('editorLabel'),
    },
  },
  onUpdate: () => {
    emit('update:modelValue', serialize())
    scheduleAutosave()
  },
  onFocus: ({ event }) => emit('focus', event),
  onBlur: ({ event }) => emit('blur', event),
  onCreate: () => {
    // Content restored from autosave must reach the parent's v-model too.
    if (autosaved !== undefined) emit('update:modelValue', serialize())
    emit('ready', api)
  },
})

// Keep the image extension's uploader in sync if the prop changes after mount.
watch(
  [editor, () => props.uploadImage],
  () => {
    const ext = editor.value?.extensionManager.extensions.find((e) => e.name === 'image')
    if (ext) ext.options.uploadImage = props.uploadImage
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (value) => {
    if (!isSameContent(value)) editor.value?.commands.setContent(normalizeContent(value), { emitUpdate: false })
  },
)

watch(
  () => props.editable,
  (value) => editor.value?.setEditable(value),
)

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------
const savedFlag = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | undefined
let savedTimer: ReturnType<typeof setTimeout> | undefined

function readAutosave(): EditorContent | undefined {
  if (!props.autosaveKey || typeof localStorage === 'undefined') return undefined
  const hasExternal = typeof props.modelValue === 'string' ? !!props.modelValue.trim() : !!props.modelValue?.content?.length
  if (hasExternal) return undefined
  try {
    const raw = localStorage.getItem(props.autosaveKey)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { content: EditorContent }
    return parsed.content
  } catch {
    return undefined
  }
}

function scheduleAutosave() {
  if (!props.autosaveKey) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const content = editor.value!.getJSON()
      localStorage.setItem(props.autosaveKey!, JSON.stringify({ content, savedAt: Date.now() }))
      emit('saved', content)
      savedFlag.value = true
      clearTimeout(savedTimer)
      savedTimer = setTimeout(() => (savedFlag.value = false), 2000)
    } catch {
      // Storage full or unavailable: autosave is best-effort.
    }
  }, 800)
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const isFullscreen = ref(false)
const findOpen = ref(false)
const dialog = ref<DialogName | null>(null)
const dialogPayload = ref<any>(null)
const scrollRef = ref<HTMLElement>()

function openDialog(name: DialogName, payload?: unknown) {
  dialogPayload.value = payload ?? null
  dialog.value = name
}

const dialogOpen = (name: DialogName) =>
  computed({
    get: () => dialog.value === name,
    set: (v: boolean) => (dialog.value = v ? name : null),
  })
const linkOpen = dialogOpen('link')
const imageOpen = dialogOpen('image')
const charsOpen = dialogOpen('specialChars')

function toggleFullscreen(value?: boolean) {
  isFullscreen.value = value ?? !isFullscreen.value
}

watch(isFullscreen, (value) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('re-no-scroll', value)
  setTimeout(() => editor.value?.commands.focus(), 0)
})

async function exportDocxBlob(): Promise<Blob> {
  const { exportDocx } = await import('./services/docx/exportDocx')
  const styles = scrollRef.value ? getComputedStyle(scrollRef.value) : null
  const fontVar = styles?.getPropertyValue('--re-font').split(',')[0].trim().replace(/['"]/g, '')
  const sizeVar = parseFloat(styles?.getPropertyValue('--re-font-size') ?? '')
  return exportDocx(editor.value!.getJSON(), {
    pageSize: props.pageSize,
    title: props.documentName,
    font: fontVar || undefined,
    fontSizePt: Number.isFinite(sizeVar) ? sizeVar : undefined,
  })
}

async function download(format: ExportFormat, fileName = props.documentName) {
  const e = editor.value
  if (!e) return
  try {
    let blob: Blob
    switch (format) {
      case 'docx':
        blob = await exportDocxBlob()
        break
      case 'html':
        blob = new Blob([toHtmlDocument(e.getHTML(), fileName)], { type: MIME_TYPES.html })
        break
      case 'markdown':
        blob = new Blob([toMarkdown(e.getHTML())], { type: MIME_TYPES.markdown })
        break
      case 'text':
        blob = new Blob([e.getText({ blockSeparator: '\n\n' })], { type: MIME_TYPES.text })
        break
      case 'json':
        blob = new Blob([JSON.stringify(e.getJSON(), null, 2)], { type: MIME_TYPES.json })
        break
    }
    downloadBlob(blob, `${fileName}.${EXTENSIONS[format]}`)
  } catch (cause) {
    reportError({ type: 'export', message: String(cause), cause })
  }
}

async function importFile(file: File) {
  try {
    const result = await readImportFile(file)
    const content = 'json' in result ? result.json : result.html
    editor.value?.chain().setContent(normalizeContent(content), { emitUpdate: true }).focus('start').run()
  } catch (cause) {
    reportError({ type: 'import', message: file.name, cause })
  }
}

function newDocument() {
  const e = editor.value
  if (!e) return
  if (!e.isEmpty && typeof window !== 'undefined' && !window.confirm(translate('confirmNew'))) return
  e.chain().clearContent(true).focus().run()
}

function print() {
  if (editor.value) printHtml(editor.value.getHTML(), props.documentName, props.pageSize)
}

async function pastePlain() {
  try {
    const text = await navigator.clipboard.readText()
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    const content: JSONContent[] =
      lines.length === 1
        ? [{ type: 'text', text: lines[0] }]
        : lines.map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))
    if (text) editor.value?.chain().focus().insertContent(content).run()
  } catch (cause) {
    reportError({ type: 'clipboard', message: '', cause })
  }
}

// Editor-level shortcuts that need UI (the rest live in extensions).
function onKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (mod && !e.altKey && key === 'f') {
    e.preventDefault()
    findOpen.value = true
  } else if (mod && !e.altKey && key === 'k' && props.editable) {
    e.preventDefault()
    openDialog('link')
  } else if (e.key === 'Escape' && findOpen.value) {
    findOpen.value = false
  } else if (e.key === 'Escape' && isFullscreen.value && !dialog.value) {
    toggleFullscreen(false)
  }
}

// ---------------------------------------------------------------------------
// Layout / theme
// ---------------------------------------------------------------------------
const prefersDark = ref(false)
let media: MediaQueryList | undefined
const onMedia = () => (prefersDark.value = !!media?.matches)
onMounted(() => {
  media = window.matchMedia?.('(prefers-color-scheme: dark)')
  onMedia()
  media?.addEventListener?.('change', onMedia)
})

const themeClass = computed(() => (props.theme === 'dark' || (props.theme === 'auto' && prefersDark.value) ? 're-theme-dark' : 're-theme-light'))
const portalClass = computed(() => [themeClass.value])

const toolbarGroups = computed(() => (props.editable ? resolveToolbar(props.toolbar, features.value) : []))

const rootClasses = computed(() => [
  're-root',
  themeClass.value,
  `re-layout-${props.layout}`,
  `re-page-${props.pageSize.toLowerCase()}`,
  { 're-fullscreen': isFullscreen.value, 're-readonly': !props.editable },
])

const rootStyle = computed(() => {
  const h = props.height ?? (props.layout === 'inline' ? 400 : undefined)
  if (h === undefined || h === 'auto') return undefined
  return { height: typeof h === 'number' ? `${h}px` : h }
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(savedTimer)
  media?.removeEventListener?.('change', onMedia)
  if (isFullscreen.value) document.documentElement.classList.remove('re-no-scroll')
  editor.value?.destroy()
})

// ---------------------------------------------------------------------------
// Context & public API
// ---------------------------------------------------------------------------
provide(EDITOR_CONTEXT, {
  editor,
  t: translate,
  features,
  fonts: computed(() => props.fonts),
  maxImageSize: computed(() => props.maxImageSize),
  portalClass,
  isFullscreen,
  findOpen,
  openDialog,
  toggleFullscreen,
  download,
  importFile,
  newDocument,
  print,
  pastePlain,
  reportError,
} satisfies EditorContext)

const api: RichEditorExpose = {
  get editor() {
    return editor.value
  },
  getHTML: () => editor.value?.getHTML() ?? '',
  getJSON: () => editor.value?.getJSON() ?? { type: 'doc', content: [] },
  getText: () => editor.value?.getText({ blockSeparator: '\n\n' }) ?? '',
  getMarkdown: () => toMarkdown(editor.value?.getHTML() ?? ''),
  isEmpty: () => editor.value?.isEmpty ?? true,
  setContent: (content) => editor.value?.commands.setContent(normalizeContent(content), { emitUpdate: true }),
  clear: () => editor.value?.commands.clearContent(true),
  focus: () => editor.value?.commands.focus(),
  exportDocx: exportDocxBlob,
  download,
  importFile,
  print,
  toggleFullscreen,
}

defineExpose(api)
</script>

<template>
  <div :class="rootClasses" :style="rootStyle" @keydown="onKeydown">
    <slot name="toolbar-start" :editor="editor" />
    <Toolbar v-if="editor && toolbarGroups.length" :groups="toolbarGroups" />
    <slot name="toolbar-end" :editor="editor" />

    <FindReplace v-if="editor && findOpen" />

    <div ref="scrollRef" class="re-scroll">
      <div class="re-surface">
        <TiptapContent :editor="editor" class="re-editor-content" />
      </div>
    </div>

    <StatusBar v-if="features.statusBar" :saved="savedFlag" :page-size="pageSize" :layout="layout" />
    <slot name="footer" :editor="editor" />

    <template v-if="editor">
      <LinkMenu :editor="editor" :scroll-target="scrollRef" />
      <template v-if="editable">
        <TableMenu v-if="features.tables" :editor="editor" :scroll-target="scrollRef" />
        <ImageMenu v-if="features.images" :editor="editor" :scroll-target="scrollRef" />
        <LinkDialog v-model:open="linkOpen" />
        <ImageDialog v-if="features.images" v-model:open="imageOpen" :replace="!!dialogPayload?.replace" />
        <SpecialCharsDialog v-model:open="charsOpen" />
      </template>
    </template>

    <div class="re-toasts" aria-live="assertive">
      <div v-for="toast in toasts" :key="toast.id" class="re-toast" role="alert">{{ toast.message }}</div>
    </div>
  </div>
</template>
