import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import pkg from './package.json' with { type: 'json' }

// Everything the consumer installs (vue, @tiptap/*, …) stays external so the
// dashboard never ends up with duplicate copies of Vue or ProseMirror.
const externals = [
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.dependencies ?? {}),
]
const isExternal = (id: string) =>
  externals.some((dep) => id === dep || id.startsWith(`${dep}/`))

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: './tsconfig.json',
      entryRoot: 'src',
      include: ['src'],
      exclude: ['**/*.spec.ts'],
    }),
  ],
  build: {
    lib: {
      entry: {
        'rich-editor': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        docx: fileURLToPath(new URL('./src/docx.ts', import.meta.url)),
        ai: fileURLToPath(new URL('./src/ai.ts', import.meta.url)),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
      cssFileName: 'rich-editor',
    },
    rolldownOptions: {
      external: isExternal,
      output: {
        exports: 'named',
      },
    },
    sourcemap: true,
  },
})
