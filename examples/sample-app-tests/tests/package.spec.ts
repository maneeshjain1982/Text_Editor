import { expect, test } from '@playwright/test'
import { execSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { APP_DIR, EDITOR_PKG_DIR, REPO_EDITOR_DIR } from './paths'

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const pkg = () => readJson(path.join(EDITOR_PKG_DIR, 'package.json'))

/** Collect every file path referenced by an `exports` map. */
function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(exportTargets)
  return []
}

test.describe('installed package', () => {
  test('is installed from the packed tarball, not linked to the source', () => {
    expect(existsSync(EDITOR_PKG_DIR), 'run `npm install` in examples/sample-app').toBe(true)
    expect(lstatSync(EDITOR_PKG_DIR).isSymbolicLink()).toBe(false)
    expect(realpathSync(EDITOR_PKG_DIR).startsWith(realpathSync(APP_DIR))).toBe(true)

    const lock = readJson(path.join(APP_DIR, 'package-lock.json'))
    const entry = lock.packages['node_modules/@local/rich-editor']
    expect(entry.resolved).toMatch(/local-rich-editor-[\d.]+\.tgz$/)
  })

  test('matches the version in the editor repository', () => {
    expect(pkg().version).toBe(readJson(path.join(REPO_EDITOR_DIR, 'package.json')).version)
  })

  test('ships only the build output (no source, tests or configs)', () => {
    const entries = readdirSync(EDITOR_PKG_DIR).sort()
    expect(entries).toEqual(expect.arrayContaining(['dist', 'package.json', 'README.md']))
    for (const unwanted of ['src', 'test', 'node_modules', 'vite.config.ts', 'tsconfig.json']) {
      expect(entries, `package should not contain ${unwanted}`).not.toContain(unwanted)
    }
  })

  test('every file in the exports map exists', () => {
    const targets = exportTargets(pkg().exports)
    expect(targets.length).toBeGreaterThan(5)
    for (const target of [...targets, pkg().main, pkg().module, pkg().types]) {
      const file = path.join(EDITOR_PKG_DIR, target)
      expect(existsSync(file), `${target} is missing`).toBe(true)
      expect(statSync(file).size, `${target} is empty`).toBeGreaterThan(0)
    }
  })

  test('declares Vue as a peer dependency and shares the app’s copy', () => {
    const { peerDependencies = {}, dependencies = {} } = pkg()
    expect(peerDependencies.vue).toBeTruthy()
    expect(dependencies.vue).toBeUndefined()

    const fromApp = createRequire(path.join(APP_DIR, 'package.json')).resolve('vue')
    const fromEditor = createRequire(path.join(EDITOR_PKG_DIR, 'package.json')).resolve('vue')
    expect(fromEditor).toBe(fromApp)
    expect(existsSync(path.join(EDITOR_PKG_DIR, 'node_modules', 'vue'))).toBe(false)
  })

  test('stylesheet contains the editor styles and design tokens', () => {
    const css = readFileSync(path.join(EDITOR_PKG_DIR, 'dist', 'rich-editor.css'), 'utf8')
    for (const selector of ['.re-root', '.re-toolbar', '.re-content', '--re-primary', '.re-theme-dark']) {
      expect(css).toContain(selector)
    }
  })

  test('TypeScript types compile in the consuming app (vue-tsc)', () => {
    test.setTimeout(180_000)
    // Throws with the compiler output if the package's types don't resolve.
    execSync('npm run typecheck', { cwd: APP_DIR, stdio: 'pipe' })
  })

  test('headless Word export works from the “/docx” entry in Node', async () => {
    const docxEntry = pkg().exports['./docx'].import as string
    const { exportDocx } = await import(pathToFileURL(path.join(EDITOR_PKG_DIR, docxEntry)).href)

    const blob: Blob = await exportDocx(
      {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Package check' }] },
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [{ type: 'tableCell', attrs: { colspan: 2, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merged' }] }] }],
              },
            ],
          },
        ],
      },
      { pageSize: 'Letter' },
    )

    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Package check')
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/)
    expect(xml).toContain('<w:numPr>')
    expect(xml).toMatch(/<w:gridSpan w:val="2"\/>/)
    expect(xml).toMatch(/<w:pgSz w:w="12240" w:h="15840"/)
  })
})
