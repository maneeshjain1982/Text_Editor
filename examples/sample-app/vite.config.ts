import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// A plain consumer config: no aliases to the editor source. The editor is resolved from
// node_modules/@local/rich-editor, installed from the packed .tgz.
export default defineConfig({
  plugins: [vue()],
  // 5174 so it can run alongside the editor playground (5173).
  server: { port: 5174, strictPort: true },
  optimizeDeps: {
    // The editor lazy-loads these on first export/import; pre-bundle them so dev doesn't reload mid-action.
    include: ['@local/rich-editor/docx', 'docx', 'mammoth', 'marked', 'turndown', 'turndown-plugin-gfm'],
  },
})
