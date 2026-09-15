# Docs Hub: sample app for `@local/rich-editor`

A small document manager built with **Vue 3, TypeScript, Vite and Vue Router**. It installs the rich text editor as a package, from the packed `.tgz` file, exactly as an existing dashboard would. Use it to:

- see a working integration end to end
- copy integration code into your own front end
- check a new editor build before handing it to other teams (see [`../sample-app-tests`](../sample-app-tests))

**Contents**

1. [Prerequisites](#1-prerequisites)
2. [Run the sample app](#2-run-the-sample-app)
3. [Update the app after editor changes](#3-update-the-app-after-editor-changes)
4. [How the editor is integrated](#4-how-the-editor-is-integrated)
5. [Project structure](#5-project-structure)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Prerequisites

| Requirement | Check with |
|---|---|
| Node **20.19+ or 22.12+** | `node -v` |
| npm 10+ | `npm -v` |
| The editor repository cloned, with this app at `examples/sample-app` | – |

Commands below assume you start from the **repository root** (`E:\Samsung\Editor`).

## 2. Run the sample app

### First time

```bash
# 1. Install the editor repository's dependencies
npm install

# 2. Build the editor and pack it into a tarball
#    → packages/editor/local-rich-editor-0.1.0.tgz
npm run build
npm run pack

# 3. Install the sample app (this installs the editor from that tarball)
cd examples/sample-app
npm install

# 4. Start it
npm run dev
```

Open **http://localhost:5174**. The sample app uses port 5174, so it can run next to the editor playground on 5173.

Steps 2 and 3 can also be run from inside `examples/sample-app` as `npm run editor:pack && npm install`.

### Later

```bash
cd examples/sample-app
npm run dev
```

### Production build

```bash
cd examples/sample-app
npm run build      # type-checks with vue-tsc, then builds to dist/
npm run preview    # serves dist/ at http://localhost:4173
```

### What to try

| Try this | Where |
|---|---|
| Create a document: type, format, add a table or image, then **Save** (or Ctrl+S) | **New document** on the list page |
| Leave the page with unsaved changes; you're asked to confirm | Edit page, then **Documents** in the header |
| Download a Word file with the editor open | **Download .docx** on the edit page |
| Download a Word file without opening the editor | **Download .docx** in a list row |
| View a document read-only | Click a document's title in the list |
| Switch the whole app, editor included, to dark mode | **Dark mode** in the header |
| Add the app's custom closing line | **Insert sign-off** above the page |
| Simulate a failed image upload | Insert an image whose file name starts with `fail-` |

Documents are saved in the browser's `localStorage` by a mock API, so they stay after a reload. To reset, run `localStorage.clear()` in the browser console.

## 3. Update the app after editor changes

The app uses the **packed** editor, so changes to the editor source only appear after repacking and reinstalling:

```bash
cd examples/sample-app
npm run editor:update     # build + pack the editor, then reinstall it here
npm run dev
```

If the dev server was already running, restart it. If the old editor still appears, see [Troubleshooting](#6-troubleshooting).

To confirm the new build works end to end, run the validation suite:

```bash
cd ../sample-app-tests
npm install               # first time only
npm run validate          # repack, reinstall, run package checks + browser tests
```

---

## 4. How the editor is integrated

Each step below matches a section of the [integration guide](../../docs/INTEGRATION.md) and shows the exact file in this app that implements it. Follow the same steps to add the editor to your own front end.

### Step 1: Add the package as a dependency

**File:** [`package.json`](package.json)

```json
"dependencies": {
  "@local/rich-editor": "file:../../packages/editor/local-rich-editor-0.1.0.tgz",
  "vue": "^3.5.42",
  "vue-router": "^5.3.1"
}
```

The dependency points at the packed tarball, not at `packages/editor/src`. Your app does the same with the path to wherever you keep the `.tgz`, for example `file:vendor/local-rich-editor-0.1.0.tgz`.

Two helper scripts keep it up to date:

```json
"editor:pack": "npm --prefix ../.. run build && npm --prefix ../.. run pack",
"editor:update": "npm run editor:pack && npm install @local/rich-editor@file:../../packages/editor/local-rich-editor-0.1.0.tgz"
```

**Guide:** [§3 Install it in your app](../../docs/INTEGRATION.md#3-install-it-in-your-app)

### Step 2: Configure the bundler

**File:** [`vite.config.ts`](vite.config.ts)

```ts
export default defineConfig({
  plugins: [vue()],
  server: { port: 5174, strictPort: true },
  optimizeDeps: {
    include: ['@local/rich-editor/docx', 'docx', 'mammoth', 'marked', 'turndown', 'turndown-plugin-gfm'],
  },
})
```

- No alias to the editor source is needed; Vite resolves `@local/rich-editor` from `node_modules`.
- `optimizeDeps.include` pre-bundles what is loaded on demand: the editor's `/docx` entry, used when exporting from the list, and the libraries behind export and import. Without it, the first Word export in development reloads the page. Production builds don't need it.

### Step 3: Import the styles once

**File:** [`src/main.ts`](src/main.ts)

```ts
import '@local/rich-editor/styles.css'   // editor styles
import './styles/app.css'                // app styles
import './styles/editor-theme.css'       // editor theme overrides (must come after the editor styles)
```

**Guide:** [§4.1 Register and render](../../docs/INTEGRATION.md#41-import-the-component-locally-recommended)

### Step 4: Load editor pages on demand

**File:** [`src/router.ts`](src/router.ts)

```ts
routes: [
  { path: '/', name: 'documents', component: DocumentList },
  { path: '/documents/new', name: 'new', component: () => import('./views/DocumentEdit.vue') },
  { path: '/documents/:id/edit', name: 'edit', component: () => import('./views/DocumentEdit.vue') },
  { path: '/documents/:id', name: 'view', component: () => import('./views/DocumentView.vue') },
]
```

The list page doesn't include the editor. Its code downloads only when an edit or view page opens.

### Step 5: Put the editor on the edit page

**File:** [`src/views/DocumentEdit.vue`](src/views/DocumentEdit.vue)

```vue
<script setup lang="ts">
import { RichEditor, type EditorContent, type EditorError, type JSONContent, type Messages, type RichEditorExpose } from '@local/rich-editor'

const editorRef = ref<RichEditorExpose>()
const content = ref<EditorContent>({ type: 'doc', content: [] })
</script>

<template>
  <div class="editor-frame">
    <RichEditor
      :key="id ?? 'new'"
      ref="editorRef"
      v-model="content"
      content-format="json"
      layout="document"
      height="100%"
      :theme="theme"
      :upload-image="documentsApi.uploadImage"
      :max-image-size="3 * 1024 * 1024"
      :document-name="title || 'document'"
      :autosave-key="draftKey"
      :messages="messages"
      placeholder="Start writing your document…"
      @ready="onReady"
      @error="onEditorError"
    />
  </div>
</template>
```

| Prop or event | What it does here |
|---|---|
| `v-model` + `content-format="json"` | Content is stored as JSON, which the list page can also export to Word |
| `layout="document"` + `height="100%"` | A4 page view filling `.editor-frame`, which has a fixed height in `app.css` |
| `:key` | Remounts the editor when switching between documents |
| `:theme` | Follows the app's dark mode (step 8) |
| `:upload-image` | Sends images to the mock API (step 7) |
| `:autosave-key` | Keeps a draft per document in `localStorage` |
| `:messages` | Replaces an interface string (`saved` becomes "Draft saved locally") |
| `@ready` / `@error` | Record the saved state / show the app's own error messages |

**Guide:** [§4 Register and render](../../docs/INTEGRATION.md#4-register-and-render-the-editor), [§7.5 Interface language](../../docs/INTEGRATION.md#75-interface-language)

### Step 6: Load and save through an API

**Files:** [`src/api/documents.ts`](src/api/documents.ts) (mock API), [`src/views/DocumentEdit.vue`](src/views/DocumentEdit.vue)

```ts
// Load before rendering the editor
onMounted(async () => {
  if (id.value) {
    const doc = await documentsApi.get(id.value)
    title.value = doc.title
    content.value = doc.content
  }
  loading.value = false            // template: <p v-if="loading">…</p> <div v-else> <RichEditor …/>
})

// The editor normalises content on load, so take the saved state from `ready`
function onReady() {
  savedSnapshot.value = snapshot()
}
const isDirty = computed(() => !loading.value && snapshot() !== savedSnapshot.value)

// Save (button and Ctrl+S)
async function save() {
  const record = await documentsApi.save({ id: id.value ?? undefined, title: title.value.trim() || 'Untitled', content: content.value as JSONContent })
  savedSnapshot.value = snapshot()
  if (!id.value) router.replace(`/documents/${record.id}/edit`)
}

// Warn before leaving with unsaved changes
onBeforeRouteLeave(() => !isDirty.value || window.confirm('You have unsaved changes. Leave anyway?'))
```

To connect a real backend, replace the functions in `src/api/documents.ts` with HTTP calls. The views don't need to change.

**Guide:** [§5 Load and save content](../../docs/INTEGRATION.md#5-load-and-save-content)

### Step 7: Connect image uploads

**File:** [`src/api/documents.ts`](src/api/documents.ts)

```ts
async uploadImage(file: File): Promise<string> {
  await delay(600)
  if (file.name.startsWith('fail-')) throw new Error('Simulated upload failure')
  return /* data URL of the file */
}
```

The editor shows a preview while the promise is pending, uses the returned URL when it resolves, and removes the image and emits `error` when it rejects. The edit page turns that error into a message:

```ts
function onEditorError(error: EditorError) {
  const text: Record<EditorError['type'], string> = {
    'image-upload': 'The image could not be uploaded.',
    // …
  }
  notify('error', text[error.type])
}
```

In a real app, `uploadImage` posts the file to your server and returns the stored image's URL:

```ts
async uploadImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/uploads/images', { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  return (await res.json()).url
}
```

**Guide:** [§6 Image uploads](../../docs/INTEGRATION.md#6-image-uploads)

### Step 8: Match the app's design and dark mode

**File:** [`src/styles/editor-theme.css`](src/styles/editor-theme.css)

```css
.re-root,
.re-portal {                       /* .re-portal = dropdowns and dialogs */
  --re-primary: #0f766e;           /* the app's teal accent */
  --re-primary-hover: #115e59;
  --re-primary-soft: rgba(15, 118, 110, 0.12);
  --re-ui-font: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --re-radius: 6px;
}

.re-theme-dark {
  --re-primary: #2dd4bf;
  --re-on-primary: #04211e;
}
```

**Files:** [`src/composables/useTheme.ts`](src/composables/useTheme.ts), [`src/App.vue`](src/App.vue)

```ts
const theme = ref<'light' | 'dark'>(read())      // shared app theme state
```

```vue
<RichEditor :theme="theme" … />                   <!-- the editor follows it -->
```

**Guide:** [§7 Match your dashboard's design](../../docs/INTEGRATION.md#7-match-your-dashboards-design)

### Step 9: Add your own button with a slot

**File:** [`src/views/DocumentEdit.vue`](src/views/DocumentEdit.vue)

```vue
<RichEditor ref="editorRef" …>
  <template #toolbar-end>
    <div class="editor-extras">
      <button class="btn btn-small" type="button" @click="insertSignature">Insert sign-off</button>
    </div>
  </template>
</RichEditor>
```

```ts
function insertSignature() {
  editorRef.value?.editor
    ?.chain()
    .focus()
    .insertContent([
      { type: 'horizontalRule' },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Reviewed by the Docs Hub team' }] },
    ])
    .run()
}
```

`editorRef.value.editor` is the TipTap editor instance, so any TipTap command works.

**Guide:** [§9 Common scenarios](../../docs/INTEGRATION.md#9-common-scenarios)

### Step 10: Export to Word

**With the editor open.** File: [`src/views/DocumentEdit.vue`](src/views/DocumentEdit.vue)

```ts
function downloadWord() {
  editorRef.value?.download('docx', title.value || 'document')
}
```

**Without the editor, from the list.** File: [`src/views/DocumentList.vue`](src/views/DocumentList.vue)

```ts
async function downloadDocx(doc: DocumentRecord) {
  const { exportDocx } = await import('@local/rich-editor/docx')   // loaded only when clicked
  const blob = await exportDocx(doc.content, { pageSize: 'A4', title: doc.title })
  // …create an object URL and click a download link
}
```

The headless `/docx` entry takes the stored JSON, which is why step 5 uses `content-format="json"`.

**Guide:** [§8 Word export and import](../../docs/INTEGRATION.md#8-word-export-and-import)

### Step 11: Read-only view

**File:** [`src/views/DocumentView.vue`](src/views/DocumentView.vue)

```vue
<RichEditor
  :model-value="doc.content"
  content-format="json"
  :editable="false"
  height="auto"
  :theme="theme"
  :features="{ statusBar: false }"
/>
```

Content renders exactly as it does in the editor, with no toolbar, no status bar, and a height that grows with the document.

**Guide:** [§9 Common scenarios → Showing saved content](../../docs/INTEGRATION.md#showing-saved-content-without-editing)

### Integration summary

| Integration step | File in this app |
|---|---|
| Install from `.tgz` | `package.json` |
| Bundler config | `vite.config.ts` |
| Styles import | `src/main.ts` |
| Lazy-loaded editor pages | `src/router.ts` |
| Editor with `v-model`, props, events | `src/views/DocumentEdit.vue` |
| Load and save, unsaved-changes guard | `src/views/DocumentEdit.vue`, `src/api/documents.ts` |
| Image upload | `src/api/documents.ts` |
| Theme and dark mode | `src/styles/editor-theme.css`, `src/composables/useTheme.ts` |
| Custom slot button | `src/views/DocumentEdit.vue` |
| Word export (component and headless) | `src/views/DocumentEdit.vue`, `src/views/DocumentList.vue` |
| Read-only view | `src/views/DocumentView.vue` |

---

## 5. Project structure

```
sample-app/
├─ package.json              editor dependency (file: tarball) + editor:pack / editor:update scripts
├─ vite.config.ts            port 5174, optimizeDeps for lazily loaded editor libraries
├─ tsconfig.json             moduleResolution "Bundler"
├─ index.html
└─ src/
   ├─ main.ts                styles import, router
   ├─ router.ts              list / new / edit / view routes (editor pages lazy-loaded)
   ├─ App.vue                header with navigation and dark mode toggle
   ├─ api/documents.ts       mock API: list, get, save, remove, uploadImage (localStorage)
   ├─ composables/useTheme.ts  shared light/dark state
   ├─ views/
   │  ├─ DocumentList.vue    table of documents, headless .docx export
   │  ├─ DocumentEdit.vue    the editor: save, unsaved guard, uploads, slot button, .docx
   │  └─ DocumentView.vue    read-only editor
   └─ styles/
      ├─ app.css             app design
      └─ editor-theme.css    editor CSS variable overrides
```

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails with `ENOENT … local-rich-editor-0.1.0.tgz` | The tarball hasn't been created. Run `npm run editor:pack`, then `npm install`. |
| `npm install` fails with `EINTEGRITY` after the editor was rebuilt | The lockfile still has the old tarball's checksum. Run `npm run editor:update`, which reinstalls from the new tarball and updates the lockfile. |
| `Port 5174 is already in use` | Another copy of the app is running. Stop it, or change `server.port` in `vite.config.ts`. |
| Editor changes don't show up | Run `npm run editor:update`, delete `node_modules/.vite`, and restart `npm run dev`. |
| Editor has no styles | Check that `src/main.ts` imports `@local/rich-editor/styles.css`. |
| The first Word export reloads the page in dev | Check the `optimizeDeps.include` list in `vite.config.ts`. |
| Old documents appear after testing | Run `localStorage.clear()` in the browser console and reload. |
