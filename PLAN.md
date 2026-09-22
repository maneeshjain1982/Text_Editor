# Rich Text Editor – Implementation Plan

A rich text editor for Vue 3, shipped as a **local package** and embedded in an existing Vue dashboard.

## Decisions

| Topic | Decision |
|---|---|
| Consumer | Existing **Vue 3** dashboard |
| Stack | Vue 3 + TypeScript + Vite (library mode) + **TipTap v3** (ProseMirror) |
| Design system | Package ships its own neutral design; fully themeable via CSS variables (`--re-*`) |
| Distribution | **Local package** (npm workspace / `file:` dependency / `npm pack` `.tgz`) |
| Word | Export **.docx** (`docx`), import **.docx** (`mammoth`) |
| Page size | **A4** default, configurable (Letter) |
| Backend | None required; image upload via optional `uploadImage` adapter prop |

## Repository layout

```
Editor/
  packages/
    editor/                  # @local/rich-editor  (the package)
      src/
        index.ts             # public API
        RichEditor.vue       # main component
        components/          # Toolbar, pickers, bubble menus, dialogs, StatusBar
        extensions/          # FontSize, LineHeight, Indent, ResizableImage, SearchReplace
        composables/         # useAutosave, useTheme, useShortcuts
        services/            # exporters (html, md, txt), docx export/import, image validation
        styles/              # tokens (CSS vars), editor chrome, content, print
        types.ts
  apps/
    playground/              # demo dashboard page for development & manual testing
```

## Features

- **Text:** bold, italic, underline, strike, inline code, sup/sub, font family, size, color, highlight, clear formatting
- **Blocks:** paragraph, H1–H6, alignment, line height, bullet/numbered/task lists, indent/outdent, blockquote, code block, horizontal rule
- **Editing:** undo/redo, clean paste (Word/Docs), paste as plain text, find & replace, links, shortcuts, word/char count, special characters
- **Tables:** grid picker insert, add/remove rows & columns, merge/split, header row/column, column resize, cell background, delete; table bubble menu
- **Images:** upload, drag & drop, paste, URL; resize handles; align; alt text & caption; size/type validation; image bubble menu
- **Documents:** v-model (HTML or JSON), autosave (opt-in), export HTML/JSON/Markdown/TXT/**DOCX**, import **DOCX**/HTML, print/PDF, fullscreen, light/dark

## Public API (target)

```vue
<script setup lang="ts">
import { RichEditor } from '@local/rich-editor'
import '@local/rich-editor/styles.css'
</script>

<RichEditor
  v-model="content"
  toolbar="full"            <!-- 'full' | 'basic' | ToolbarGroup[] -->
  layout="document"         <!-- 'document' (A4 page) | 'inline' -->
  page-size="A4"
  theme="light"             <!-- 'light' | 'dark' | 'auto' -->
  :upload-image="uploadFn"
  :features="{ tables: true, images: true, docx: true }"
  @ready="..." @focus="..." @blur="..."
  ref="editorRef"           <!-- getHTML(), getJSON(), setContent(), exportDocx(), importDocx(), focus() -->
/>
```

Also available: `app.use(RichEditorPlugin)` for global registration.

## Integration requirements

- `vue` is a peer dependency (no duplicate Vue); TipTap/docx are externalised dependencies
- All classes prefixed `re-`; no global CSS resets; theme through CSS variables
- Controlled (`v-model`) and uncontrolled (`default-value` + ref) usage
- Full TypeScript types; ESM + CJS builds; `styles.css` export
- SSR-safe (Nuxt): editor instantiates on the client only
- Accessible toolbar (ARIA, keyboard navigation), i18n via `messages` prop
- Extensible: custom toolbar groups/buttons, extra TipTap extensions via prop
- DOCX export loaded lazily (dynamic import) to keep the base bundle small

## DOCX fidelity

The exporter walks the ProseMirror JSON and maps each node/mark to native Word
constructs: text runs (fonts, size, colour, shading highlight), Heading 1–6 styles,
real numbering definitions for lists, native tables (widths, merges, header rows,
shading), embedded images (exact size, alignment, caption), hyperlinks, A4/Letter
page with matching margins. The editor's "document" layout uses the same page
width, fonts and spacing so output matches what is shown. Known limits: line
breaks may reflow slightly due to Word's layout engine; fonts not installed on
the reader's machine are substituted (font picker restricted to common fonts).
Import (mammoth) simplifies complex layouts (text boxes, headers/footers).

## Phases

1. **Scaffold** – workspace, package library build, playground, typecheck, `.tgz` consumer install test ✅
2. **Design** – built directly in the playground (user asked to proceed without a separate mockup) ✅
3. Core formatting + toolbar + theming ✅
4. Tables ✅
5. Images (+ upload adapter) ✅
6. Editing tools (find & replace, paste cleanup, counts, special chars) ✅
7. Export/import: HTML, MD, TXT, JSON, print, DOCX export, DOCX import ✅
8. Public API, plugin install, i18n, extensibility ✅
9. Accessibility, responsive toolbar overflow, lazy-loaded heavy deps ✅
10. Tests: 30 Vitest unit (incl. DOCX XML assertions + round trip), 13 Playwright e2e in Edge; README ✅

Open items: visual check of exported .docx in Word (automated XML checks only so far).
Usage and API: see packages/editor/README.md.

## Integrating into the dashboard (local package)

```bash
# Option A – tarball
npm run pack            # creates packages/editor/local-rich-editor-x.y.z.tgz
cd <dashboard> && npm i <path>/local-rich-editor-x.y.z.tgz

# Option B – linked path
npm i file:<path>/Editor/packages/editor
```

---

## AI Canvas (added 2026-09-22)

Like Gemini Canvas: generate once, then change only what you point at. Decisions: **Gemini** as the model (through a backend; key never in the browser), AI changes always **reviewed as suggestions**, phases 1–5 in scope.

| Phase | Status |
|---|---|
| 1. Adapter API (`ai` prop, `AiAdapter`), lazy parsers, demo adapter | ✅ |
| 2. Edit selection: Ask AI, quick actions, streaming, inline suggestions with accept/reject/retry/refine, Stop | ✅ |
| 3. Generate (empty document or after the current block) and continue writing | ✅ |
| 4. Whole-document edits with block patches (only changed blocks), accept/reject all | ✅ |
| 5. Version history (snapshot before each accepted change, restore) | ✅ |
| 6. Chat with the document: side panel, cited answers with source links, follow-ups, selection context, edits as suggestions, insert/replace answers, history via v-model, long-document handling | ✅ (2026-09-22) |
| Gemini server (`examples/ai-server`, one config file `gemini.config.ts`, mock mode) | ✅ |
| Docs, sample app integration, tests (unit, playground E2E, package validation) | ✅ |

Open: test against live Gemini with a real API key (development used mock mode and the demo adapter).