import { expect, test, type Page } from '@playwright/test'

// Chat with the document. The playground uses the offline demo adapter.

const SHOTS = process.env.SHOTS_DIR
const editor = (page: Page) => page.locator('.re-content')
const toolbarButton = (page: Page, name: string) => page.locator('.re-toolbar').getByRole('button', { name, exact: true })
const chatPanel = (page: Page) => page.getByTestId('re-chat')
const chatInput = (page: Page) => chatPanel(page).getByRole('textbox', { name: 'Question about the document' })

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

test('a starter question gets a cited answer; a source link highlights the block', async ({ page }) => {
  await toolbarButton(page, 'Chat with document').click()
  await expect(chatPanel(page)).toBeVisible()
  await chatPanel(page).getByRole('button', { name: 'List the action items' }).click()

  const answer = chatPanel(page).locator('.re-chat-assistant').last()
  await expect(answer).toContainText('Hire two regional managers')
  await expect(answer.locator('.re-chat-cite').first()).toBeVisible()
  const sources = answer.locator('.re-chat-sources button')
  await expect(sources.first()).toContainText('Expand the partner programme')
  await expect(sources.nth(1)).not.toContainText('x Board') // task-list markers stripped from labels

  await sources.first().click()
  await expect(editor(page).locator('ol.re-ai-flash')).toContainText('Expand the partner programme')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12-chat-answer.png` })
})

test('asking for a change creates a suggestion that the message can accept', async ({ page }) => {
  await toolbarButton(page, 'Chat with document').click()
  await chatInput(page).fill('Make the opening more formal')
  await chatInput(page).press('Enter')

  const changes = chatPanel(page).locator('.re-chat-changes')
  await expect(changes).toContainText('1 suggested change in the document')
  await expect(editor(page).locator('.re-ai-added')).toHaveCount(1)
  await expect(page.getByTestId('output')).not.toContainText('(revised)') // not applied yet

  await changes.getByRole('button', { name: 'Accept' }).click()
  await expect(changes).toHaveCount(0)
  await expect(editor(page).locator('.re-ai-added')).toHaveCount(0)
  await expect(page.getByTestId('output')).toContainText('(revised)')
})

test('follow-up keeps context; insert an answer; clear and close', async ({ page }) => {
  await editor(page).locator('p', { hasText: 'Revenue grew' }).click()
  await page.keyboard.press('Control+Alt+j')
  await expect(chatPanel(page)).toBeVisible()

  await chatInput(page).fill('Summarize this document')
  await chatInput(page).press('Enter')
  const answers = chatPanel(page).locator('.re-chat-assistant')
  await expect(answers).toHaveCount(1)
  await expect(answers.first()).toContainText('Summary:')
  // Wait for the answer to finish: a new question can't be sent while one is streaming.
  await expect(answers.first().getByRole('button', { name: 'Copy' })).toBeVisible()

  await chatInput(page).fill('What does it say about churn?')
  await chatInput(page).press('Enter')
  await expect(answers).toHaveCount(2)
  await expect(answers.last()).toContainText('Churn fell to 2.1%')

  // Insert the first answer into the document, as a suggestion without citation markers
  await answers.first().getByRole('button', { name: 'Insert in document' }).click()
  const inserted = editor(page).locator('.re-ai-added')
  await expect(inserted).toContainText('Summary:')
  await expect(inserted).not.toContainText('[b')
  await inserted.getByRole('button', { name: 'Reject' }).click()
  await expect(inserted).toHaveCount(0)

  await chatPanel(page).getByRole('button', { name: 'Clear chat' }).click()
  await expect(chatPanel(page).locator('.re-chat-message')).toHaveCount(0)
  await expect(chatPanel(page)).toContainText('Ask anything about this document')
  await chatInput(page).press('Escape')
  await expect(chatPanel(page)).toHaveCount(0)
})

test('selected text is attached to the question', async ({ page }) => {
  await editor(page).locator('p', { hasText: 'Revenue grew' }).click({ clickCount: 3 })
  await toolbarButton(page, 'Chat with document').click()
  await expect(chatPanel(page).locator('.re-chat-attached')).toContainText('Revenue grew 18%')
  await chatInput(page).fill('Is this accurate?')
  await chatInput(page).press('Enter')
  await expect(chatPanel(page).locator('.re-chat-quote')).toContainText('Revenue grew 18%')
  await expect(chatPanel(page).locator('.re-chat-attached')).toHaveCount(0)
  await expect(chatPanel(page).locator('.re-chat-assistant')).toContainText('About the selected text: "Revenue grew 18%')
})
