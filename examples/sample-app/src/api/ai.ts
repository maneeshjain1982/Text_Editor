import { createHttpAiAdapter } from '@local/rich-editor'

/**
 * AI Canvas adapter. Requests go to this app's own /api/ai endpoint, which Vite proxies to
 * the Gemini server in examples/ai-server (in production: your reverse proxy or API gateway).
 * The Gemini API key lives only on that server.
 */
export const aiAdapter = createHttpAiAdapter({
  url: '/api/ai/complete',
  // Add your dashboard's auth here, e.g. headers: () => ({ Authorization: `Bearer ${auth.token}` }),
})
