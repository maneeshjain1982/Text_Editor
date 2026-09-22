# GEMINI.md: project handoff and working rules

Context for Gemini Code Assist, and for any developer, continuing work on this repository. Read it before changing code. It records what exists, how the parts fit together, the rules that keep them consistent, and the mistakes already found and fixed.

> Last updated: 2026-09-22 (AI Canvas + chat with the document)
> Repository: https://github.com/maneeshjain1982/Text_Editor

---

## 1. What this project is

`@local/rich-editor` is a **rich text editor component for Vue 3**. It is distributed as a **local npm package** (a `.tgz` file, not published to npm) and embedded in an existing Vue dashboard.

- Built on **TipTap v3**, which is built on ProseMirror.
- Features: text formatting, headings, lists and checklists, **tables** (merge, split, cell color, column resize), **images** (upload adapter, resize, align, wrap text, caption, alt text), find and replace, links, special characters, paste cleanup, light/dark/auto theme, `document` (A4 or Letter page) and `inline` layouts, translatable UI text.
- **AI Canvas** (like Gemini Canvas): generate, rewrite a selection, continue, or edit the whole document with **only changed blocks** regenerated. Changes are reviewable suggestions, and there is version history. **Chat with the document**: a side panel with cited answers (source links), follow-ups, selection context, and edits as suggestions. The editor calls a host-provided adapter; the reference backend (`examples/ai-server`) calls **Gemini**.
- **Word fidelity is a core requirement.** It exports native `.docx` (headings, real numbered lists, tables with merges and shading, embedded images, fonts and colors) and imports `.docx`. Also HTML, Markdown, TXT and JSON export and import, and print.

User decisions already made; don't revisit them without asking:

| Topic | Decision |
|---|---|
| Consumer | An existing **Vue 3** dashboard (not React, not Vue 2) |
| Distribution | Local package: `npm run pack` → `.tgz` → `npm install <path>.tgz` |
| Design system | None in the host. The editor ships a neutral theme that hosts restyle with `--re-*` CSS variables. |
| Word | `.docx` export **and** import; default page size **A4** |
| AI | **Gemini** (default `gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`), via a backend. The API key never reaches the browser. AI changes are always suggestions to review, never applied directly. |
| Language | English UI; every string can be overridden through the `messages` prop |

---

## 2. Repository map

```
Editor/                                  npm workspaces root: packages/*, apps/*
├─ GEMINI.md                             ← this file
├─ README.md                             project overview, scripts, release steps
├─ PLAN.md                               original plan, decisions, phase status
├─ docs/
│  ├─ INTEGRATION.md                     integration guide for host apps (keep in sync with the API)
│  ├─ integration-steps.html             the same steps as a standalone HTML page
│  └─ USER-GUIDE.md                      end-user guide (keep in sync when UI labels, shortcuts or features change)
├─ packages/editor/                      ★ THE PACKAGE (@local/rich-editor)
│  ├─ package.json                       exports: ".", "./docx", "./ai", "./styles.css"; peerDep vue
│  ├─ vite.config.ts                     library build: 3 entries (index, docx, ai), dependencies externalised, vite-plugin-dts
│  ├─ vitest.config.ts                   happy-dom, css: true (needed for ?raw CSS imports)
│  ├─ README.md                          API reference (props, events, methods, CSS variables)
│  ├─ test/                              Vitest unit tests (fixtures.ts, docx.spec.ts, editor.spec.ts, ai.spec.ts)
│  └─ src/                               (map in §3)
├─ apps/playground/                      dev app; Vite ALIASES the package to its source (instant reload)
├─ e2e/editor.e2e.ts                     Playwright tests against the playground (root playwright.config.ts)
└─ examples/                             NOT in the workspace, on purpose (they consume the real .tgz)
   ├─ README.md
   ├─ ai-server/                         Gemini backend: gemini.config.ts (THE config), server.ts, gemini.ts, mock mode
   ├─ sample-app/                        "Docs Hub" Vue 3 + Vue Router app; installs the editor from the .tgz
   │  └─ README.md                       how to run it + a 12-step integration walkthrough (step 12: AI)
   └─ sample-app-tests/                  separate Playwright project: package checks + browser tests of the app's production build
```

### Source map: `packages/editor/src`

| Path | Responsibility |
|---|---|
| `index.ts` | Main entry. Exports `RichEditor`, `RichEditorPlugin`, `defaultMessages`, `toHtmlDocument`, `toMarkdown`, `buildExtensions`, `TOOLBAR_PRESETS`, all types, and `JSONContent`. **Also imports `styles/index.css`**, which Vite extracts to `dist/rich-editor.css`. |
| `ai.ts` | Third entry (`@local/rich-editor/ai`): `buildPrompt`, `createHttpAiAdapter`, `createDemoAiAdapter`, `DEFAULT_AI_ACTIONS`, parsers, types. **Must stay free of Vue, TipTap and DOM imports** (used by the Node server; a package test enforces it). |
| `ai/types.ts` | `AiRequest`, `AiAdapter`, `AiQuickAction`, `AiBlockPatch` (pure types) |
| `ai/prompts.ts` | `buildPrompt(request, extraSystem)`: system and user prompts per task, `AI_LIMITS` (context clipping) |
| `ai/controller.ts` | `createAiController`: the AI bar state, target capture, request building, adapter call with streaming and abort, mapping positions through edits made while waiting, text or patch → suggestions, keeping layout attributes |
| `ai/convert.ts` | Range/node → Markdown (turndown); Markdown → fragment (marked → DOM → schema parse; GFM task lists fixed up) |
| `ai/parse.ts`, `ai/demo.ts`, `ai/http.ts`, `ai/actions.ts` | Fence stripping and block-patch parsing; offline demo adapter; NDJSON HTTP adapter; default quick actions (labels via `t()`) |
| `extensions/AiSuggestion.ts` | Suggestions live in **plugin state, not the document**: inline/node decorations for removed text, a widget with the replacement and Accept/Reject buttons, position mapping, dropping a suggestion when its text changes, accept = one `replaceWith`/`replaceRange` transaction (`onBeforeApply` snapshots a version), Esc rejects all, `setAiTarget` highlight |
| `ai/chat.ts` | `createChatController`: messages, sending the whole document (or the part around the cursor if it's over `AI_LIMITS.chatDocumentChars`) plus history, citation positions mapped through edits (stale when deleted), edits block → suggestions via `patchToSuggestions`, insert/replace answers via `suggestMarkdown`, per-message pending suggestions |
| `ai/chat-parse.ts` | `parseChatAnswer` (answer / `[bN]` citations / fenced `edits` block; also for partial streaming text), `stripCitations` |
| `components/ai/ChatPanel.vue`, `ChatMarkdown.vue` | Chat panel (docked right; overlay under 900px). `ChatMarkdown` renders answers **through the editor schema** (never raw HTML) and turns `[bN]` into numbered source buttons |
| `components/ai/AiBar.vue`, `AiSelectionMenu.vue`, `dialogs/VersionsDialog.vue` | AI bar docked under the toolbar (input, chips, streaming preview, accept/reject/retry); Ask AI bubble on text selections; version list with Restore |
| `docx.ts` | Second entry (`@local/rich-editor/docx`): `exportDocx`, `importDocx`. Kept separate so the base bundle stays small. |
| `RichEditor.vue` | Root component: props and defaults, `useEditor`, v-model sync, autosave, export/import/print actions, keyboard shortcuts (Ctrl+F, Ctrl+K, Esc), theme classes, toasts, **`provide(EDITOR_CONTEXT)`**, public API via `defineExpose`. |
| `types.ts` | Public types: `RichEditorProps`, `RichEditorExpose`, `ToolbarItem`, `ToolbarConfig`, `EditorFeatures`, `EditorError`, … |
| `defaults.ts` | `DEFAULT_FONTS`, `DEFAULT_FEATURES` (a separate module; see pitfall P3) |
| `context.ts` | `EditorContext` interface + `useEditorContext()` (inject). Every child component reads the editor, `t`, features and actions from here. |
| `i18n/messages.ts` | `defaultMessages` (every UI string) + `createTranslator` (`{param}` substitution) |
| `extensions/index.ts` | `buildExtensions()`: StarterKit, text style, highlight, align, sub/superscript, task list, tables, code highlighting, and the custom extensions below |
| `extensions/BlockAttributes.ts` | Paragraph/heading `indent` (40px steps, max 8) and `lineHeight` attributes; `indent`/`outdent` commands (nest list items instead when inside a list); `setBlockLineHeight` |
| `extensions/SearchReplace.ts` | ProseMirror plugin with decorations; `findMatches()`; commands `setSearchTerm`, `nextMatch`, `replaceAll`, …; state in `editor.storage.searchReplace` |
| `extensions/Image.ts` | Custom block `image` node (attributes `src`, `alt`, `title`, `caption`, `width`, `align`, `uploadId`), Vue node view, paste/drop plugin, `insertImageFiles` (preview → upload → replace `src`, or remove on failure) |
| `extensions/Table.ts` | `TableCell`/`TableHeader` extended with a `backgroundColor` attribute |
| `extensions/PasteCleanup.ts` | `cleanPastedHTML()` strips Office and Google Docs markup |
| `extensions/lowlight.ts` | Shared highlighter (16 languages), `CODE_LANGUAGES`, **`TOKEN_COLORS`** (used by the DOCX exporter) |
| `components/ImageView.vue` | Image node view: resize handles, caption input, upload state |
| `components/FindReplace.vue`, `StatusBar.vue` | Find bar; word and character count |
| `components/menus/{Table,Image,Link}Menu.vue` | TipTap `BubbleMenu`s. `options.ts` builds their floating-ui options (see P6). |
| `components/dialogs/{Link,Image,SpecialChars}Dialog.vue` | Modal dialogs |
| `components/ui/*` | `Popover` (teleported, floating-ui, nested-popover aware), `Modal` (focus trap), `ToolButton`, `MenuList` (+ `menu.ts` type), `ColorPalette`, `TableGridPicker` |
| `toolbar/items.ts` | `BUTTON_ITEMS` (simple buttons), `TOOLBAR_PRESETS` (`full`, `basic`), `resolveToolbar()` (drops items for disabled features) |
| `toolbar/ToolbarControl.vue` | Renders one toolbar item (buttons + custom dropdowns: heading, font, size, colors, align, line height, table, file menu) |
| `toolbar/Toolbar.vue` | Groups, ResizeObserver-based **"More" overflow menu**, arrow-key roving focus |
| `services/content.ts` | `normalizeContent()`: turns `{type:'doc',content:[]}` into a doc with one paragraph (see P1). `ensureTrailingParagraph()` (see P19). |
| `services/exporters.ts` | `toHtmlDocument` (inlines `tokens.css` + `content.css` with `.re-content` → `.re-export`), `toMarkdown` (turndown + GFM + custom rules), `downloadBlob`, `printHtml` (hidden iframe) |
| `services/importers.ts` | `importFile()` by extension (docx → mammoth, md → marked, html, txt, json) |
| `services/image.ts` | Validation, `readImageSize` (PNG/JPEG/GIF/BMP headers, no DOM), `fetchImageBytes`, `rasterizeToPng` (browser only) |
| `services/docx/exportDocx.ts` | **ProseMirror JSON → `docx` library objects.** Styles, numbering, blocks, lists, code, images, tables, inline marks. |
| `services/docx/importDocx.ts` | mammoth with a style map; passes both `arrayBuffer` and Node `buffer` |
| `services/docx/units.ts` | Page sizes, twips/px, `toHexColor`, `toHalfPoints`, `firstFontFamily` |
| `styles/tokens.css` | All `--re-*` variables on `.re-root, .re-portal, .re-export`; `.re-theme-dark` overrides |
| `styles/content.css` | Document typography (`.re-content …`). **Mirrors the DOCX exporter; see R1.** |
| `styles/editor.css` | Editor interface (toolbar, menus, dialogs, image handles, dark syntax colors, dark tint readability) |

---

## 3. Architecture in one paragraph

`RichEditor.vue` creates the TipTap editor with `buildExtensions()` and `provide`s an `EditorContext` (the editor ref, translator, features, actions). The toolbar, menus, dialogs and node views `inject` it; TipTap's Vue node views receive provides through `EditorContent`. Content flows through `v-model` as HTML (default) or JSON (`content-format="json"`); `normalizeContent()` runs on every way in. Popovers, dialogs and bubble menus are positioned with floating-ui. Popovers and modals are **teleported to `<body>`** and carry the `.re-portal` class plus the current theme class, so they get the design tokens. Bubble menus are appended inside `.re-root` with `position: fixed`. Heavy features load on demand: `exportDocx`, `importDocx`, `mammoth` and `marked` are dynamic imports, and `lowlight` is its own chunk.

---

## 4. Rules that must stay true

- **R1 · Editor and Word export must match.** Sizes and spacing in `styles/content.css` correspond to constants in `services/docx/exportDocx.ts`. If you change one, change the other:

  | Property | Editor (CSS) | DOCX exporter |
  |---|---|---|
  | Base font | `--re-font` Calibri, `--re-font-size` 11pt | `font`, `fontSizePt`, read from the CSS variables at export time |
  | Line height | 1.5 | `LINE = 360` |
  | Paragraph spacing | `margin-bottom: 0.6em` | `PARA_AFTER = 132` |
  | Headings | 2 / 1.6 / 1.3 / 1.1 / 1 / 0.9 em, bold | `HEADING_EM` |
  | List indent | 24px per level | `LIST_INDENT = 360` |
  | Indent step | 40px (`INDENT_STEP_PX`) | ×15 twips per px |
  | Code blocks | line-height 1.35, 0.9em, `#f3f4f6` | `line: 324`, size 20, `CODE_BG` |
  | Table cells | padding 6px 8px, 1px `#d8dde3` border | margins 90/120, border size 6, `BORDER` |
  | Syntax colors | `.hljs-*` rules | `TOKEN_COLORS` in `lowlight.ts` |
  | Page | 210mm / 8.5in wide, 25.4mm padding | `PAGE_SIZES`, `PAGE_MARGIN_TWIPS = 1440` |

- **R2 · Every class name starts with `re-`.** No global CSS and no resets outside `.re-root` / `.re-portal`. Anything teleported must carry `.re-portal` plus `ctx.portalClass`.
- **R3 · Vue stays a peer dependency.** Every entry in `dependencies` is externalised in `vite.config.ts` (`isExternal`). Never bundle Vue or TipTap into `dist`.
- **R4 · Keep the base bundle small.** Don't statically import `docx`, `mammoth`, `marked` or `services/docx/*` from `index.ts` or anything it loads eagerly. Use `await import()`.
- **R5 · The public API is a contract.** Props, events, `RichEditorExpose` methods, slots, CSS variables, toolbar item names and the `exports` map are documented in `packages/editor/README.md`, `docs/INTEGRATION.md`, `docs/integration-steps.html` and `examples/sample-app/README.md`. Changing any of them means updating those documents and bumping the version (a rename is a **major** version).
- **R6 · Toolbar buttons must not steal focus.** Buttons use `@mousedown.prevent`, and commands run `editor.chain().focus()…`.
- **R7 · Accessibility.** The toolbar uses `role="toolbar"` with arrow-key navigation, icon buttons have `aria-label`s, menus use `role="menu"`/`menuitem`, and dialogs trap focus and restore it when closed.
- **R8 · Visible text goes through `t()`.** Add new strings to `defaultMessages` in `i18n/messages.ts`.
- **R9 · AI never edits the document directly.** Model output becomes suggestions in plugin state. `v-model`, autosave and exports must only ever contain accepted content, and accepting is one undo step.
- **R10 · The API key stays on the server.** The package only calls the host's adapter. Don't add provider SDKs to the package.
- **R12 · Model output is never inserted as raw HTML.** Chat answers are rendered via `markdownToFragment` → `DOMSerializer`, the same schema filter as suggestions.
- **R11 · Prompts are built on the server in production** (`trustClientPrompt: false`). If you change `ai/prompts.ts`, rebuild and repack, and run `npm run editor:update` in `examples/ai-server`, so the server uses the same prompts.

---

## 5. Pitfalls already found (don't reintroduce these)

| # | Pitfall | What to do |
|---|---|---|
| P1 | `{ type: 'doc', content: [] }` as **initial** content is an invalid document with no text position: the selection becomes `AllSelection`, so toggling Bold before typing does nothing. | All content goes through `normalizeContent()` (initial content, the v-model watcher, `setContent`, `importFile`). Unit test: "empty JSON documents". |
| P2 | **TypeScript 7** removed the compiler API that `vue-tsc` and `vite-plugin-dts` use. | Keep `typescript` pinned to `~5.9.3` in the root, the package, the playground and the examples. |
| P3 | `withDefaults(defineProps…)` can't reference constants declared in `<script setup>` (they are hoisted). `<script setup>` also can't `export`. | Put defaults in `defaults.ts` and shared types in `.ts` files (see `components/ui/menu.ts`). |
| P4 | The Vite dev server **caches types imported for props**. After editing `types.ts`, new props arrive as `undefined` (seen as "Cannot read properties of undefined (reading 'map')" in `resolveToolbar`). | Restart the dev server after changing `types.ts`. |
| P5 | Inside a custom command, calling `editor.commands.x()` starts a second transaction → "Applying a mismatched transaction". | Use the `commands` / `chain` passed to the command (see `BlockAttributes.ts`). |
| P6 | TipTap `BubbleMenu` measures itself before it applies `width: max-content`, so the first position is wrong. Passing a new `options` object on every render also makes it re-apply options constantly. | `components/menus/options.ts` sends an `updatePosition` meta on the next frame from `onShow`. Menus create options once with `computed(() => bubbleOptions(...))`. Reference rects are resolved lazily inside `getBoundingClientRect`. |
| P7 | Image attributes were auto-rendered onto `<figure>`, duplicating large data URLs. | Image attributes are `rendered: false`; `renderHTML` places each one explicitly. |
| P8 | Nested popovers (a color picker inside the "More" menu) are teleported separately, so clicking them closed the parent. | `Popover.vue` registers children through provide/inject (`POPOVER_CHILDREN`). |
| P9 | TipTap's `<mark>` has an inline `color: inherit`, which made light highlights unreadable in dark mode. | `editor.css` forces dark text on `mark` and `[data-background]` in `.re-theme-dark` with `!important`. |
| P10 | `turndown-plugin-gfm` leaves a table as raw HTML when a `<colgroup>` comes before the header row, and cell `<p>`s break Markdown rows. | `toMarkdown` strips `<colgroup>` and has `cellParagraph` / `listParagraph` rules. |
| P11 | mammoth's browser build reads `arrayBuffer`; its Node build reads `buffer`. | `importDocx` passes both. |
| P12 | Vitest blanks CSS by default, so `?raw` CSS imports came back empty. | `vitest.config.ts` sets `css: true`. |
| P13 | Vite dev reloads the page the first time a lazily imported dependency is loaded (the first Word export). | Hosts add `optimizeDeps.include: ['@local/rich-editor/docx', 'docx', 'mammoth', 'marked', 'turndown', 'turndown-plugin-gfm']`. This affects development only. |
| P14 | Inserting a table replaced selected text. | `ToolbarControl.insertTable` collapses a non-empty selection to its end first. |
| P15 | **Playwright:** pressing keys with zero delay can beat ProseMirror's asynchronous selection sync (End then Enter replaced the selection). This is an automation artifact, not a user bug. | In tests, type in natural order (toggle bold on, type, toggle off) or assert the state between key presses. |
| P16 | **Playwright:** clicking the middle of the editor can land in a table cell, where Ctrl+A only selects that cell. | Tests clear the document by clicking the `h1` first (`clearEditor`). |
| P17 | **Windows tooling:** PowerShell `Set-Content` / `ConvertTo-Json` write a BOM, which breaks `package.json`. `npm run dev -- --port X` through the workspace root passes the flag incorrectly. | Write JSON with an editor, not PowerShell. Set ports in `vite.config.ts` (the sample app uses 5174). |
| P19 | StarterKit's **TrailingNode** adds an empty paragraph after a document ending in a table, list or image, but lazily on the first transaction, so a loaded document looked "changed" on first click (false "Unsaved changes"). | `ensureTrailingParagraph()` runs on create and after every programmatic `setContent` (outside undo history). Unit test: "trailing paragraph". |
| P20 | TipTap BubbleMenu only re-checks `shouldShow` when the selection or document changes, so metadata-only transactions (opening the AI bar, adding suggestions) left the Ask AI menu visible. | `AiSelectionMenu` dispatches the plugin's `'hide'` meta and renders nothing while busy. |
| P21 | A `computed` on `editor.state` isn't reactive for a plain `Editor` (unit tests). | The AI controller keeps `pendingCount` in a `ref` updated from the editor's `transaction` events. |
| P22 | The AI may return text identical to the selection. | Treated as "no changes" (message), not an identical suggestion. Separate message when the target changed while waiting (`aiDiscarded`). |
| P23 | Adding the AI toolbar button pushed the Insert group into "More" at 1440px. | `file` and `ai` share a group; heading and font selects are 106px wide. Check the toolbar at 1440px when adding buttons. |
| P24 | The Gemini 3 docs recommend keeping **temperature at the default 1.0** (lower values can loop). `gemini-3.8-flash` supports thinking `low`/`medium`/`high`, not `minimal`. | The config leaves temperature unset and uses `thinkingLevel`. Check https://ai.google.dev/gemini-api/docs/models before changing models. |
| P25 | Toolbar width again: adding the Chat button pushed Insert into "More". | Toolbar group gap is 1px, and the heading and font selects are 100px wide. Re-measure at 1440px when adding buttons. |
| P26 | Tests that type a follow-up while an answer is still streaming: the chat ignores sending while busy (by design). | Wait for the answer's **Copy** button (status done) before the next question. |
| P27 | The PowerShell tool blocks a whole command that contains `Remove-Item` together with a `//` string (e.g. JS comments in a here-string). | Keep deletions in a separate command, and write files with the file tools. |
| P18 | The sample app's lockfile pins the tarball's checksum, so a plain `npm install` after repacking can fail with `EINTEGRITY`. | Use `npm run editor:update` in `examples/sample-app`. |

---

## 6. Commands

Run from the repository root unless a directory is shown. Node 20.19+ or 22.12+ (developed on Node 24).

| Task | Command |
|---|---|
| Install | `npm install` |
| Playground (dev, source alias) | `npm run dev` → http://localhost:5173 |
| Build the package | `npm run build` → `packages/editor/dist` |
| Pack the tarball | `npm run pack` → `packages/editor/local-rich-editor-<version>.tgz` |
| Type-check package + playground | `npm run typecheck` |
| Unit tests (66) | `npm run test -w @local/rich-editor` |
| Playground E2E (22 in `e2e/editor.e2e.ts` + `e2e/chat.e2e.ts`; AI tests use the demo adapter) | `npx playwright test` (Edge; `PW_CHANNEL=chrome` for Chrome) |
| Sample app | `cd examples/sample-app && npm run dev` → http://localhost:5174 |
| Update the sample app's copy of the editor | `cd examples/sample-app && npm run editor:update` |
| Full package validation (9 checks + 11 browser tests, AI server in mock mode) | `cd examples/sample-app-tests && npm run validate` |
| Gemini server | `cd examples/ai-server && npm start` (needs `.env` with `GEMINI_API_KEY`) · `npm run mock` (no key) |

**Definition of done for any editor change:** `npm run typecheck`, the unit tests, `npx playwright test`, **and** `npm run validate` in `examples/sample-app-tests` all pass. Stop any dev or preview server on port 4173 before `validate`, because Playwright reuses an existing server.

At the last update, every suite passes: 66 unit, 22 playground E2E, 20 sample-app validation. Stop any servers on ports 8787 and 4173 before `validate`: Playwright reuses running servers, which may be serving an old build.

---

## 7. Stack and versions

| Area | Library (version range in `package.json`) |
|---|---|
| Framework | vue ^3.5.42 (peer dependency, ^3.3.0) |
| Editor engine | @tiptap/* ^3.31.3 (core, vue-3, starter-kit, extensions, extension-table, -text-style, -highlight, -text-align, -subscript, -superscript, -list, -code-block-lowlight) |
| Build | vite ^8.3.0 (Rolldown: use `build.rolldownOptions`, not `rollupOptions`), @vitejs/plugin-vue ^6, vite-plugin-dts ^5 |
| Types | typescript ~5.9.3, vue-tsc ^3.3.11 |
| Word | docx ^9.7.1 (export), mammoth ^1.12.3 (import) |
| Markdown | turndown ^7 + turndown-plugin-gfm (export), marked ^18 (import) |
| Code highlighting | lowlight ^3.3.0 + highlight.js ^11 |
| UI | @floating-ui/dom ^1.8, lucide-vue-next ^1.0 (icon names differ from older Lucide: e.g. `TextAlignStart`, `ListIndentIncrease`, `Ellipsis`) |
| Tests | vitest ^5 + happy-dom, @playwright/test ^1.63 (uses the installed Edge; no browser download), jszip (reads .docx in tests) |
| Sample app | vue-router ^5.3.1 |
| AI server | @google/genai 2.24.0 (`models.generateContentStream`), Node 22.18+ running TypeScript directly (no enums or parameter properties: `erasableSyntaxOnly`) |

---

## 8. How to extend

### Add a toolbar button

1. Add the name to the `ToolbarItem` union in `types.ts`.
2. For a simple button, add an entry to `BUTTON_ITEMS` in `toolbar/items.ts` (icon, `label` message key, `shortcut`, `run`, `isActive`, `isDisabled`). For a dropdown, add a branch in `ToolbarControl.vue`.
3. Add the label to `i18n/messages.ts`.
4. Add it to `TOOLBAR_PRESETS.full` (and `basic` if it's common). If it depends on a feature flag, map it in `FEATURE_ITEMS`.
5. List the new item in the toolbar section of `packages/editor/README.md` and in `docs/INTEGRATION.md`.
6. **Restart the dev server** (P4) and add a Playwright check.

### Add content formatting (new node, mark or attribute)

1. Create or extend an extension in `extensions/` and register it in `extensions/index.ts`.
2. Add editor CSS in `styles/content.css`.
3. **Map it in `services/docx/exportDocx.ts`** (`convertBlock` for nodes, `runOptions` for marks) so Word export stays faithful (R1).
4. Check Markdown (`toMarkdown` rules) and HTML export (`toHtmlDocument` inlines `content.css`).
5. Add assertions to `test/fixtures.ts` + `test/docx.spec.ts` that inspect `word/document.xml`.

### Add a prop

1. Add it to `RichEditorProps` in `types.ts` (with a JSDoc comment) and a default in `withDefaults` (constants go in `defaults.ts`).
2. If children need it, expose it through `EditorContext` in `context.ts` and `provide` in `RichEditor.vue`.
3. Document it in the props table in `packages/editor/README.md`; add a usage example to `docs/INTEGRATION.md` if it matters for integration.
4. Restart the dev server (P4).

### Change AI behavior

- **Prompts:** `ai/prompts.ts` (applies to the editor and the server). Update the unit tests in `test/ai.spec.ts`, then repack and run `editor:update` in `examples/ai-server`.
- **Model and generation settings:** `examples/ai-server/gemini.config.ts` only.
- **New quick action:** add it to `ai/actions.ts`, with its label key in `i18n/messages.ts`.
- **Chat behavior:** the prompt is the `chat` case in `ai/prompts.ts`; limits (document size, turns) are in `AI_LIMITS`; server settings are `tasks.chat` and `limits.maxChatTurns` in `gemini.config.ts`.
- **New AI task:** add it to the `AiTask` type, `buildPrompt`, `responseFormatFor`, the controller's `captureRange`/`run`, the server's `TASKS` set and `tasks` config, and the demo adapter.

### Release a version

1. Bump `version` in `packages/editor/package.json`.
2. Update the tarball file name in `examples/sample-app/package.json` (the dependency **and** the `editor:update` script) and in the docs examples.
3. Run everything in the definition of done (§6).
4. Run `npm run pack` and distribute the `.tgz`.

---

## 9. Known limitations and open items

**Not yet verified**

- The AI Canvas has been tested end to end with the **mock** server and demo adapter only. A **live Gemini call** needs a real `GEMINI_API_KEY` (not available during development), so check one of each task against real Gemini before release.
- An exported `.docx` has **not been opened in Microsoft Word** by a person; only the XML is tested. Word automation hung on the development machine.
- Host bundlers other than Vite (webpack 5 / Vue CLI 5) and **Nuxt** are untested; they are expected to work from the package format.

**Known limitations** (documented in the READMEs)

- Word lays out text slightly differently from a browser, so line breaks can differ. Fonts the reader doesn't have are replaced.
- `.docx` import (mammoth) loses font colors and sizes and simplifies text boxes, headers and footers.
- In Node, headless `exportDocx` replaces SVG/WebP images with their alt text, because converting them needs a canvas.
- `features` and `extensions` are read once, when the editor mounts; hosts change `:key` to remount.
- TypeScript consumers need `moduleResolution` `bundler` or `node`; `node16`/`nodenext` fail because the generated `.d.ts` files use extensionless relative imports.

**Possible next work** (not requested yet; confirm with the user first)

- CI workflow (GitHub Actions) running §6 on every push
- CHANGELOG and versioning conventions
- Headers, footers and page numbers in DOCX export; page breaks in the editor
- AI: persist versions by default (host callback exists: `version-created`), keep inline colors in AI rewrites, retrieval (embeddings) for documents larger than the chat limit, a chat component the host can place outside the editor
- Code block language picker in the UI (languages are registered but there is no picker)
- Translated message bundles (e.g. Korean)
- Markdown import of task lists and `==highlight==`
- Support for `node16`/`nodenext` resolution (add `.js` extensions to emitted declarations)

---

## 10. Working conventions

- Match the surrounding code: Vue `<script setup lang="ts">`, Composition API, 2-space indent, single quotes, no semicolons, comments only where they explain *why*.
- No new runtime dependencies without a clear need; anything added must be externalised (R3) and, if heavy, lazy-loaded (R4).
- Use `git` normally: commit to a branch or to `main` as the user directs. Don't commit `node_modules`, `dist`, `*.tgz` or `test-results` (already in `.gitignore`).
- Line endings are LF (`.gitattributes`).
