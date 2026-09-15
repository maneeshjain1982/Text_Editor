# Rich Editor

A rich text editor for **Vue 3**, shipped as a local npm package (`@local/rich-editor`) so it can be dropped into an existing dashboard. It is built on [TipTap v3](https://tiptap.dev) (ProseMirror).

| | |
|---|---|
| **Editing** | Headings, fonts, sizes, colors, highlight, bold/italic/underline/strikethrough, sub/superscript, alignment, line spacing, indent, bulleted, numbered and check lists, quotes, code blocks with syntax highlighting, links, special characters, find and replace, undo/redo |
| **Tables** | Insert with a grid picker; add or delete rows and columns; merge and split cells; header row and column; cell color; column resize |
| **Images** | Upload, drag and drop, paste, or insert by URL; resize, align, wrap text, alt text, caption; optional upload to your backend |
| **Files** | Open .docx, .html, .md, .txt and .json · Download **.docx**, .html, .md, .txt and .json · Print or save as PDF |
| **Integration** | `v-model` (HTML or JSON), typed props, events and methods, CSS-variable theming, light/dark/auto theme, page or inline layout, responsive toolbar, translatable UI text |

**Documentation**

- **[Integration guide](docs/INTEGRATION.md)**: step-by-step instructions for adding the editor to an existing front end
- **[API reference](packages/editor/README.md)**: every prop, event, method, slot, CSS variable and toolbar item
- **[Sample app](examples/sample-app/README.md)**: a working Vue app that installs the editor as a package; how to run it and how each integration step is implemented
- **[Plan](PLAN.md)**: design decisions and scope
- **[GEMINI.md](GEMINI.md)**: developer and AI-assistant handoff (architecture, rules, known pitfalls, how to extend)

---

## Requirements

| To… | You need |
|---|---|
| Build this repository | Node **20.19+ or 22.12+**, npm 10+ |
| Use the package in an app | **Vue 3.3+**, and a bundler that supports the `exports` field in `package.json`: Vite (recommended), webpack 5, Rollup or esbuild |

Vue 2 is not supported.

## Quick start

```bash
npm install
npm run dev          # playground (a mock dashboard) at http://localhost:5173
```

To use the editor in another project, see the [integration guide](docs/INTEGRATION.md). The short version:

```bash
npm run build
npm run pack         # → packages/editor/local-rich-editor-<version>.tgz
# in your app:
npm install /path/to/local-rich-editor-<version>.tgz
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RichEditor } from '@local/rich-editor'
import '@local/rich-editor/styles.css'

const html = ref('')
</script>

<template>
  <RichEditor v-model="html" layout="document" style="height: 80vh" />
</template>
```

---

## Repository layout

```
Editor/
├─ packages/editor/            @local/rich-editor: the package you install
│  ├─ src/
│  │  ├─ index.ts              main entry: RichEditor, RichEditorPlugin, types
│  │  ├─ docx.ts               '@local/rich-editor/docx' entry: exportDocx, importDocx
│  │  ├─ RichEditor.vue        root component (props, events, public API)
│  │  ├─ toolbar/              toolbar, its items and presets, "More" overflow menu
│  │  ├─ components/           menus (table, image, link), dialogs, find bar, status bar, UI parts
│  │  ├─ extensions/           TipTap extensions: image, table cell color, indent/line spacing, search, paste cleanup
│  │  ├─ services/             exporters, importers, image handling, docx/
│  │  ├─ styles/               tokens.css (CSS variables), content.css (document), editor.css (interface)
│  │  └─ i18n/messages.ts      all interface text
│  ├─ test/                    Vitest unit tests
│  └─ README.md                API reference
├─ apps/playground/            demo dashboard used for development and end-to-end tests
├─ e2e/                        Playwright end-to-end tests (playground)
├─ examples/
│  ├─ sample-app/              Vue 3 app that installs the editor from its .tgz, like a real consumer
│  └─ sample-app-tests/        separate test project: package checks + browser tests of the sample app's production build
├─ docs/INTEGRATION.md         integration guide
└─ PLAN.md
```

## Scripts

Run these from the repository root.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the playground with hot reload. It reads the package source directly, so no build is needed. |
| `npm run build` | Builds the package to `packages/editor/dist` (ESM and CJS builds, `.d.ts` types, `rich-editor.css`) |
| `npm run pack` | Creates `packages/editor/local-rich-editor-<version>.tgz` from the last build |
| `npm run typecheck` | Runs `vue-tsc` on the package and the playground |
| `npm run test -w @local/rich-editor` | Runs the unit tests (Vitest): Word export XML and round trip, search, schema, exporters, importers |
| `npx playwright test` | Runs the end-to-end tests in the installed Microsoft Edge. Set `PW_CHANNEL=chrome` to use Chrome. |
| `npm run validate --prefix examples/sample-app-tests` | Rebuilds and packs the editor, installs it in the sample app, then runs the package checks and browser tests. See [examples/README.md](examples/README.md). |

## Build output

| File | Purpose |
|---|---|
| `dist/rich-editor.js` / `.cjs` | Main entry (about 28 KB gzipped). Vue, TipTap and other dependencies are left out of the bundle and installed alongside it. |
| `dist/docx.js` / `.cjs` | Headless Word export and import |
| `dist/rich-editor.css` | All styles, imported as `@local/rich-editor/styles.css` |
| `dist/*.d.ts` | TypeScript types |
| `exportDocx-*.js`, `importDocx-*.js`, `lowlight-*.js` | Chunks that load only when first used |

## Releasing a new version

1. Update `version` in `packages/editor/package.json`, following semantic versioning. Changing a prop or event name is a major version.
2. Run `npm run typecheck`, `npm run test -w @local/rich-editor`, `npx playwright test`, and the package validation (`npm run validate` in `examples/sample-app-tests`).
3. Run `npm run build && npm run pack`.
4. Share the `.tgz` file, or commit it to the location your apps install from, and update each app as described in [Updating the package](docs/INTEGRATION.md#11-updating-the-package).

## Known limitations

- **Word layout:** exported .docx files use native Word structures, but Word lays out text differently from a browser, so line breaks can fall in different places. Fonts the reader doesn't have are replaced.
- **Word import:** importing a .docx keeps structure and basic formatting but not font colors or sizes (a limitation of `mammoth`).
- **Remounting:** `features` and `extensions` are read when the editor mounts. Change the component's `key` to apply new values.
- **TypeScript:** types require `moduleResolution` set to `bundler` (the Vite and `@vue/tsconfig` default) or `node`. `node16` and `nodenext` are not supported.
