import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// In dev the playground reads the package source directly for instant HMR.
// `npm run build:playground` still exercises the same public entry point.
const src = (p: string) => fileURLToPath(new URL(`../../packages/editor/src/${p}`, import.meta.url))

export default defineConfig({
  plugins: [vue()],
  // Pre-bundle deps the editor imports lazily (docx export, docx/markdown import).
  // Otherwise Vite discovers them on first use and reloads the page mid-action.
  optimizeDeps: {
    include: ['docx', 'mammoth', 'marked', 'turndown', 'turndown-plugin-gfm', 'lowlight', 'highlight.js/lib/languages/typescript'],
  },
  resolve: {
    alias: [
      { find: /^@local\/rich-editor\/styles\.css$/, replacement: src('styles/index.css') },
      { find: /^@local\/rich-editor$/, replacement: src('index.ts') },
    ],
  },
})
