# @local/rich-editor

> This is the API reference. For step-by-step setup in an existing app, see the **[Integration guide](../../docs/INTEGRATION.md)**. For end users, see the **[User guide](../../docs/USER-GUIDE.md)**.

A rich text editor component for **Vue 3**. It supports tables, images and Word (.docx) import and export, and it is designed to be embedded in an existing dashboard.

- Formatting: bold, italic, underline, strikethrough, inline code, superscript and subscript, font, size, text color, highlight, and clear formatting
- Paragraphs: normal text and headings H1–H6, alignment, line spacing, indent, bulleted, numbered and check lists, quote, code block with syntax highlighting, horizontal line
- **Tables:** insert with a grid picker, add or delete rows and columns, merge and split cells, header row and column, column resizing, cell color
- **Images:** upload, drag and drop, paste, or insert by URL. You can resize them, align them, wrap text around them, and add alt text and a caption. Uploads can go to your backend through an optional adapter.
- Editing tools: undo and redo, find and replace, links, special characters and emoji, paste cleanup (Word and Google Docs), paste as plain text, word and character count
- Files: the toolbar downloads **.docx**; download() and importFile() also handle .html, .md, .txt and .json; print or save as PDF
- Page breaks: automatic page view (a block that would cross the page edge moves to the next page) plus manual breaks with Ctrl+Enter, exported as real Word page breaks
- Two layouts, `document` (an A4 or Letter page) and `inline`, plus full screen, light, dark and automatic themes
- **AI Canvas (optional):** generate drafts, rewrite a selection, continue writing, edit the whole document, or **chat with the document** (cited answers, changes as suggestions). Changes appear as suggestions you accept or reject, and only the affected text is regenerated. Works with Gemini (reference server included) or any model behind your backend.
- Built-in accessibility: WAI-ARIA toolbar with arrow-key navigation, labelled controls, focus-trapped dialogs, and reduced-motion support

---

## Installing it in your dashboard

The package is distributed locally, not through npm.

```bash
# In this repo: build the package and create a tarball
npm install
npm run build
npm run pack              # → packages/editor/local-rich-editor-<version>.tgz

# In your dashboard
npm install <path-to-repo>/packages/editor/local-rich-editor-0.1.0.tgz
# or, to pick up rebuilds automatically without re-packing:
npm install <path-to-repo>/packages/editor
```

`vue` (3.3 or later) is a peer dependency. The editor uses your dashboard's copy, so only one copy of Vue is loaded.

### Using it in any project

The package is self-contained: its source imports only its own files and its declared dependencies (enforced by `test/package.spec.ts`), and nothing in it refers to this repository, the playground or the sample app. Any Vue 3 project can therefore consume it in one of three ways:

| Way | Command | When |
|---|---|---|
| Tarball | `npm install ./local-rich-editor-<version>.tgz` | Sharing a build by file or artifact store |
| Git dependency | `npm install git+ssh://…/Text_Editor.git#main` (run `npm run build` in `packages/editor` via `prepare`) | Internal projects tracking the repo |
| Private registry | `npm publish` from `packages/editor` after setting `"name"` to your scope and removing `"private"` if present | Several teams consuming released versions |

To publish to a registry:

```bash
cd packages/editor
npm version <patch|minor|major>   # a renamed prop or toolbar item is a major
npm run build
npm publish --registry https://your-registry.example.com
```

Requirements on the consuming side: Vue 3.3+, and a bundler that understands `package.json` `exports` (Vite, webpack 5, Rollup, esbuild). Import `@local/rich-editor/styles.css` once. The `./docx` and `./ai` entries work in Node without Vue or a DOM, so a backend can reuse them.

## Basic usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RichEditor } from '@local/rich-editor'
import '@local/rich-editor/styles.css'

const html = ref('<p>Hello</p>')
</script>

<template>
  <RichEditor v-model="html" layout="document" style="height: 80vh" />
</template>
```

To register it globally instead:

```ts
import { RichEditorPlugin } from '@local/rich-editor'
import '@local/rich-editor/styles.css'
app.use(RichEditorPlugin) // <RichEditor /> is then available in every component
```

### Nuxt

The editor needs the browser, so render it on the client only:

```vue
<ClientOnly><RichEditor v-model="html" /></ClientOnly>
```

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `v-model` / `modelValue` | `string \| JSONContent` | `''` | The document content |
| `content-format` | `'html' \| 'json'` | `'html'` | The format `v-model` emits |
| `layout` | `'inline' \| 'document'` | `'inline'` | `document` shows a white page on a grey background |
| `page-size` | `'A4' \| 'Letter'` | `'A4'` | Page size for the document layout, .docx export and printing |
| `auto-page-breaks` | `boolean` | `true` | Shows where pages end while typing (page layout only) |
| `chat-mode` | `'panel' \| 'floating'` | `'panel'` | Chat docked beside the page, or a window the user can drag and resize |
| `height` | `number \| string` | `400` (inline) | Height of the editor. `'auto'` grows with the content. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | `auto` follows the operating system setting |
| `toolbar` | `'full' \| 'basic' \| 'none' \| ToolbarItem[][]` | `'full'` | Toolbar preset, or your own groups of buttons |
| `features` | `{ tables, images, taskList, codeHighlight, docx, statusBar }` | all `true` | Switches features on or off |
| `editable` | `boolean` | `true` | `false` makes the editor read-only and hides the toolbar |
| `placeholder` | `string` | `'Start typing…'` | |
| `upload-image` | `(file: File) => Promise<string>` | – | Uploads the image to your backend and returns its URL. Without it, images are embedded as data URLs. |
| `max-image-size` | `number` (bytes) | 5 MB | |
| `fonts` | `string[]` | common fonts | Fonts offered in the font picker |
| `autosave-key` | `string` | – | Saves drafts to `localStorage` under this key |
| `document-name` | `string` | `'document'` | Default file name for downloads |
| `messages` | `Partial<Messages>` | English | Replaces any interface text (see `defaultMessages`) |
| `extensions` | `Extensions` | `[]` | Extra TipTap extensions to add |
| `autofocus` | `boolean` | `false` | |
| `ai` | `AiAdapter` | – | Turns on the AI Canvas. See [AI Canvas](#ai-canvas). |
| `ai-actions` | `AiQuickAction[]` | `DEFAULT_AI_ACTIONS` | Quick actions offered for a selection |
| `max-versions` | `number` | `30` | Versions kept in memory (a version is saved before each accepted AI change) |
| `v-model:chat-history` | `AiChatMessage[]` | – | The document chat conversation. Bind it to restore and save the chat per document. |
| `chat-starters` | `string[]` | 5 built-in questions | Starter questions shown in an empty chat |

`features` (except `ai`) and `extensions` are read once, when the editor mounts. To change them afterwards, remount the component, for example by changing its `:key`.

## Events

| Event | Payload |
|---|---|
| `update:modelValue` | `string \| JSONContent` |
| `ready` | `RichEditorExpose` (the API below) |
| `focus`, `blur` | `FocusEvent` |
| `error` | `{ type: 'image-type' \| 'image-size' \| 'image-upload' \| 'import' \| 'export' \| 'clipboard' \| 'ai', message, cause? }` |
| `saved` | Emitted when an autosave completes |
| `ai-request` | `AiRequest`: every AI request, e.g. for usage logging |
| `ai-applied` | `{ task, accepted }`: after suggestions are accepted |
| `version-created` | `EditorVersion`: save it to your backend if versions should outlive the page |
| `update:chatHistory` | `AiChatMessage[]`: the conversation after each question, answer or clear |
| `chat-message` | `AiChatMessage`: each question and answer, e.g. for logging |

## Methods (template ref)

```ts
const editor = ref<RichEditorExpose>()

editor.value.getHTML()
editor.value.getJSON()
editor.value.getText()
editor.value.getMarkdown()
editor.value.isEmpty()
editor.value.setContent('<p>New</p>')
editor.value.clear()
editor.value.focus()
await editor.value.exportDocx()              // Blob, e.g. to upload to your API
await editor.value.download('docx', 'report') // 'docx' | 'html' | 'markdown' | 'text' | 'json'
await editor.value.importFile(file)          // .docx | .html | .md | .txt | .json
editor.value.print()
editor.value.toggleFullscreen()
editor.value.editor                           // the underlying TipTap Editor, for advanced use

// AI Canvas (with the `ai` prop)
await editor.value.aiGenerate('A project update with a status table')
await editor.value.aiEditSelection('Make this more formal')
await editor.value.aiContinue()
await editor.value.aiEditDocument('Fix spelling everywhere')
editor.value.aiStop()
editor.value.getSuggestionCount()
editor.value.acceptAllSuggestions()
editor.value.rejectAllSuggestions()
editor.value.getVersions()                   // EditorVersion[], newest first
editor.value.restoreVersion(id)

// Chat with the document
editor.value.openChat()                        // or openChat(false) to close
await editor.value.askDocument('What are the open risks?')
editor.value.clearChat()
```

## Slots

`toolbar-start`, `toolbar-end` and `footer` each receive `{ editor }`. Use them to add your own controls, such as a "Save" button inside the editor frame.

---

## Theming

Every class name starts with `re-`, and the stylesheet sets no global styles. You restyle the editor with CSS variables. Menus and dialogs are rendered outside the editor element, so set the variables on `.re-portal` as well:

```css
.re-root,
.re-portal {
  --re-primary: #7c3aed;
  --re-primary-hover: #6d28d9;
  --re-primary-soft: rgba(124, 58, 237, 0.12);
  --re-radius: 4px;
  --re-ui-font: 'Inter', sans-serif;
}

/* Document font. Also passed to the .docx export, so downloads use the same font. */
.re-root { --re-font: 'Segoe UI', Arial, sans-serif; --re-font-size: 11pt; }
```

For the full list of variables, see `src/styles/tokens.css`.

## Custom toolbar

```vue
<RichEditor :toolbar="[['bold', 'italic', 'underline'], ['bulletList', 'orderedList'], ['link', 'image', 'table']]" />
```

Available items: `file` (downloads .docx), `undo`, `redo`, `heading`, `fontFamily`, `fontSize`, `bold`, `italic`, `underline`, `strike`, `code`, `superscript`, `subscript`, `color`, `highlight`, `clearFormatting`, `align`, `lineHeight`, `indent`, `outdent`, `bulletList`, `orderedList`, `taskList`, `blockquote`, `codeBlock`, `horizontalRule`, `pageBreak`, `link`, `image`, `table`, `specialChars`, `findReplace`, `pastePlain`, `print`, `fullscreen`, `ai` and `chat` (shown only when the `ai` prop is set).

When the toolbar doesn't fit, groups that don't fit move into a **More (⋯)** menu.

## Image uploads

```vue
<RichEditor :upload-image="upload" @error="onError" />

<script setup lang="ts">
async function upload(file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/uploads', { method: 'POST', body })
  if (!res.ok) throw new Error('Upload failed')
  return (await res.json()).url
}
</script>
```

A preview appears immediately while the upload runs. If the upload fails, the image is removed and an `error` event is emitted.

---

## AI Canvas

A way of working like Gemini Canvas: the AI writes a draft, and afterwards you point at what to change. Only that part is sent and regenerated. Every change appears as a **suggestion** (old text struck through, new text highlighted) until someone accepts or rejects it.

```vue
<script setup lang="ts">
import { RichEditor, createHttpAiAdapter } from '@local/rich-editor'
// Calls your backend, which calls Gemini. See examples/ai-server.
const ai = createHttpAiAdapter({ url: '/api/ai/complete' })
</script>

<template>
  <RichEditor v-model="html" :ai="ai" />
</template>
```

| What the user does | Where | Sent to the model |
|---|---|---|
| **Ask AI** about selected text, or pick a quick action (improve, fix grammar, shorter, longer, formal, casual, simplify, summarize, list, table, translate) | Menu below the selection · Ctrl+J · AI menu | The selection plus about 2,000 characters around it |
| **Generate content** | AI menu · Ctrl+J with nothing selected | The prompt; in an empty document it fills the page, otherwise it inserts after the current block |
| **Continue writing** | `api.aiContinue()` (not in the AI menu) | The text around the cursor |
| **Edit whole document** | `api.aiEditDocument(instruction)` (not in the AI menu) | All blocks with ids; the model returns **only the changed blocks** |
| Review | In the document: **Accept** / **Reject** on each suggestion; the AI bar: **Accept all**, **Reject all**, **Try again**, or type a follow-up to refine | – |
| **Version history** | AI menu | A snapshot is saved before every accepted AI change; **Restore** brings it back |

What the editor guarantees:

- **Only accepted content counts.** Pending suggestions are not in `v-model`, exports or autosave.
- **Accepting is one undo step.** Ctrl+Z undoes it; Esc rejects all pending suggestions.
- **Suggestions follow edits elsewhere.** If the text a suggestion covers is edited, the suggestion is discarded rather than overwriting the change.
- **Model output is checked.** It is parsed through the editor schema (scripts and unknown markup are dropped), and replaced blocks keep their alignment, indent and line spacing.
- **What gets lost.** The AI works in Markdown, so colors, fonts and highlights **inside the rewritten text** are not kept. Everything outside it is untouched.

### Chat with the document

The **Chat** button in the toolbar (or **AI → Chat with document**, or Ctrl+Alt+J) opens a panel beside the page, or an overlay on narrow screens.

- **Answers come from the document** and cite their sources as numbered links. Clicking one scrolls to the paragraph and highlights it. Links follow edits; if the source is deleted, the link is disabled.
- **Selected text** is attached to the next question ("Is this figure right?").
- **Follow-up questions** keep the conversation (the last 10 turns are sent).
- **Ask for a change** ("make the intro more formal and add a risks section"): the answer explains it, and the changes appear in the document as suggestions, with **Accept** / **Reject** in the message.
- **Use an answer:** **Copy**, **Insert in document** (after the current paragraph), or **Replace selection**. Insertions are suggestions too, and citation markers are removed.
- **Long documents:** up to about 150,000 characters (roughly 60 pages) are sent whole. Beyond that, the part around the cursor is sent, and the answer says so.
- **Cost:** each question sends the document. It's placed first in the prompt so Gemini's implicit caching can reuse it for follow-ups.

```vue
<RichEditor v-model="content" :ai="ai" v-model:chat-history="chat" :chat-starters="['What changed since v1?', 'List open risks']" />
```

Turn the chat off with `:features="{ chat: false }"`. Restored chat history is shown, but its source links are disabled: the document may have changed since.

### Adapters

An adapter is one function: `complete(request, { signal, onChunk }) => Promise<string>`.

| Adapter | Use |
|---|---|
| `createHttpAiAdapter({ url, headers?, credentials? })` | Your backend speaks the reference protocol (JSON request, NDJSON stream). `headers` may be a function, for fresh auth tokens. |
| `createDemoAiAdapter()` | Offline, deterministic output for demos and tests. It never calls a model. |
| Your own | Any backend: call it, stream text with `onChunk(delta)`, return the full text, and respect `signal` for Stop |

`request` contains the `task`, `instruction`, `selection`/`context`/`blocks`, and a ready-made `prompt` (`{ system, user }`). In production, rebuild the prompt on the server with `buildPrompt(request)` from `@local/rich-editor/ai` (no Vue or DOM needed), so the endpoint can't be used as a general-purpose model proxy.

### Custom quick actions

```ts
import { DEFAULT_AI_ACTIONS, type AiQuickAction } from '@local/rich-editor'

const aiActions: AiQuickAction[] = [
  ...DEFAULT_AI_ACTIONS,
  { id: 'exec', label: 'Executive summary', instruction: 'Rewrite as a three-bullet executive summary.' },
  { id: 'ko', label: 'Translate to Korean', instruction: 'Translate this text to Korean.' },
]
```

Default labels come from `messages` (keys `aiAction…`), so they translate with the rest of the UI. Set `prefill: true` to put the instruction in the input for the user to complete instead of sending it.

### Styling

CSS variables: `--re-ai-accent`, `--re-ai-accent-soft`, `--re-ai-added-bg`, `--re-ai-added-border`, `--re-ai-removed-bg`, `--re-ai-removed-text`. Each has a dark-theme value.

## Word (.docx)

The exporter builds native Word content, not HTML wrapped in a .docx file:

| Editor | Word |
|---|---|
| Headings | Built-in Heading 1–6 styles, so Word's navigation pane and table of contents work |
| Fonts, sizes, colors, highlight | Run properties. Highlights use exact shading colors instead of Word's 16 highlight colors. |
| Alignment, indent, line spacing | Paragraph properties |
| Bulleted and numbered lists | Real Word numbering, including nesting and the start number |
| Tables | Native tables with column widths, merged cells (gridSpan and vMerge), repeating header row, cell shading |
| Images | Embedded at the displayed size, with alignment, caption, alt text, and square text wrapping for wrapped images. WebP and SVG are converted to PNG. |
| Links, code, quotes, horizontal lines | Hyperlinks, Consolas font with syntax colors, left border, bottom border |
| Page | A4 or Letter with 1-inch margins, the same width as the editor's document layout |

To use it without mounting the component, for example to export on save:

```ts
import { exportDocx, importDocx } from '@local/rich-editor/docx'
const blob = await exportDocx(json, { pageSize: 'A4', font: 'Calibri', fontSizePt: 11 })
const html = await importDocx(fileOrBlob)
```

**Known limitations:**
- Word lays out text slightly differently from a browser, so line breaks can fall in different places.
- A font the reader doesn't have is replaced with another font. Offer common fonts through the `fonts` prop to avoid this.
- Importing a .docx keeps structure and basic formatting, but drops font colors and sizes and simplifies text boxes, headers and footers. This is a limitation of `mammoth`.

The .docx, Markdown and syntax-highlighting libraries load only when they are first needed.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Bold / Italic / Underline | Ctrl+B / Ctrl+I / Ctrl+U |
| Strikethrough / Inline code | Ctrl+Shift+S / Ctrl+E |
| Link | Ctrl+K |
| Find and replace | Ctrl+F |
| Bulleted / Numbered / Check list | Ctrl+Shift+8 / 7 / 9 |
| Indent / Outdent | Ctrl+] / Ctrl+[ (Tab / Shift+Tab in lists) |
| Align left / center / right / justify | Ctrl+Shift+L / E / R / J |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z |
| Paste as plain text | Ctrl+Shift+V |
| Ask AI (selection) / Generate (no selection) | Ctrl+J |
| Reject all AI suggestions | Esc |
| Open or close the document chat | Ctrl+Alt+J |
| Next table cell | Tab |

On macOS, use ⌘ instead of Ctrl.

---

## Development

```bash
npm install
npm run dev                      # playground at http://localhost:5173
npm run build                    # build the package
npm run test -w @local/rich-editor   # unit tests (Vitest)
npx playwright test              # end-to-end tests in the installed Edge (set PW_CHANNEL=chrome for Chrome)
npm run typecheck
```
