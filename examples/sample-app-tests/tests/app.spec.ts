import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'

const editor = (page: Page) => page.locator('.re-content[contenteditable="true"]')
const toolbarButton = (page: Page, name: string) => page.locator('.re-toolbar').getByRole('button', { name, exact: true })

async function docxText(path: string) {
  const zip = await JSZip.loadAsync(await readFile(path))
  return zip.file('word/document.xml')!.async('string')
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  ;(page as any).__errors = errors

  // Start every test from the seeded mock data.
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('document-table')).toBeVisible()
})

test.afterEach(async ({ page }) => {
  expect((page as any).__errors, 'console errors').toEqual([])
})

test('lists documents without loading the editor', async ({ page }) => {
  await expect(page.getByTestId('row-welcome')).toContainText('Welcome to Docs Hub')
  await expect(page.locator('.re-root')).toHaveCount(0)
})

test('creates, formats and saves a document that survives a reload', async ({ page }) => {
  await page.getByTestId('new-document').click()
  await expect(editor(page)).toBeVisible()

  // Styles from '@local/rich-editor/styles.css' are applied
  await expect(page.locator('.re-toolbar')).toHaveCSS('display', 'flex')
  // App theme tokens (editor-theme.css) override the package defaults
  const primary = await page.locator('.re-root').evaluate((el) => getComputedStyle(el).getPropertyValue('--re-primary').trim())
  expect(primary).toBe('#0f766e')

  await page.getByTestId('title').fill('Release notes')
  await editor(page).click()
  // Toggle bold on, type, toggle off. (Selecting text and then pressing End+Enter with zero delay
  // races ProseMirror's asynchronous selection sync — an automation artefact, not a user scenario.)
  await toolbarButton(page, 'Bold').click()
  await expect(toolbarButton(page, 'Bold')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.type('Version 2 is here')
  await toolbarButton(page, 'Bold').click()
  await page.keyboard.press('Enter')
  await expect(editor(page).locator('strong')).toHaveText('Version 2 is here')
  await expect(editor(page).locator('p')).toHaveCount(2)

  await toolbarButton(page, 'Table').click()
  await page.getByRole('button', { name: '2 × 3' }).click()
  await expect(editor(page).locator('table tr')).toHaveCount(2)
  await expect(editor(page).locator('strong')).toHaveText('Version 2 is here')

  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('notice')).toHaveText('Document saved')
  await expect(page).toHaveURL(/\/documents\/doc-[a-z0-9]+\/edit$/)
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved')

  await page.reload()
  await expect(editor(page).locator('strong')).toHaveText('Version 2 is here')
  await expect(editor(page).locator('table tr')).toHaveCount(2)
  await expect(page.getByTestId('title')).toHaveValue('Release notes')
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved')
})

test('saves with Ctrl+S and warns before leaving with unsaved changes', async ({ page }) => {
  await page.getByTestId('row-welcome').getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved')

  await editor(page).locator('h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes')

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: 'Documents' }).click()
  await expect(page).toHaveURL(/\/documents\/welcome\/edit$/)

  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('notice')).toHaveText('Document saved')
  // Saved, so leaving no longer prompts; the edit is stored in the document content.
  await page.getByRole('link', { name: 'Documents' }).click()
  await page.getByTestId('row-welcome').getByRole('link', { name: 'Welcome to Docs Hub' }).click()
  await expect(page.getByTestId('read-only-editor').locator('h1')).toHaveText('Welcome to Docs Hub!')
})

test('uploads images through the app’s upload adapter and reports failures', async ({ page }) => {
  await page.getByTestId('new-document').click()
  await expect(editor(page)).toBeVisible()
  const png = await page.locator('.re-toolbar').screenshot()

  await toolbarButton(page, 'Image').click()
  await page.getByRole('dialog', { name: 'Insert image' }).locator('input[type="file"]').setInputFiles({ name: 'toolbar.png', mimeType: 'image/png', buffer: png })
  const figure = editor(page).locator('figure.re-image')
  await expect(figure.locator('.re-image-progress')).toBeVisible() // preview while "uploading"
  await expect(figure.locator('.re-image-progress')).toHaveCount(0, { timeout: 5000 })
  await expect(figure.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)

  // The mock API rejects files named fail-*: the preview is removed and the app shows its message.
  await toolbarButton(page, 'Image').click()
  await page.getByRole('dialog', { name: 'Insert image' }).locator('input[type="file"]').setInputFiles({ name: 'fail-upload.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByTestId('notice')).toHaveText('The image could not be uploaded.')
  await expect(editor(page).locator('figure.re-image')).toHaveCount(1)
})

test('custom toolbar slot button uses the editor instance', async ({ page }) => {
  await page.getByTestId('new-document').click()
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
  await page.getByTestId('insert-signature').click()
  await expect(editor(page).locator('hr')).toHaveCount(1)
  await expect(editor(page).locator('em')).toHaveText('Reviewed by the Docs Hub team')
})

test('downloads Word files from the editor page and from the list', async ({ page }, testInfo) => {
  // From the edit page, through the component's exposed API
  await page.getByTestId('row-welcome').getByRole('link', { name: 'Edit' }).click()
  await expect(editor(page)).toBeVisible()
  const [fromEditor] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-docx').click()])
  expect(fromEditor.suggestedFilename()).toBe('Welcome to Docs Hub.docx')
  const editorPath = testInfo.outputPath('from-editor.docx')
  await fromEditor.saveAs(editorPath)
  const editorXml = await docxText(editorPath)
  expect(editorXml).toContain('Welcome to Docs Hub')
  expect(editorXml).toContain('<w:tbl>')

  // From the list, through the headless '@local/rich-editor/docx' entry (no editor mounted)
  await page.getByRole('link', { name: 'Documents' }).click()
  await expect(page.locator('.re-root')).toHaveCount(0)
  const [fromList] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('row-welcome').getByRole('button', { name: 'Download .docx' }).click(),
  ])
  const listPath = testInfo.outputPath('from-list.docx')
  await fromList.saveAs(listPath)
  const listXml = await docxText(listPath)
  expect(listXml).toMatch(/<w:pStyle w:val="Heading1"\/>/)
  expect(listXml).toContain('<w:tbl>')
})

test('read-only view renders the document without editing controls', async ({ page }) => {
  await page.getByTestId('row-welcome').getByRole('link', { name: 'Welcome to Docs Hub' }).click()
  await expect(page.getByTestId('view-title')).toHaveText('Welcome to Docs Hub')
  const viewer = page.getByTestId('read-only-editor')
  await expect(viewer.locator('.re-content')).toHaveAttribute('contenteditable', 'false')
  await expect(viewer.locator('.re-toolbar')).toHaveCount(0)
  await expect(viewer.locator('.re-statusbar')).toHaveCount(0)
  await expect(viewer.locator('table')).toBeVisible()
})

test('editor follows the app’s dark mode and theme tokens', async ({ page }) => {
  await page.getByTestId('new-document').click()
  await expect(editor(page)).toBeVisible()
  await expect(page.locator('.re-root')).toHaveClass(/re-theme-light/)

  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('.re-root')).toHaveClass(/re-theme-dark/)
  const primary = await page.locator('.re-root').evaluate((el) => getComputedStyle(el).getPropertyValue('--re-primary').trim())
  expect(primary).toBe('#2dd4bf')

  // Teleported dropdowns carry the theme too
  await toolbarButton(page, 'Text color').click()
  await expect(page.locator('.re-portal.re-popover')).toHaveClass(/re-theme-dark/)
})

test('AI Canvas: edits a selection through the app proxy and the Gemini server (mock mode)', async ({ page }) => {
  const health = await page.request.get('/api/ai/health')
  expect(await health.json()).toMatchObject({ ok: true, mock: true })

  await page.getByTestId('row-welcome').getByRole('link', { name: 'Edit' }).click()
  await expect(editor(page)).toBeVisible()
  const paragraph = editor(page).locator('p').first()
  await paragraph.click({ clickCount: 3 })
  await page.keyboard.press('Control+j')
  const bar = page.getByTestId('re-ai-bar')
  await bar.getByRole('textbox', { name: 'Instruction for AI' }).fill('Make it longer')

  const [request] = await Promise.all([page.waitForRequest('**/api/ai/complete'), page.keyboard.press('Enter')])
  const body = request.postDataJSON()
  expect(body.task).toBe('edit-selection')
  expect(body.selection).toContain('This sample app uses')

  const suggestion = editor(page).locator('.re-ai-added')
  await expect(suggestion).toContainText('This point matters because')
  // Not saved until accepted
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved')
  await page.getByTestId('re-ai-accept-all').click()
  await expect(paragraph).toContainText('This point matters because')
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes')
})

test('AI Canvas: server validation errors are shown to the user', async ({ page }) => {
  const bad = await page.request.post('/api/ai/complete', { data: { task: 'not-a-task', instruction: 'x' } })
  expect(bad.status()).toBe(400)

  await page.getByTestId('new-document').click()
  await expect(editor(page)).toBeVisible()
  // Stop the proxy target from answering: simulate the backend being down
  await page.route('**/api/ai/complete', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"The AI service is unavailable."}' }))
  await editor(page).click()
  await page.keyboard.press('Control+j')
  await page.getByTestId('re-ai-bar').getByRole('textbox', { name: 'Instruction for AI' }).fill('Write a plan')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('re-ai-bar')).toContainText('The AI request failed')
  await expect(page.getByTestId('re-ai-bar').getByRole('button', { name: 'Try again' })).toBeVisible()
  // The browser logs the simulated 503 as a console error; that one is expected.
  const errors = (page as any).__errors as string[]
  errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('503')))
})

test('Chat with document: cited answer through the Gemini server (mock), history kept per document', async ({ page }) => {
  await page.getByTestId('row-welcome').getByRole('link', { name: 'Edit' }).click()
  await expect(editor(page)).toBeVisible()
  await toolbarButton(page, 'Chat with document').click()
  const chat = page.getByTestId('re-chat')
  const input = chat.getByRole('textbox', { name: 'Question about the document' })
  await input.fill('What does the document say about Word export?')

  const [request] = await Promise.all([page.waitForRequest('**/api/ai/complete'), input.press('Enter')])
  const body = request.postDataJSON()
  expect(body.task).toBe('chat')
  expect(body.blocks.length).toBeGreaterThan(1)

  const answer = chat.locator('.re-chat-assistant')
  await expect(answer).toContainText('Word export')
  await answer.locator('.re-chat-sources button').first().click()
  await expect(editor(page).locator('.re-ai-flash')).toHaveCount(1)

  // History survives a reload (saved through v-model:chat-history)
  await page.reload()
  await toolbarButton(page, 'Chat with document').click()
  await expect(page.getByTestId('re-chat').locator('.re-chat-question')).toHaveText('What does the document say about Word export?')
})
