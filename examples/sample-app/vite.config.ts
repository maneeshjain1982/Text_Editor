import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The Gemini backend (examples/ai-server). The browser only talks to this app's own
// origin; Vite forwards /api/ai to the server, just like a production reverse proxy would.
const aiServer = { '/api/ai': { target: process.env.AI_SERVER_URL ?? 'http://localhost:8787', changeOrigin: true } }

// A plain consumer config: no aliases to the editor source. The editor is resolved from
// node_modules/@local/rich-editor, installed from the packed .tgz.
export default defineConfig({
  plugins: [vue()],
  // 5174 so it can run alongside the editor playground (5173).
  server: { port: 5174, strictPort: true, proxy: aiServer },
  preview: { proxy: aiServer },
  optimizeDeps: {
    // The editor lazy-loads these on first export/import; pre-bundle them so dev doesn't reload mid-action.
    include: ['@local/rich-editor/docx', 'docx', 'mammoth', 'marked', 'turndown', 'turndown-plugin-gfm'],
  },
})
