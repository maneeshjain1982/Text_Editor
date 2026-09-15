# @local/rich-editor

> This is the API reference. For step-by-step setup in an existing app, see the **[Integration guide](../../docs/INTEGRATION.md)**.

A rich text editor component for **Vue 3**. It supports tables, images and Word (.docx) import and export, and it is designed to be embedded in an existing dashboard.

- Formatting: bold, italic, underline, strikethrough, inline code, superscript and subscript, font, size, text color, highlight, and clear formatting
- Paragraphs: normal text and headings H1–H6, alignment, line spacing, indent, bulleted, numbered and check lists, quote, code block with syntax highlighting, horizontal line
- **Tables:** insert with a grid picker, add or delete rows and columns, merge and split cells, header row and column, column resizing, cell color
- **Images:** upload, drag and drop, paste, or insert by URL. You can resize them, align them, wrap text around them, and add alt text and a caption. Uploads can go to your backend through an optional adapter.
- Editing tools: undo and redo, find and replace, links, special characters and emoji, paste cleanup (Word and Google Docs), paste as plain text, word and character count
- Files: open **.docx**, .html, .md, .txt and .json; download **.docx**, .html, .md, .txt and .json; print or save as PDF
- Two layouts, `document` (an A4 or Letter page) and `inline`, plus full screen, light, dark and automatic themes
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

`features` and `extensions` are read once, when the editor mounts. To change them afterwards, remount the component, for example by changing its `:key`.

## Events

| Event | Payload |
|---|---|
| `update:modelValue` | `string \| JSONContent` |
| `ready` | `RichEditorExpose` (the API below) |
| `focus`, `blur` | `FocusEvent` |
| `error` | `{ type: 'image-type' \| 'image-size' \| 'image-upload' \| 'import' \| 'export' \| 'clipboard', message, cause? }` |
| `saved` | Emitted when an autosave completes |

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

Available items: `file`, `undo`, `redo`, `heading`, `fontFamily`, `fontSize`, `bold`, `italic`, `underline`, `strike`, `code`, `superscript`, `subscript`, `color`, `highlight`, `clearFormatting`, `align`, `lineHeight`, `indent`, `outdent`, `bulletList`, `orderedList`, `taskList`, `blockquote`, `codeBlock`, `horizontalRule`, `link`, `image`, `table`, `specialChars`, `findReplace`, `pastePlain`, `print`, `fullscreen`.

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
