# Examples: sample app, Gemini server and package validation

These projects check that `@local/rich-editor` works as an **installed package**. Unlike the playground, which reads the editor's source code directly, they install the packed `.tgz` file exactly as your dashboard would.

| Project | What it is |
|---|---|
| [`sample-app/`](sample-app) | **Docs Hub**, a small Vue 3 + TypeScript + Vite + Vue Router app. It uses the editor the way the [integration guide](../docs/INTEGRATION.md) describes. Its [README](sample-app/README.md) explains how to run it and how the editor is integrated. |
| [`ai-server/`](ai-server) | Reference **Gemini** backend for the AI Canvas. Configured in one file, [`gemini.config.ts`](ai-server/gemini.config.ts). Its [README](ai-server/README.md) covers setup, the API and a production checklist. |
| [`sample-app-tests/`](sample-app-tests) | A separate test project (Playwright). It checks the installed package, then tests the sample app's **production build** in a real browser, with the AI server in mock mode. |

All three folders are standalone npm projects. They are deliberately **not** part of the root npm workspace, so nothing can be resolved from the editor's source by mistake.

---

## Run everything

```bash
# once, after cloning (from the repository root)
npm install
cd examples/sample-app       && npm run editor:pack && npm install
cd ../ai-server             && npm install
cd ../sample-app-tests       && npm install

# every time: rebuild + repack the editor, update the app's copy, run all tests
npm run validate
```

`validate` runs these steps in order:

1. `npm run build` and `npm run pack` in the editor repository, producing `packages/editor/local-rich-editor-<version>.tgz`
2. `npm install` of that tarball into `sample-app` and `ai-server`
3. The package checks (Node, no browser)
4. The AI server in **mock mode** on port 8787 (same code and protocol as with Gemini, deterministic answers, no API key)
5. A production build of the sample app, including `vue-tsc`, served with `vite preview` on port 4173
6. The browser tests against that build, in the installed Microsoft Edge (`PW_CHANNEL=chrome` for Chrome)

Other commands in `sample-app-tests`:

| Command | Runs |
|---|---|
| `npm test` | All tests, using the currently installed tarball (no rebuild) |
| `npm run test:package` | Package checks only |
| `npm run test:app` | Browser tests only |

## Try the sample app

```bash
cd examples/sample-app
npm run dev        # http://localhost:5174 (runs alongside the playground on 5173)
```

**[sample-app/README.md](sample-app/README.md)** covers the full run steps, what to try, and a step-by-step walkthrough of how the editor is integrated, with the file and code for each step.

## What is validated

### Package checks (`tests/package.spec.ts`)

| Check | Why it matters |
|---|---|
| Installed from the `.tgz`, not a symlink to the source | Tests the real published package |
| Version matches `packages/editor/package.json` | The app isn't testing a stale tarball |
| Contains only `dist/`, `package.json` and `README.md` | No source code, tests or config files in the package |
| Every file in the `exports` map exists and isn't empty | Imports of `@local/rich-editor`, `/docx` and `/styles.css` resolve |
| Vue is a peer dependency and the app's copy is shared | No duplicate Vue, which would break reactivity |
| The stylesheet contains the editor styles and theme tokens | The styles import works |
| `vue-tsc` passes in the app | The published types are usable |
| `exportDocx` from `/docx` produces a valid Word file in Node | The headless entry works without a browser |
| `/ai` imports in Node with no Vue or TipTap, builds prompts and runs the demo adapter | Backends can reuse the prompt builder |

### Browser tests (`tests/app.spec.ts`)

| Scenario | Integration features covered |
|---|---|
| The list page doesn't load the editor | Lazy loading the editor route |
| Create, format, insert a table, save, reload | `v-model` with JSON, styles import, theme overrides, saving through an API |
| Ctrl+S and the unsaved-changes prompt | `ready` event used as the saved state, router leave guard |
| Image upload success and failure | `upload-image` adapter, `error` event |
| Custom button in the toolbar slot | `toolbar-end` slot, access to the TipTap instance |
| Word download from the editor and from the list | `download('docx')`, headless `@local/rich-editor/docx` |
| Read-only view | `editable=false`, `features`, `height="auto"` |
| Dark mode | `theme` prop, CSS variable overrides on `.re-root` and `.re-portal` |
| AI: edit a selection through the app's `/api/ai` proxy and the AI server | `ai` prop with `createHttpAiAdapter`, request payload, suggestion not saved until accepted |
| Chat: cited answer through the server, source link highlights the block, history kept after reload | `chat` task, `v-model:chat-history` |
| AI: backend failure | Error shown in the AI bar with **Try again**; server rejects invalid requests with 400 |

Every browser test also fails if the page logs a console error.

## Updating after editor changes

The tarball file name contains the version. After changing `version` in `packages/editor/package.json`, update the file name in:

- `sample-app/package.json` → `dependencies["@local/rich-editor"]`
- `sample-app/package.json` → `scripts["editor:update"]`
- `ai-server/package.json` → `dependencies["@local/rich-editor"]` and `scripts["editor:update"]`
