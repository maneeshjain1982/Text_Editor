<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { EditorContent as TiptapContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { buildExtensions } from './extensions'
import { createTranslator } from './i18n/messages'
import { EDITOR_CONTEXT, type DialogName, type EditorContext } from './context'
import { DEFAULT_MAX_IMAGE_SIZE, formatBytes } from './services/image'
import { EXTENSIONS, MIME_TYPES, downloadBlob, printHtml, toHtmlDocument, toMarkdown } from './services/exporters'
import { importFile as readImportFile } from './services/importers'
import { ensureTrailingParagraph, normalizeContent } from './services/content'
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
import VersionsDialog from './components/dialogs/VersionsDialog.vue'
import AiBar from './components/ai/AiBar.vue'
import AiSelectionMenu from './components/ai/AiSelectionMenu.vue'
import ChatPanel from './components/ai/ChatPanel.vue'
import { createChatController } from './ai/chat'
import { createAiController, type AiController } from './ai/controller'
import { createDefaultAiActions } from './ai/actions'
import { getAiSuggestionState } from './extensions/AiSuggestion'
import { DEFAULT_FEATURES, DEFAULT_FONTS } from './defaults'
import type { AiAppliedEvent, AiChatMessage, AiRequest, EditorContent, EditorError, EditorVersion, ExportFormat, RichEditorExpose, RichEditorProps } from './types'

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
  ai: undefined,
  aiActions: undefined,
  maxVersions: 30,
  chatHistory: undefined,
  chatStarters: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: EditorContent]
  ready: [api: RichEditorExpose]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  error: [error: EditorError]
  saved: [content: EditorContent]
  'ai-request': [request: AiRequest]
  'ai-applied': [event: AiAppliedEvent]
  'version-created': [version: EditorVersion]
  'update:chatHistory': [history: AiChatMessage[]]
  'chat-message': [message: AiChatMessage]
}>()

const t = computed(() => createTranslator(props.messages))
const translate: EditorContext['t'] = (key, params) => t.value(key, params)
const features = computed(() => {
  const merged = { ...DEFAULT_FEATURES, ...props.features }
  // AI needs both the feature flag and an adapter.
  const ai = merged.ai && !!props.ai
  return { ...merged, ai, chat: ai && merged.chat }
})

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
    ai: error.message || translate('errorAi'),
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
    ai: {
      label: (key) => translate(key),
      onBeforeApply: (label) => snapshotVersion(label),
      onApplied: (count) => emit('ai-applied', { task: aiController.value?.state.mode ?? 'edit-selection', accepted: count }),
      onDiscarded: () => {
        if (aiController.value?.state.open) aiController.value.state.message = translate('aiDiscarded')
      },
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
  onCreate: ({ editor: created }) => {
    ensureTrailingParagraph(created)
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
    if (isSameContent(value) || !editor.value) return
    editor.value.commands.setContent(normalizeContent(value), { emitUpdate: false })
    ensureTrailingParagraph(editor.value)
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
// AI Canvas and versions
// ---------------------------------------------------------------------------
const versions = shallowRef<EditorVersion[]>([])
let versionCounter = 0

/** Save the current document before an AI change is applied. */
function snapshotVersion(label: string) {
  const e = editor.value
  if (!e) return
  const version: EditorVersion = { id: `v${Date.now().toString(36)}${++versionCounter}`, label, createdAt: Date.now(), content: e.getJSON() }
  versions.value = [version, ...versions.value].slice(0, props.maxVersions)
  emit('version-created', version)
}

function restoreVersion(id: string) {
  const e = editor.value
  const version = versions.value.find((v) => v.id === id)
  if (!e || !version) return
  e.commands.rejectAllAiSuggestions()
  snapshotVersion(translate('versionBeforeRestore'))
  e.chain().setContent(normalizeContent(version.content), { emitUpdate: true }).focus().run()
  ensureTrailingParagraph(e)
}

const aiInstance: AiController = createAiController({
  editor,
  adapter: () => props.ai,
  t: translate,
  title: () => (props.documentName && props.documentName !== 'document' ? props.documentName : undefined),
  onRequest: (request) => emit('ai-request', request),
  onError: (message, cause) => {
    emit('error', { type: 'ai', message, cause })
    // The AI bar shows its own errors; toast only when it is closed.
    if (!aiInstance.state.open) reportError({ type: 'ai', message })
  },
})
const aiController = computed(() => (features.value.ai ? aiInstance : null))

const chatInstance = createChatController({
  editor,
  adapter: () => props.ai,
  t: translate,
  title: () => (props.documentName && props.documentName !== 'document' ? props.documentName : undefined),
  initialHistory: props.chatHistory,
  onRequest: (request) => emit('ai-request', request),
  onMessage: (message, history) => {
    emit('chat-message', message)
    emit('update:chatHistory', history)
  },
  onError: (message, cause) => emit('error', { type: 'ai', message, cause }),
  onClear: () => emit('update:chatHistory', []),
})
const chatController = computed(() => (features.value.chat ? chatInstance : null))
const chatStarters = computed(
  () =>
    props.chatStarters ??
    (['chatStarterSummarize', 'chatStarterKeyPoints', 'chatStarterActions', 'chatStarterIssues', 'chatStarterTitle'] as const).map((k) => translate(k)),
)
const aiActions = computed(() => props.aiActions ?? createDefaultAiActions(translate))

/** Ctrl/Cmd+J: Ask AI about the selection, or generate at the cursor when nothing is selected. */
function openAi() {
  const ai = aiController.value
  if (!ai || !props.editable) return
  ai.open(editor.value?.state.selection.empty ? 'generate' : 'edit-selection')
}

async function runAi(mode: 'generate' | 'edit-selection' | 'continue' | 'edit-document', instruction: string, label?: string) {
  const ai = aiController.value
  if (!ai || !ai.open(mode)) return
  await ai.run(instruction, label, mode)
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
const versionsOpen = dialogOpen('versions')

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
    if (!editor.value) return
    editor.value.chain().setContent(normalizeContent(content), { emitUpdate: true }).focus('start').run()
    ensureTrailingParagraph(editor.value)
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
  } else if (mod && e.altKey && key === 'j' && chatController.value) {
    e.preventDefault()
    chatController.value.setOpen()
  } else if (mod && !e.altKey && !e.shiftKey && key === 'j' && aiController.value) {
    e.preventDefault()
    openAi()
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
  aiInstance.stop()
  chatInstance.stop()
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
  ai: aiController,
  chat: chatController,
  aiActions,
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
  setContent: (content) => {
    if (!editor.value) return
    editor.value.commands.setContent(normalizeContent(content), { emitUpdate: true })
    ensureTrailingParagraph(editor.value)
  },
  clear: () => editor.value?.commands.clearContent(true),
  focus: () => editor.value?.commands.focus(),
  exportDocx: exportDocxBlob,
  download,
  importFile,
  print,
  toggleFullscreen,
  aiGenerate: (prompt) => runAi('generate', prompt),
  aiEditSelection: (instruction) => runAi('edit-selection', instruction),
  aiContinue: (guidance = '') => runAi('continue', guidance, translate('aiContinue')),
  aiEditDocument: (instruction) => runAi('edit-document', instruction),
  aiStop: () => aiInstance.stop(),
  getSuggestionCount: () => (editor.value ? getAiSuggestionState(editor.value.state).suggestions.length : 0),
  acceptAllSuggestions: () => void editor.value?.commands.acceptAllAiSuggestions(),
  rejectAllSuggestions: () => void editor.value?.commands.rejectAllAiSuggestions(),
  getVersions: () => versions.value,
  restoreVersion,
  openChat: (open) => chatController.value?.setOpen(open),
  askDocument: async (question) => {
    const chat = chatController.value
    if (!chat) return
    chat.setOpen(true)
    await chat.send(question)
  },
  clearChat: () => chatInstance.clear(),
}

defineExpose(api)
</script>

<template>
  <div :class="rootClasses" :style="rootStyle" @keydown="onKeydown">
    <slot name="toolbar-start" :editor="editor" />
    <Toolbar v-if="editor && toolbarGroups.length" :groups="toolbarGroups" />
    <slot name="toolbar-end" :editor="editor" />

    <FindReplace v-if="editor && findOpen" />
    <AiBar v-if="editor && aiController && aiController.state.open && editable" :controller="aiController" />

    <div class="re-body">
      <div ref="scrollRef" class="re-scroll">
        <div class="re-surface">
          <TiptapContent :editor="editor" class="re-editor-content" />
        </div>
      </div>
      <ChatPanel v-if="editor && chatController && chatController.open.value" :chat="chatController" :starters="chatStarters" />
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
        <template v-if="aiController">
          <AiSelectionMenu :editor="editor" :controller="aiController" :scroll-target="scrollRef" />
          <VersionsDialog v-model:open="versionsOpen" :versions="versions" @restore="restoreVersion" />
        </template>
      </template>
    </template>

    <div class="re-toasts" aria-live="assertive">
      <div v-for="toast in toasts" :key="toast.id" class="re-toast" role="alert">{{ toast.message }}</div>
    </div>
  </div>
</template>
