# Rich Editor

A rich text editor for **Vue 3**, shipped as a local npm package (`@local/rich-editor`) for embedding in an existing dashboard. It has tables, images, faithful **Word (.docx)** export and import, and an optional **AI Canvas** with document chat, powered by **Google Gemini**. It's built on [TipTap v3](https://tiptap.dev) (ProseMirror).

```vue
<RichEditor v-model="html" layout="document" :ai="aiAdapter" />
```

## Features

| Area | What's included |
|---|---|
| **Writing** | Headings, fonts, sizes, colors, highlight, bold, italic, underline, strikethrough, sub/superscript, alignment, line spacing, indent, bulleted, numbered and check lists, quotes, code blocks with syntax colors, links, special characters and emoji, find and replace, undo/redo, clean paste from Word and Google Docs |
| **Tables** | Insert with a grid picker; add or delete rows and columns; merge and split cells; header row and column; cell color; column resize |
| **Images** | Upload, drag and drop, paste or URL; resize, align, wrap text, caption, alt text; optional upload to your backend |
| **Files** | Open .docx, .html, .md, .txt, .json · Download **.docx**, .html, .md, .txt, .json · Print or save as PDF |
| **Word fidelity** | Native Word headings, numbered lists, tables (merges, shading, widths), embedded images, fonts, colors and A4/Letter pages. The editor's page view matches the Word page. |
| **AI Canvas** *(optional)* | Rewrite a selection (Ask AI or quick actions), generate, continue writing, or edit the whole document, regenerating **only the parts that change**. Every change is a suggestion to accept or reject, with version history. |
| **Chat with the document** *(optional)* | Questions answered from the document with **clickable sources**, follow-up questions, selection context, and requested changes as suggestions |
| **Integration** | `v-model` (HTML or JSON), typed props, events and methods, CSS-variable theming, light/dark/auto, page or inline layout, responsive toolbar, translatable text, keyboard and screen-reader support |

## Documentation

| Document | For |
|---|---|
| **[User guide](docs/USER-GUIDE.md)** | People writing documents: every feature, AI and chat, shortcuts, FAQ |
| **[Integration guide](docs/INTEGRATION.md)** ([HTML version](docs/integration-steps.html)) | Front-end developers adding the editor to an existing Vue app |
| **[API reference](packages/editor/README.md)** | Every prop, event, method, slot, CSS variable and toolbar item |
| **[Gemini AI server](examples/ai-server/README.md)** | Setting up the AI backend: one config file (`gemini.config.ts`), API, production checklist |
| **[Sample app](examples/sample-app/README.md)** | A working Vue app that uses the editor as a package, with a step-by-step integration walkthrough |
| **[Examples and validation](examples/README.md)** | The sample app, the AI server and the package validation tests |
| **[GEMINI.md](GEMINI.md)** | Developers and AI coding assistants: architecture, rules, known pitfalls, how to extend |
| **[Plan](PLAN.md)** | Decisions, scope and status |

---

## Requirements

| To… | You need |
|---|---|
| Build this repository | Node **20.19+ or 22.12+**, npm 10+ |
| Run the Gemini AI server | Node **22.18+**, and a Gemini API key or a Google Cloud project |
| Use the package in an app | **Vue 3.3+**, and a bundler that supports `package.json` `exports`: Vite (recommended), webpack 5, Rollup or esbuild |

Vue 2 is not supported.

## Quick start

### Try it

```bash
npm install
npm run dev                  # playground (a mock dashboard) at http://localhost:5173
```

The playground uses an offline **demo AI**, so AI and chat work without a key.

### Try it with Gemini

```bash
npm run build && npm run pack

cd examples/ai-server
npm install
cp .env.example .env         # set GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm start                    # or: npm run mock (no key, demo answers)

cd ../sample-app             # in a second terminal
npm install
npm run dev                  # http://localhost:5174
```

### Use it in your app

```bash
npm run build && npm run pack          # → packages/editor/local-rich-editor-<version>.tgz
# in your app:
npm install /path/to/local-rich-editor-<version>.tgz
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RichEditor, createHttpAiAdapter } from '@local/rich-editor'
import '@local/rich-editor/styles.css'

const html = ref('')
// Optional: AI Canvas and chat. Your backend holds the Gemini key (see examples/ai-server).
const ai = createHttpAiAdapter({ url: '/api/ai/complete' })
</script>

<template>
  <div style="height: 80vh">
    <RichEditor v-model="html" layout="document" height="100%" :ai="ai" />
  </div>
</template>
```

Continue with the **[integration guide](docs/INTEGRATION.md)**: saving and loading, image uploads, theming, Word export, AI setup and security.

---

## Repository layout

```
Editor/
├─ packages/editor/            @local/rich-editor: the package you install
│  ├─ src/
│  │  ├─ index.ts              main entry: RichEditor, RichEditorPlugin, adapters, types
│  │  ├─ docx.ts               '@local/rich-editor/docx': exportDocx, importDocx
│  │  ├─ ai.ts                 '@local/rich-editor/ai': buildPrompt, adapters, parsers (no Vue/DOM; usable on servers)
│  │  ├─ RichEditor.vue        root component (props, events, public API)
│  │  ├─ ai/                   AI Canvas and chat: prompts, controllers, Markdown conversion, demo + HTTP adapters
│  │  ├─ toolbar/              toolbar, items and presets, "More" overflow menu
│  │  ├─ components/           menus, dialogs, AI bar, chat panel, find bar, status bar, UI parts
│  │  ├─ extensions/           TipTap extensions: image, table color, indent/spacing, search, paste cleanup, AI suggestions
│  │  ├─ services/             exporters, importers, image handling, Word conversion
│  │  ├─ styles/               tokens.css (CSS variables), content.css (document), editor.css (interface)
│  │  └─ i18n/messages.ts      all interface text
│  ├─ test/                    Vitest unit tests
│  └─ README.md                API reference
├─ apps/playground/            demo dashboard for development and end-to-end tests
├─ e2e/                        Playwright tests (playground): editor.e2e.ts, chat.e2e.ts
├─ examples/
│  ├─ ai-server/               Gemini backend (gemini.config.ts, mock mode)
│  ├─ sample-app/              Vue 3 app that installs the editor from its .tgz
│  └─ sample-app-tests/        package checks + browser tests of the sample app's production build
├─ docs/
│  ├─ USER-GUIDE.md            for people writing documents
│  ├─ INTEGRATION.md           for developers integrating the editor
│  └─ integration-steps.html   integration steps as a web page
├─ GEMINI.md                   developer / AI-assistant handoff
└─ PLAN.md
```

## Scripts

Run these from the repository root unless noted.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the playground with hot reload (reads the package source directly) |
| `npm run build` | Builds the package to `packages/editor/dist` |
| `npm run pack` | Creates `packages/editor/local-rich-editor-<version>.tgz` from the last build |
| `npm run typecheck` | Runs `vue-tsc` on the package and the playground |
| `npm run test -w @local/rich-editor` | Unit tests (Vitest): Word export, search, schema, exporters, AI suggestions, chat |
| `npx playwright test` | End-to-end tests in the installed Microsoft Edge (`PW_CHANNEL=chrome` for Chrome) |
| `npm run validate` in `examples/sample-app-tests` | Rebuilds and packs the editor, installs it in the sample app and AI server, then runs the package checks and browser tests (AI server in mock mode) |
| `npm start` / `npm run mock` in `examples/ai-server` | Gemini server / the same server without calling Gemini |

## Build output

| File | Purpose |
|---|---|
| `dist/rich-editor.js` / `.cjs` | Main entry (about 40 KB gzipped). Vue, TipTap and other dependencies stay outside the bundle and install alongside it. |
| `dist/docx.js`, `dist/ai.js` | Headless Word conversion, and AI helpers that work without Vue or a DOM |
| `dist/rich-editor.css` | All styles (`@local/rich-editor/styles.css`) |
| `dist/*.d.ts` | TypeScript types |
| `exportDocx-*.js`, `importDocx-*.js`, `lowlight-*.js`, Markdown parser | Chunks that load only when first used |

## Releasing a new version

1. Update `version` in `packages/editor/package.json`. Renaming a prop or event is a major version.
2. Update the tarball file name in `examples/sample-app/package.json` and `examples/ai-server/package.json`.
3. Run `npm run typecheck`, `npm run test -w @local/rich-editor`, `npx playwright test`, and `npm run validate` in `examples/sample-app-tests`.
4. Run `npm run build && npm run pack`, then share the `.tgz` and update each app ([Updating the package](docs/INTEGRATION.md#12-updating-the-package)).

## Security and privacy

- **The Gemini API key stays on the server.** The editor only calls your backend, through an adapter.
- **AI output is always shown as a suggestion,** and is filtered through the editor's content rules, never inserted as raw HTML.
- **What's sent to Gemini:** AI edits send the selected text plus some surrounding text; chat sends the whole document (up to about 150,000 characters) with each question. Check this against your data policy. Vertex AI offers enterprise data controls.
- Sanitize stored HTML on your server and before any `v-html` ([integration guide §11](docs/INTEGRATION.md#11-security)).

## Known limitations

- **Word layout:** Word lays out text differently from a browser, so line breaks can move. Fonts the reader doesn't have are replaced.
- **Word import:** importing .docx keeps structure and basic formatting, but not font colors or sizes.
- **AI rewrites** work in Markdown: colors, fonts and highlights inside the rewritten text aren't kept; the rest of the document is untouched.
- **Versions and chat history** are kept in memory unless the host saves them (`version-created`, `v-model:chat-history`).
- **Chat on very long documents** (over about 60 pages) searches only the part around the cursor.
- **Remounting:** `features` and `extensions` are read when the editor mounts; change its `key` to apply new values.
- **TypeScript:** needs `moduleResolution` `bundler` or `node` (not `node16` or `nodenext`).
- **Not yet verified:** a live Gemini call (development and tests used the demo adapter and the server's mock mode), and opening exported .docx files in desktop Word by hand.
