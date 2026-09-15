# Integration Guide

This guide explains how to add `@local/rich-editor` to an existing Vue 3 front end: installing it, placing it on a page, saving and loading content, uploading images, matching your design, and exporting to Word.

For the complete list of props, events and methods, see the [API reference](../packages/editor/README.md).

**Contents**

1. [Before you start](#1-before-you-start)
2. [Build the package](#2-build-the-package)
3. [Install it in your app](#3-install-it-in-your-app)
4. [Register and render the editor](#4-register-and-render-the-editor)
5. [Load and save content](#5-load-and-save-content)
6. [Image uploads](#6-image-uploads)
7. [Match your dashboard's design](#7-match-your-dashboards-design)
8. [Word export and import](#8-word-export-and-import)
9. [Common scenarios](#9-common-scenarios)
10. [Security](#10-security)
11. [Updating the package](#11-updating-the-package)
12. [Troubleshooting](#12-troubleshooting)
13. [Integration checklist](#13-integration-checklist)

---

## 1. Before you start

Check that your app meets these requirements:

| Requirement | How to check |
|---|---|
| Vue **3.3 or later** | `npm ls vue` |
| A bundler that supports `package.json` `exports` | Vite (any version), webpack 5 (Vue CLI 5), Rollup, esbuild. Vue CLI 4 (webpack 4) is **not** supported. |
| TypeScript apps: `moduleResolution` is `"bundler"` or `"node"` | Check `tsconfig.json`. Projects created with `create-vue` use `"bundler"`. |

**Compatibility:** the package has been verified in a Vite + Vue 3.5 app, both JavaScript and TypeScript. Webpack 5 and Nuxt setups should work based on the package format but have not been tested. Try the editor on one page first.

The package brings its own dependencies: TipTap, `docx`, `mammoth`, `marked`, `turndown`, `lowlight` and `lucide-vue-next`. It does **not** bundle Vue; it uses the copy your app already has.

## 2. Build the package

Do this in the editor repository, not in your app:

```bash
cd path/to/Editor
npm install
npm run build
npm run pack
```

This creates `packages/editor/local-rich-editor-0.1.0.tgz`. The file name includes the version from `packages/editor/package.json`.

## 3. Install it in your app

Pick one method.

### Option A: tarball (recommended for teams and CI)

Copy the `.tgz` file into your app's repository, for example `vendor/`, and install it:

```bash
npm install ./vendor/local-rich-editor-0.1.0.tgz
```

`package.json` then records a path that works on every machine and in CI:

```json
"dependencies": {
  "@local/rich-editor": "file:vendor/local-rich-editor-0.1.0.tgz"
}
```

### Option B: folder link (for developing the editor and the app side by side)

```bash
npm install ../Editor/packages/editor
```

The app reads `packages/editor/dist` directly, so after each change to the editor run `npm run build` in the editor repository, then restart your app's dev server.

> **Vite and linked packages:** if you see "Invalid VNode type" or two copies of Vue, add `resolve: { dedupe: ['vue'] }` to your `vite.config.ts`.

### Check the install

```bash
npm ls @local/rich-editor vue
```

The output should list one `vue` version, with the editor's copy marked `deduped`.

## 4. Register and render the editor

### 4.1 Import the component locally (recommended)

Import it only in the pages that need it, so pages without the editor don't load it:

```vue
<!-- src/views/DocumentEditView.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { RichEditor } from '@local/rich-editor'

const content = ref('<p>Hello</p>')
</script>

<template>
  <RichEditor v-model="content" />
</template>
```

Import the stylesheet **once**, in your app's entry file:

```ts
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import '@local/rich-editor/styles.css'

createApp(App).mount('#app')
```

### 4.2 Or register it globally

```ts
// src/main.ts
import { RichEditorPlugin } from '@local/rich-editor'
import '@local/rich-editor/styles.css'

app.use(RichEditorPlugin) // <RichEditor> is now available in every template
```

### 4.3 Give it a size

The editor fills whatever space it is given. Choose one approach:

```vue
<!-- Fixed height, inline layout (default): good for forms and cards -->
<RichEditor v-model="content" :height="400" />

<!-- Fill a container, document layout: good for a full editing page -->
<div style="height: calc(100vh - 160px)">
  <RichEditor v-model="content" layout="document" height="100%" />
</div>

<!-- Grow with the content (no internal scrollbar) -->
<RichEditor v-model="content" height="auto" />
```

If the editor appears collapsed or has no scrollbar, its parent probably has no height. See [Troubleshooting](#12-troubleshooting).

### 4.4 Choose the toolbar

```vue
<RichEditor toolbar="full" />                       <!-- everything (default) -->
<RichEditor toolbar="basic" />                      <!-- common formatting, links, image, table -->
<RichEditor :toolbar="[['bold', 'italic', 'underline'], ['bulletList', 'orderedList'], ['link']]" />
<RichEditor toolbar="none" />                       <!-- no toolbar (shortcuts still work) -->
```

To switch whole features off, including their shortcuts, menus and paste handling, use `features`:

```vue
<RichEditor :features="{ images: false, tables: true, docx: false, statusBar: false }" />
```

### 4.5 TypeScript

All types are exported:

```ts
import type {
  RichEditorExpose, // methods available through a template ref
  EditorContent,    // string | JSONContent
  EditorError,
  ToolbarConfig,
  UploadImageFn,
} from '@local/rich-editor'

const editorRef = ref<RichEditorExpose>()
```

## 5. Load and save content

### 5.1 Choose a storage format

| Format | Prop | Best for |
|---|---|---|
| **HTML** (default) | `content-format="html"` | Showing content elsewhere, email, search indexing |
| **JSON** | `content-format="json"` | Lossless storage, server-side processing, server-side Word export |

Both keep all formatting. Pick one and store it consistently.

### 5.2 A complete edit page

This example loads a document, tracks unsaved changes, saves with a button or Ctrl+S, and warns before leaving the page.

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { RichEditor, type EditorError, type RichEditorExpose } from '@local/rich-editor'
import { api } from '@/services/api' // your HTTP client

const route = useRoute()
const editorRef = ref<RichEditorExpose>()

const title = ref('')
const content = ref('')
const savedContent = ref('')
const loading = ref(true)
const saving = ref(false)

const isDirty = computed(() => content.value !== savedContent.value)

onMounted(async () => {
  const doc = await api.get(`/documents/${route.params.id}`)
  title.value = doc.title
  content.value = doc.html
  loading.value = false
})

async function save() {
  if (!isDirty.value || saving.value) return
  saving.value = true
  try {
    await api.put(`/documents/${route.params.id}`, { title: title.value, html: content.value })
    savedContent.value = content.value
  } finally {
    saving.value = false
  }
}

// The editor normalises HTML on load (e.g. adds attributes), so treat that first update as the saved state.
function onReady(editorApi: RichEditorExpose) {
  savedContent.value = editorApi.getHTML()
}

// Ctrl+S / Cmd+S
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

onBeforeRouteLeave(() => !isDirty.value || window.confirm('You have unsaved changes. Leave anyway?'))

function onError(error: EditorError) {
  // Plug into your dashboard's notification system
  console.warn(error.type, error.message)
}
</script>

<template>
  <div v-if="loading">Loading…</div>
  <div v-else class="page">
    <header>
      <input v-model="title" />
      <button :disabled="!isDirty || saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
    </header>

    <!-- key: remount when navigating between documents -->
    <RichEditor
      :key="String(route.params.id)"
      ref="editorRef"
      v-model="content"
      layout="document"
      height="100%"
      :document-name="title || 'document'"
      @ready="onReady"
      @error="onError"
    />
  </div>
</template>
```

Notes on this example:

- **Render after loading.** Wait until the data has arrived before rendering the editor (`v-if="!loading"`). This avoids an empty undo step and a false "unsaved changes" state.
- **Normalised HTML.** The editor rewrites HTML into a standard form when it loads it, for example adding `colspan="1"` to table cells. Compare against `getHTML()` from the `ready` event rather than the raw HTML from your API.
- **Frequent updates.** `v-model` updates on every keystroke. For autosave to your server, debounce the request, for example to 1–2 seconds after typing stops.

### 5.3 Draft recovery in the browser

```vue
<RichEditor v-model="content" :autosave-key="`doc-draft-${documentId}`" />
```

Drafts are saved to `localStorage` 800 ms after the last change. When the editor mounts with **empty** content and a draft exists, it restores the draft. Clear the key after a successful save to the server:

```ts
localStorage.removeItem(`doc-draft-${documentId}`)
```

### 5.4 Using the editor inside a form

The editor works with `v-model`, so it fits form libraries. For example, with VeeValidate:

```vue
<script setup lang="ts">
import { useField } from 'vee-validate'
const { value, errorMessage, handleBlur } = useField<string>('body', (v) =>
  v && v.replace(/<[^>]*>/g, '').trim() ? true : 'Body is required',
)
</script>

<template>
  <RichEditor v-model="value" :height="300" @blur="handleBlur" />
  <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
</template>
```

To check for empty content, use `editorRef.value.isEmpty()`. An "empty" editor still contains `<p></p>`.

## 6. Image uploads

Without configuration, images are embedded in the content as base64 data URLs. That's simple, but it makes documents large: a 2 MB photo adds about 2.7 MB to every save. **For production, store images on your backend.**

### 6.1 Frontend

```vue
<script setup lang="ts">
import type { UploadImageFn } from '@local/rich-editor'

const uploadImage: UploadImageFn = async (file) => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/uploads/images', {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const { url } = await res.json()
  return url // absolute or root-relative URL the browser can load
}
</script>

<template>
  <RichEditor v-model="content" :upload-image="uploadImage" :max-image-size="10 * 1024 * 1024" @error="onError" />
</template>
```

What happens when a user adds an image:

1. The editor checks the file type (PNG, JPEG, GIF, WebP, SVG, BMP) and size. Invalid files trigger the `error` event (`image-type` / `image-size`) and show a message.
2. A preview is inserted immediately, marked "Uploading…".
3. Your function is called. When it resolves, the preview's `src` is replaced with the returned URL.
4. If it rejects, the preview is removed and `error` is emitted with type `image-upload`.

This works the same for the Image dialog, drag and drop, and pasting.

### 6.2 Backend contract

| | |
|---|---|
| **Request** | `POST` with `multipart/form-data`, one field (named however you choose in `uploadImage`) |
| **Response** | Anything; your `uploadImage` function extracts the URL |
| **URL** | Must stay valid long-term, because it is stored inside document content |
| **CORS** | If images are served from another domain, allow `GET` from your app's origin. **Word export fetches each image** from the browser to embed it. |
| **Validation** | Check the file type and size again on the server; don't rely on the browser check |

## 7. Match your dashboard's design

### 7.1 Colors, fonts and shapes

All styling uses CSS variables. Override them in a global stylesheet that loads **after** `@local/rich-editor/styles.css`.

Include `.re-portal` in the selector: dropdowns, menus and dialogs are rendered at the end of `<body>`, outside the editor element.

```css
/* src/styles/editor-theme.css */
.re-root,
.re-portal {
  /* brand */
  --re-primary: #7c3aed;
  --re-primary-hover: #6d28d9;
  --re-primary-soft: rgba(124, 58, 237, 0.12);

  /* interface text, taken from your design system */
  --re-ui-font: 'Inter', system-ui, sans-serif;
  --re-ui-font-size: 14px;

  /* shape */
  --re-radius: 6px;
  --re-radius-sm: 4px;
  --re-border: #e4e4e7;
}

/* Document text. These values are also passed to Word export. */
.re-root {
  --re-font: Arial, sans-serif;
  --re-font-size: 11pt;
}
```

The most useful variables:

| Variable | Controls |
|---|---|
| `--re-primary`, `--re-primary-hover`, `--re-primary-soft`, `--re-on-primary` | Active buttons, links, focus rings, primary buttons |
| `--re-bg`, `--re-toolbar-bg`, `--re-canvas`, `--re-surface-raised`, `--re-hover` | Backgrounds: editor, toolbar, area around the page, menus, hover |
| `--re-text`, `--re-muted`, `--re-border`, `--re-border-subtle` | Text and borders |
| `--re-ui-font`, `--re-ui-font-size` | Toolbar, menus and dialogs |
| `--re-font`, `--re-font-size`, `--re-line-height` | Document content |
| `--re-radius`, `--re-radius-sm`, `--re-shadow` | Shape and elevation |
| `--re-page-padding` | Page margins in the document layout |

The full list, including dark-theme values, is in `packages/editor/src/styles/tokens.css`.

### 7.2 Remove the editor's outer frame

When the editor sits inside one of your cards, you may want your card's border instead of the editor's:

```css
.my-card .re-root {
  border: 0;
  border-radius: 0;
}
```

### 7.3 Follow your dashboard's dark mode

Pass your theme state to the editor:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const editorTheme = computed(() => (themeStore.isDark ? 'dark' : 'light'))
</script>

<template>
  <RichEditor v-model="content" :theme="editorTheme" />
</template>
```

Use `theme="auto"` to follow the operating system instead. To customise dark colors, override the variables under `.re-theme-dark`:

```css
.re-theme-dark {
  --re-bg: #18181b;
  --re-primary: #a78bfa;
}
```

### 7.4 Stacking order (z-index)

Menus use `z-index: 2147483100`, dialogs `2147483200`, and full-screen mode `2147483000`, so they appear above typical dashboard headers and sidebars. If your app uses higher values, lower the editor's:

```css
.re-popover { z-index: 3000; }
.re-modal-backdrop { z-index: 3100; }
.re-fullscreen { z-index: 2900; }
```

### 7.5 Interface language

Every interface string can be replaced. See `defaultMessages` for the keys:

```vue
<script setup lang="ts">
import type { Messages } from '@local/rich-editor'

const messagesKo: Partial<Messages> = {
  bold: '굵게',
  italic: '기울임꼴',
  insertTable: '표 삽입',
  words: '{count}단어',
  // …keys you don't provide fall back to English
}
</script>

<template>
  <RichEditor v-model="content" :messages="messagesKo" />
</template>
```

## 8. Word export and import

### 8.1 In the browser

The **File** menu in the toolbar already offers **Open** and **Download as Word**. To trigger them from your own buttons:

```vue
<script setup lang="ts">
const editorRef = ref<RichEditorExpose>()

const downloadWord = () => editorRef.value?.download('docx', 'quarterly-report')

async function uploadWordToServer() {
  const blob = await editorRef.value!.exportDocx()
  const form = new FormData()
  form.append('file', blob, 'report.docx')
  await fetch('/api/documents/42/attachments', { method: 'POST', body: form })
}

function openWordFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) editorRef.value?.importFile(file) // .docx, .html, .md, .txt or .json
}
</script>

<template>
  <RichEditor ref="editorRef" v-model="content" layout="document" page-size="A4" />
  <button @click="downloadWord">Download .docx</button>
  <input type="file" accept=".docx" @change="openWordFile" />
</template>
```

`page-size` (`A4` or `Letter`) applies to the on-screen page, printing and the Word file.

### 8.2 Without the component (for example, a "Download" button in a list view)

```ts
import { exportDocx } from '@local/rich-editor/docx'

async function downloadFromList(documentId: string) {
  const { json } = await api.get(`/documents/${documentId}?format=json`)
  const blob = await exportDocx(json, { pageSize: 'A4', font: 'Calibri', fontSizePt: 11, title: 'Report' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: 'report.docx' }).click()
  URL.revokeObjectURL(url)
}
```

`exportDocx` takes **JSON** content, so use `content-format="json"` if you plan to export outside the editor. It also runs in Node 18+ for server-side export, with two restrictions there: image URLs must be reachable from the server, and SVG or WebP images are replaced with their alt text, because converting them needs a browser.

### 8.3 Keeping Word output faithful

- **Fonts:** keep `--re-font` and the `fonts` prop limited to fonts your readers have, such as Calibri, Arial, Times New Roman or Georgia.
- **Layout:** use `layout="document"`. It shows the same page width and margins as the Word file.
- **Images:** store images on a CORS-enabled host (see [section 6](#6-image-uploads)) so export can embed them.
- **Imported files:** importing .docx keeps structure, lists, tables, images, links and bold/italic/underline, but not font colors or sizes.

## 9. Common scenarios

### Showing saved content without editing

The simplest option is a read-only editor, which gives identical rendering with no toolbar:

```vue
<RichEditor :model-value="doc.html" :editable="false" height="auto" :features="{ statusBar: false }" />
```

For a lighter page, such as a list with previews, render the HTML with the editor's content styles. **Sanitise it first** (see [section 10](#10-security)):

```vue
<article class="re-export re-content" v-html="safeHtml" />
```

### Permissions

```vue
<RichEditor v-model="content" :editable="can('documents.edit')" :toolbar="can('documents.edit') ? 'full' : 'none'" />
```

`editable` can be toggled at any time without remounting.

### Several editors on one page

Each `<RichEditor>` is independent. Give each its own `v-model`, and its own `autosave-key` if you use drafts.

### Inside a modal or drawer

```vue
<el-dialog v-model="open" width="900px" destroy-on-close>
  <RichEditor v-model="content" :height="500" />
</el-dialog>
```

Render the editor only while the dialog is open (`destroy-on-close` or `v-if`). If your dialog library traps focus, see [Troubleshooting](#12-troubleshooting).

### Adding your own buttons to the toolbar area

```vue
<RichEditor v-model="content">
  <template #toolbar-end="{ editor }">
    <div class="my-toolbar-extra">
      <button @click="editor?.chain().focus().insertContent('{{customer_name}}').run()">Insert placeholder</button>
    </div>
  </template>
</RichEditor>
```

`editor` is the TipTap `Editor` instance. See the [TipTap commands reference](https://tiptap.dev/docs/editor/api/commands).

### Custom TipTap extensions

```vue
<script setup lang="ts">
import { Extension } from '@tiptap/core'

const SaveShortcut = Extension.create({
  name: 'saveShortcut',
  addKeyboardShortcuts: () => ({ 'Mod-s': () => (save(), true) }),
})
</script>

<template>
  <RichEditor v-model="content" :extensions="[SaveShortcut]" />
</template>
```

Import `@tiptap/*` packages at the same version the editor uses (`npm ls @tiptap/core`) to avoid duplicate copies.

### Nuxt 3

```vue
<template>
  <ClientOnly>
    <RichEditor v-model="content" />
  </ClientOnly>
</template>
```

Add the stylesheet in `nuxt.config.ts`: `css: ['@local/rich-editor/styles.css']`.

## 10. Security

The editor's schema only keeps elements and attributes it recognises, so pasted or imported scripts never enter the editor. **Your backend still receives HTML from the browser, and a user can send anything to your API.** Follow these rules:

1. **Sanitise on the server** before storing or returning HTML that others will see. Use an allow-list sanitiser such as DOMPurify (Node), bleach (Python), HtmlSanitizer (.NET) or OWASP Java HTML Sanitizer. Allow what the editor produces:
   - **Tags:** `p h1–h6 strong em u s code pre mark sub sup a ul ol li blockquote hr br table colgroup col tbody tr th td figure img figcaption span label input div`
   - **Attributes:** `style class href target rel src alt title width colspan rowspan colwidth data-type data-checked data-align data-indent data-background data-color type checked`
   - **Link URLs:** only `http`, `https` and `mailto`
2. **Sanitise before `v-html`** when you display content outside the editor:
   ```ts
   import DOMPurify from 'dompurify'
   const safeHtml = computed(() => DOMPurify.sanitize(doc.value.html))
   ```
3. **Content Security Policy:** the editor needs `img-src data: blob:` (previews and embedded images) plus your image host, and `style-src 'unsafe-inline'` (formatting is stored as inline styles). It doesn't need `unsafe-eval`.
4. **Uploads:** check type and size on the server, and serve uploaded files from a separate domain or with `Content-Disposition` and `X-Content-Type-Options: nosniff`. SVG files can contain scripts, so sanitise SVGs or reject them on the server.

## 11. Updating the package

1. In the editor repository: update the version, then run `npm run build && npm run pack`.
2. In your app: replace the tarball and reinstall.
   ```bash
   npm install ./vendor/local-rich-editor-0.2.0.tgz
   ```
3. If npm or Vite still serves the old version, clear the cache and restart.
   ```bash
   rm -rf node_modules/.vite && npm run dev
   ```
4. Check the changelog or release notes for renamed props or events, which come with a major version change.

Stored content does not need migrating between versions. The HTML and JSON formats are stable.

## 12. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Editor has no styles: unstyled buttons, no toolbar icons layout | `@local/rich-editor/styles.css` is not imported. Add it to `main.ts` (section 4.1). |
| Editor is collapsed, or content overflows the page without scrolling | The parent has no height. Give the container a height, or use `height="auto"` (section 4.3). |
| `Failed to resolve component: RichEditor` | Not imported or registered. Import it in the component or call `app.use(RichEditorPlugin)`. |
| "Invalid VNode type", `inject() can only be used inside setup()`, or hooks not firing | Two copies of Vue are loaded (usually with Option B installs). Add `resolve: { dedupe: ['vue'] }` to the Vite config, then delete `node_modules/.vite`. |
| `Cannot find module '@local/rich-editor/docx'` or missing types | Set `moduleResolution` to `"bundler"` or `"node"` in `tsconfig.json`. `node16` and `nodenext` are not supported. |
| `Module not found … exports` with webpack | webpack 4 / Vue CLI 4 doesn't support `exports`. Upgrade to webpack 5 / Vue CLI 5 or Vite. |
| Dropdowns or dialogs appear behind the dashboard header or modal | Adjust `z-index` (section 7.4). |
| Clicking inside a dropdown or dialog closes it, or its inputs can't be focused, when the editor is in a UI-library modal | The modal's focus trap blocks the editor's menus, which are rendered in `<body>`. Disable the trap: `:trap-focus="false"` or `:lock-scroll="false"`, depending on the library. |
| Brand colors don't apply to dropdowns or dialogs | Add `.re-portal` to your variable selector (section 7.1). |
| The first Word export reloads the page in development | Vite's dependency pre-bundling. Add `optimizeDeps: { include: ['@local/rich-editor/docx', 'docx', 'mammoth', 'marked', 'turndown', 'turndown-plugin-gfm'] }` to `vite.config.ts`. This only affects development. |
| Images missing from the Word file (shown as `[alt text]`) | The image URL couldn't be fetched, usually because of CORS. Allow your app's origin on the image host (section 6.2). |
| "Unsaved changes" warning right after loading | The editor normalises HTML on load. Compare against `getHTML()` from the `ready` event (section 5.2). |
| Content changes after load don't show | Replace the whole value (`content.value = newHtml`) rather than changing it in place, or call `editorRef.value.setContent()`. |
| Changing `features` or `extensions` has no effect | These are read when the editor mounts. Change the component's `:key` to remount it. |
| Ctrl+F opens the browser's search | Ctrl+F opens the editor's find bar only when focus is inside the editor. |

## 13. Integration checklist

- [ ] Vue 3.3+, a bundler that supports `exports`, and a compatible TypeScript `moduleResolution`
- [ ] Package installed from the `.tgz`; `npm ls vue` shows a single copy
- [ ] `@local/rich-editor/styles.css` imported once in `main.ts`
- [ ] Editor container has a defined height
- [ ] Content format chosen (HTML or JSON) and saved and loaded through your API
- [ ] Unsaved-changes handling compares against the `ready` state
- [ ] `upload-image` connected to your backend; server checks type and size; CORS allows your app
- [ ] HTML sanitised on the server, and before any `v-html`
- [ ] `error` event connected to your notification system
- [ ] Theme variables set on `.re-root, .re-portal`; `theme` follows your dark mode
- [ ] `z-index` checked against your header, sidebar and modals
- [ ] Toolbar and `features` match the page's purpose; `editable` follows permissions
- [ ] Word export tried with a real document and opened in Word
- [ ] Tested at your smallest supported screen width
