import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.spec.ts'],
    // Exporters inline stylesheets via `?raw`; Vitest blanks CSS unless told otherwise.
    css: true,
  },
})
