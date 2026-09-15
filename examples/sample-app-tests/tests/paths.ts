import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const APP_DIR = path.resolve(here, '../../sample-app')
export const EDITOR_PKG_DIR = path.join(APP_DIR, 'node_modules', '@local', 'rich-editor')
export const REPO_EDITOR_DIR = path.resolve(here, '../../../packages/editor')
