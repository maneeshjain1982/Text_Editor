import type { JSONContent } from '@local/rich-editor'

/**
 * Mock backend. A real app would call its REST API here; this keeps documents in
 * localStorage so the sample runs without a server.
 */
export interface DocumentRecord {
  id: string
  title: string
  content: JSONContent
  updatedAt: string
}

const STORAGE_KEY = 'docs-hub-documents'
const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

const seed: DocumentRecord[] = [
  {
    id: 'welcome',
    title: 'Welcome to Docs Hub',
    updatedAt: '2026-09-15T09:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Docs Hub' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This sample app uses ' },
            { type: 'text', marks: [{ type: 'code' }], text: '@local/rich-editor' },
            { type: 'text', text: ' installed from its ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'packed tarball' },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: ['Feature', 'Status'].map((text) => ({
                type: 'tableHeader',
                attrs: { colspan: 1, rowspan: 1, colwidth: null },
                content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
              })),
            },
            {
              type: 'tableRow',
              content: ['Word export', 'Ready'].map((text) => ({
                type: 'tableCell',
                attrs: { colspan: 1, rowspan: 1, colwidth: null },
                content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
              })),
            },
          ],
        },
      ],
    },
  },
]

function load(): DocumentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DocumentRecord[]) : structuredClone(seed)
  } catch {
    return structuredClone(seed)
  }
}

function persist(docs: DocumentRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
}

export const documentsApi = {
  async list(): Promise<DocumentRecord[]> {
    await delay()
    return load().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async get(id: string): Promise<DocumentRecord | undefined> {
    await delay()
    return load().find((d) => d.id === id)
  },

  async save(doc: Omit<DocumentRecord, 'id' | 'updatedAt'> & { id?: string }): Promise<DocumentRecord> {
    await delay()
    const docs = load()
    const record: DocumentRecord = {
      ...doc,
      id: doc.id ?? `doc-${Date.now().toString(36)}`,
      updatedAt: new Date().toISOString(),
    }
    const index = docs.findIndex((d) => d.id === record.id)
    if (index >= 0) docs[index] = record
    else docs.push(record)
    persist(docs)
    return record
  },

  async remove(id: string): Promise<void> {
    await delay()
    persist(load().filter((d) => d.id !== id))
  },

  /** Mock image upload: "stores" the file and returns a URL. Real apps POST to their upload endpoint. */
  async uploadImage(file: File): Promise<string> {
    await delay(600)
    if (file.name.startsWith('fail-')) throw new Error('Simulated upload failure')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  },
}
