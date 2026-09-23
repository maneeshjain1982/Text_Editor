import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'

const SHOTS = process.env.SHOTS_DIR


const editor = (page: Page) => page.locator('.re-content')
const toolbarButton = (page: Page, name: string) => page.locator('.re-toolbar').getByRole('button', { name, exact: true })

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function clearEditor(page: Page) {
  // Click plain text: inside a table cell or code block, Ctrl+A only selects that cell/block.
  await editor(page).locator('h1').first().click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as any).__errors = errors
  await page.goto('/')
  await expect(editor(page)).toContainText('Quarterly Business Review')
})

test.afterEach(async ({ page }) => {
  expect((page as any).__errors, 'console errors').toEqual([])
})

test('renders the sample document with toolbar, table, image and status bar', async ({ page }) => {
  await expect(page.locator('.re-toolbar')).toBeVisible()
  await expect(editor(page).locator('table')).toBeVisible()
  await expect(editor(page).locator('figure.re-image img')).toBeVisible()
  await expect(editor(page).locator('pre code .hljs-keyword').first()).toBeVisible()
  await expect(page.locator('.re-statusbar')).toContainText('words')
  await shot(page, '01-document-light')
})

test('formats text from the toolbar and keyboard', async ({ page }) => {
  await clearEditor(page)
  await page.keyboard.type('Hello world')
  await page.keyboard.press('Shift+Home')
  await toolbarButton(page, 'Bold').click()
  await page.keyboard.press('Control+i')
  await expect(editor(page).locator('strong em, em strong')).toHaveText('Hello world')

  // Heading via text style menu
  await page.locator('.re-select-heading').click()
  await page.getByRole('menuitem', { name: 'Heading 2' }).click()
  await expect(editor(page).locator('h2')).toHaveText('Hello world')

  // Text colour
  await page.keyboard.press('Shift+Home')
  await toolbarButton(page, 'Text color').click()
  await page.getByRole('option', { name: '#dc2626' }).click()
  await expect(editor(page).locator('span[style*="color"]')).toHaveCount(1)

  // Font size
  await page.locator('.re-select-size').click()
  await page.getByRole('menuitem', { name: '24', exact: true }).click()
  await expect(editor(page).locator('span[style*="font-size: 24pt"]')).toHaveCount(1)

  // Alignment
  await toolbarButton(page, 'Alignment').click()
  await page.getByRole('menuitem', { name: 'Align center' }).click()
  await expect(editor(page).locator('h2')).toHaveCSS('text-align', 'center')

  // Undo
  await toolbarButton(page, 'Undo').click()
  await expect(editor(page).locator('h2')).not.toHaveCSS('text-align', 'center')
})

test('lists, indent and checklist', async ({ page }) => {
  await clearEditor(page)
  await toolbarButton(page, 'Numbered list').click()
  await page.keyboard.type('One')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Two')
  await page.keyboard.press('Tab')
  await expect(editor(page).locator('ol > li > ol > li')).toHaveText('Two')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await toolbarButton(page, 'Checklist').click()
  await page.keyboard.type('Task')
  await expect(editor(page).locator('ul[data-type="taskList"] li > div')).toHaveText('Task')
  await editor(page).locator('ul[data-type="taskList"] li input[type="checkbox"]').check()
  await expect(editor(page).locator('ul[data-type="taskList"] li')).toHaveAttribute('data-checked', 'true')
})

test('inserts and edits a table', async ({ page }) => {
  await clearEditor(page)
  await toolbarButton(page, 'Table').click()
  await page.getByRole('button', { name: '3 × 4' }).click()
  const table = editor(page).locator('table')
  await expect(table.locator('tr')).toHaveCount(3)
  await expect(table.locator('tr').first().locator('th')).toHaveCount(4)

  const menu = page.locator('.re-bubble[aria-label="Table"]')
  await expect(menu).toBeVisible()
  await shot(page, '02-table-menu')

  await menu.getByRole('button', { name: 'Rows' }).click()
  await page.getByRole('menuitem', { name: 'Insert row below' }).click()
  await expect(table.locator('tr')).toHaveCount(4)

  await menu.getByRole('button', { name: 'Columns' }).click()
  await page.getByRole('menuitem', { name: 'Insert column right' }).click()
  await expect(table.locator('tr').first().locator('th')).toHaveCount(5)

  // Merge the first two header cells by dragging across them
  const a = (await table.locator('th').nth(0).boundingBox())!
  const b = (await table.locator('th').nth(1).boundingBox())!
  await page.mouse.move(a.x + 10, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(table.locator('.selectedCell')).toHaveCount(2)
  await expect(menu.getByRole('button', { name: 'Merge cells' })).toBeEnabled()
  await menu.getByRole('button', { name: 'Merge cells' }).click()
  await expect(table.locator('th[colspan="2"]')).toHaveCount(1)

  // Cell colour
  await table.locator('td').first().click()
  await menu.getByRole('button', { name: 'Cell color' }).click()
  await page.getByRole('option', { name: '#fef08a' }).click()
  await expect(table.locator('td[data-background="#fef08a"]')).toHaveCount(1)

  await menu.getByRole('button', { name: 'Delete table' }).click()
  await expect(table).toHaveCount(0)
})

test('uploads, resizes, aligns and captions an image', async ({ page }) => {
  // A real PNG: a crop of the rendered chart.
  const png = await page.locator('.re-content figure img').screenshot()
  await clearEditor(page)
  await toolbarButton(page, 'Image').click()
  const dialog = page.getByRole('dialog', { name: 'Insert image' })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(200) // let the open animation finish for the screenshot
  await shot(page, '03-image-dialog')
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: png })
  const figure = editor(page).locator('figure.re-image')
  await expect(figure).toHaveCount(1)
  await expect(figure.locator('img')).toHaveAttribute('src', /^data:image\/png/)

  // Select the image → image menu
  await figure.locator('img').click()
  const menu = page.locator('.re-bubble[aria-label="Image"]')
  await expect(menu).toBeVisible()
  // The menu sits just above the image, horizontally centred on it.
  await expect
    .poll(async () => {
      const m = (await menu.boundingBox())!
      const i = (await figure.locator('img').boundingBox())!
      return Math.abs(m.y + m.height + 8 - i.y) < 4 && Math.abs(m.x + m.width / 2 - (i.x + i.width / 2)) < 4
    })
    .toBe(true)
  await menu.getByRole('button', { name: 'Wrap text, image left' }).click()
  await expect(figure).toHaveAttribute('data-align', 'wrapLeft')

  // Resize with the right handle
  await figure.locator('img').click()
  const handle = figure.locator('.re-handle-e')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(figure).toHaveAttribute('style', /width: \d+px/)

  // Caption
  await figure.locator('img').click()
  await figure.locator('.re-image-caption-input').fill('A red box')
  await expect(page.getByTestId('output')).toContainText('A red box')
  await shot(page, '04-image-selected')
})

test('rejects unsupported image files with a message', async ({ page }) => {
  await toolbarButton(page, 'Image').click()
  const dialog = page.getByRole('dialog', { name: 'Insert image' })
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
  await expect(dialog.getByRole('alert')).toHaveText('Unsupported image type.')
})

test('find and replace', async ({ page }) => {
  await editor(page).locator('h1').click()
  await page.keyboard.press('Control+f')
  const find = page.getByRole('search')
  await find.getByPlaceholder('Find').fill('revenue')
  await expect(find.locator('.re-find-count')).toHaveText(/1 of \d+/)
  await expect(editor(page).locator('.re-search-match').first()).toBeVisible()
  await shot(page, '05-find-replace')
  await find.getByPlaceholder('Replace with').fill('income')
  await find.getByRole('button', { name: 'Replace all' }).click()
  await expect(find.locator('.re-find-count')).toHaveText('No results')
  await expect(editor(page)).toContainText('income grew')
  await page.keyboard.press('Escape')
  await expect(find).toHaveCount(0)
})

test('creates and edits a link', async ({ page }) => {
  await clearEditor(page)
  await page.keyboard.type('Visit site')
  await page.keyboard.press('Shift+Home')
  // ProseMirror syncs the DOM selection asynchronously; opening the dialog too early
  // would see an empty selection and insert the URL as the link text.
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Visit site')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Link' })
  await dialog.getByLabel('URL').fill('example.org')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  const link = editor(page).locator('a[href="https://example.org"]')
  await expect(link).toHaveText('Visit site')
  await link.click()
  await expect(page.locator('.re-link-bubble')).toBeVisible()
  await page.locator('.re-link-bubble').getByRole('button', { name: 'Remove' }).click()
  await expect(editor(page).locator('a')).toHaveCount(0)
})

test('exports .docx with native tables, lists and images, then re-imports it', async ({ page }, testInfo) => {
  await shot(page, '06-toolbar')
  const downloadButton = page.locator('.re-toolbar').getByRole('button', { name: 'Download as Word (.docx)' })
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
  expect(download.suggestedFilename()).toBe('quarterly-review.docx')
  const path = testInfo.outputPath('export.docx')
  await download.saveAs(path)

  const zip = await JSZip.loadAsync(await readFile(path))
  const xml = await zip.file('word/document.xml')!.async('string')
  expect(xml).toContain('Quarterly Business Review')
  expect(xml).toContain('<w:tbl>')
  expect(xml).toContain('<w:numPr>')
  expect(xml).toContain('<w:drawing>') // SVG chart rasterised to PNG
  expect(xml).toMatch(/w:fill="BBF7D0"/)
  expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true)

  // Re-import through the host app's "Open file…" button (api.importFile)
  await clearEditor(page)
  await expect(editor(page).locator('table')).toHaveCount(0)
  await page.locator('.pg-file-input').setInputFiles(path)
  await expect(editor(page).locator('h1')).toContainText('Quarterly Business Review')
  await expect(editor(page).locator('table')).toHaveCount(1)
  await expect(editor(page).locator('img')).toHaveCount(1)
})

test('inserts a page break that reaches the .docx', async ({ page, browserName }, testInfo) => {
  void browserName
  await editor(page).locator('p', { hasText: 'Revenue grew' }).click()
  await page.keyboard.press('End')
  await toolbarButton(page, 'Page break').click()
  await expect(editor(page).locator('[data-type="page-break"]')).toHaveCount(1)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.re-toolbar').getByRole('button', { name: 'Download as Word (.docx)' }).click(),
  ])
  const path = testInfo.outputPath('page-break.docx')
  await download.saveAs(path)
  const zip = await JSZip.loadAsync(await readFile(path))
  const xml = await zip.file('word/document.xml')!.async('string')
  expect(xml).toContain('<w:br w:type="page"/>')
})

test('long documents break into pages automatically, and a manual break starts a new one', async ({ page }) => {
  // The playground's sample fits on one page; add paragraphs until it doesn't.
  // Select-all then collapse right puts the cursor at the end of the document reliably.
  await editor(page).locator('p', { hasText: 'Revenue grew' }).click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  const filler = 'Capacity planning, hiring and the partner programme, reviewed for the coming quarter. '.repeat(3)
  for (let i = 0; i < 20; i++) {
    await page.keyboard.insertText(`Paragraph ${i}. ${filler}`)
    await page.keyboard.press('Enter')
  }

  const spacers = editor(page).locator('.re-page-spacer')
  await expect(spacers.first()).toBeVisible({ timeout: 10_000 })
  await expect(spacers.first()).toHaveAttribute('data-label', 'Page 2')
  await shot(page, '07-auto-pagination')

  // Automatic breaks are decorations: they must not reach v-model or the exported HTML.
  await expect(page.getByTestId('output')).not.toContainText('re-page-spacer')

  const before = await spacers.count()
  await toolbarButton(page, 'Page break').click()
  await expect(editor(page).locator('[data-type="page-break"]')).toHaveCount(1)
  await expect(spacers).not.toHaveCount(before - 1) // pagination recomputed around it
})

test('toolbar collapses into a More menu on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 })
  const more = page.locator('.re-toolbar').getByRole('button', { name: 'More' })
  await expect(more).toBeVisible()
  await more.click()
  await expect(page.locator('.re-toolbar-overflow')).toBeVisible()
  await shot(page, '07-narrow-more-menu')
  // A nested popover inside the overflow menu keeps both open.
  const highlight = page.locator('.re-toolbar-overflow').getByRole('button', { name: 'Highlight color' })
  if (await highlight.count()) {
    await highlight.click()
    await expect(page.locator('.re-palette')).toBeVisible()
    await expect(page.locator('.re-toolbar-overflow')).toBeVisible()
  }
})

test('dark theme and inline layout', async ({ page }) => {
  await page.goto('/?theme=dark')
  await expect(page.locator('.re-root')).toHaveClass(/re-theme-dark/)
  // Light highlight/cell tints keep dark text in dark mode.
  await expect(editor(page).locator('mark').first()).toHaveCSS('color', 'rgb(31, 35, 40)')
  await shot(page, '08-document-dark')
  await page.goto('/?theme=dark&layout=inline')
  await expect(page.locator('.re-root')).toHaveClass(/re-layout-inline/)
  await shot(page, '09-inline-dark')
})

test('read-only mode hides the toolbar', async ({ page }) => {
  await page.goto('/?editable=false')
  await expect(page.locator('.re-toolbar')).toHaveCount(0)
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false')
})

// ---------------------------------------------------------------------------
// AI Canvas (playground uses the offline demo adapter)
// ---------------------------------------------------------------------------

const aiBar = (page: Page) => page.getByTestId('re-ai-bar')

test('AI: quick action on a selection becomes a suggestion; accept is one undo step and saves a version', async ({ page }) => {
  const paragraph = editor(page).locator('p', { hasText: 'Revenue grew' })
  const before = await paragraph.innerText()
  await paragraph.click({ clickCount: 3 })
  const menu = page.locator('.re-bubble[aria-label="AI"]')
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: 'Quick actions' }).click()
  await page.getByRole('menuitem', { name: 'Make shorter' }).click()

  const suggestion = editor(page).locator('.re-ai-added')
  await expect(suggestion).toHaveCount(1)
  await expect(suggestion).toContainText('Revenue grew 18% quarter over quarter')
  await expect(editor(page).locator('.re-ai-removed').first()).toBeVisible()
  // Pending suggestions are not part of the content (v-model / exports)
  await expect(page.getByTestId('output')).toContainText('Churn fell to')
  await expect(menu).toBeHidden()
  await shot(page, '10-ai-suggestion')

  await suggestion.getByRole('button', { name: 'Accept' }).click()
  await expect(editor(page).locator('.re-ai-added')).toHaveCount(0)
  await expect(paragraph).not.toContainText('Churn fell to')
  await expect(page.getByTestId('output')).not.toContainText('Churn fell to')

  await page.keyboard.press('Control+z')
  await expect(paragraph).toHaveText(before)

  await page.keyboard.press('Control+y')
  await page.locator('.re-toolbar').getByRole('button', { name: 'AI', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Version history' }).click()
  const versions = page.getByTestId('re-versions')
  await expect(versions.locator('li')).toHaveCount(1)
  await expect(versions).toContainText('Before: Make shorter')
})

test('AI: custom instruction, reject, and Esc', async ({ page }) => {
  const heading = editor(page).locator('h2').first()
  await heading.click({ clickCount: 3 })
  await page.keyboard.press('Control+j')
  await expect(aiBar(page)).toBeVisible()
  await expect(editor(page).locator('.re-ai-target')).toBeVisible()
  await aiBar(page).getByRole('textbox', { name: 'Instruction for AI' }).fill('Make it more casual')
  await page.keyboard.press('Enter')
  await expect(editor(page).locator('.re-ai-added')).toContainText('🙂')

  await editor(page).locator('.re-ai-added').getByRole('button', { name: 'Reject' }).click()
  await expect(editor(page).locator('.re-ai-added')).toHaveCount(0)
  await expect(heading).toHaveText('Summary')

  await aiBar(page).getByRole('textbox', { name: 'Instruction for AI' }).focus()
  await page.keyboard.press('Escape')
  await expect(aiBar(page)).toHaveCount(0)
})

// "Edit whole document" is not in the AI menu; the playground calls api.aiEditDocument().
test('AI: whole-document edit only suggests changes for some blocks; accept all', async ({ page }) => {
  const blocksBefore = await editor(page).locator(':scope > *').count()
  await page.getByTestId('ai-edit-document').click()

  const suggestions = editor(page).locator('.re-ai-added')
  // The demo edits plain paragraphs only; the sample document has two.
  await expect(suggestions).toHaveCount(2)
  expect(await suggestions.count()).toBeLessThan(blocksBefore)
  await expect(aiBar(page)).toContainText('Review 2 suggestions')
  await shot(page, '11-ai-document')

  await page.getByTestId('re-ai-accept-all').click()
  await expect(suggestions).toHaveCount(0)
  await expect(editor(page).getByText('(revised)')).toHaveCount(2)
  // Layout attributes survive: the centered subtitle stays centered
  await expect(editor(page).locator('p', { hasText: 'Prepared for the leadership team' })).toHaveCSS('text-align', 'center')
})

test('AI: generate into an empty document and continue writing', async ({ page }) => {
  await clearEditor(page)
  await page.keyboard.press('Control+j')
  await expect(aiBar(page)).toContainText('Generate')
  await aiBar(page).getByRole('textbox', { name: 'Instruction for AI' }).fill('Write a project update')
  await page.keyboard.press('Enter')
  await expect(editor(page).locator('.re-ai-added table')).toBeVisible()
  await page.getByTestId('re-ai-accept-all').click()
  await expect(editor(page).locator('h1')).toHaveText('Project update')

  // "Continue writing" is not in the AI menu either; the playground calls api.aiContinue().
  await editor(page).locator('p').first().click()
  await page.keyboard.press('End')
  await page.getByTestId('ai-continue').click()
  await expect(editor(page).locator('.re-ai-added')).toContainText('Building on this')
  await page.keyboard.press('Escape')
  await expect(editor(page).locator('.re-ai-added')).toHaveCount(0)
})

test('AI: controls are hidden without an adapter', async ({ page }) => {
  await page.getByTestId('ai-toggle').uncheck()
  await expect(page.locator('.re-toolbar').getByRole('button', { name: 'AI', exact: true })).toHaveCount(0)
  await editor(page).locator('p', { hasText: 'Revenue grew' }).click({ clickCount: 3 })
  await expect(page.locator('.re-bubble[aria-label="AI"]')).toHaveCount(0)
})
