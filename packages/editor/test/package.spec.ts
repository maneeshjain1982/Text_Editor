// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const PKG_DIR = path.resolve(import.meta.dirname, '..')
const SRC_DIR = path.join(PKG_DIR, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|vue)$/.test(entry) ? [full] : []
  })
}

const IMPORT = /(?:from|import)\s+['"]([^'"]+)['"]/g

/**
 * The editor must be usable in any Vue app, so its source may only import its own files
 * and declared dependencies — never anything from the repository around it.
 */
describe('package isolation', () => {
  const files = sourceFiles(SRC_DIR)

  it('has sources to check', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('never imports files from outside the package', () => {
    const escapes: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const [, specifier] of text.matchAll(IMPORT)) {
        if (!specifier.startsWith('.')) continue
        const resolved = path.resolve(path.dirname(file), specifier)
        if (!resolved.startsWith(SRC_DIR)) escapes.push(`${path.relative(PKG_DIR, file)} → ${specifier}`)
      }
    }
    expect(escapes).toEqual([])
  })

  it('only imports packages it declares as dependencies or peers', () => {
    const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))
    // The package's own name appears in doc comments showing how hosts import each entry.
    const allowed = new Set([pkg.name, ...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})])
    const undeclared = new Set<string>()
    for (const file of files) {
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
        // '@scope/name/sub' and 'name/sub' both belong to their root package.
        const root = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
        if (!allowed.has(root)) undeclared.add(`${path.relative(PKG_DIR, file)} → ${specifier}`)
      }
    }
    expect([...undeclared]).toEqual([])
  })

  it('declares Vue as a peer dependency only, so the host app provides the single copy', () => {
    const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))
    expect(pkg.peerDependencies?.vue).toBeTruthy()
    expect(pkg.dependencies?.vue).toBeUndefined()
    expect(pkg.files).toContain('dist')
  })
})
