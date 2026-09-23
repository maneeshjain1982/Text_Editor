/**
 * Reference backend for the Rich Editor AI Canvas. The provider (Gemini, ChatGPT/OpenAI
 * or Samsung Gauss) is chosen in ai.config.ts.
 *
 *   POST {basePath}/complete  body: AiRequest (JSON)  →  NDJSON stream:
 *        {"type":"chunk","text":"…"}  …  {"type":"done"}   or   {"type":"error","message":"…"}
 *   GET  {basePath}/health    →  {"ok":true,"model":"…","mock":false}
 *
 * Run: `npm start` (uses .env) or `npm run mock` (no provider calls; deterministic demo output).
 * Requires Node 22.18+ (runs TypeScript directly).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { buildPrompt, createDemoAiAdapter, type AiRequest, type AiTask } from '@local/rich-editor/ai'
import config from './ai.config.ts'
import { createProvider, UserFacingError } from './providers/index.ts'

const MOCK = process.argv.includes('--mock') || process.env.AI_MOCK === '1'
const PORT = Number(process.env.PORT) || config.server.port
const TASKS = new Set<AiTask>(['generate', 'edit-selection', 'continue', 'edit-document', 'chat'])

const provider = MOCK ? null : createProvider(config)
const demo = createDemoAiAdapter({ delayMs: 10 })

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  applyCors(req, res)
  if (req.method === 'OPTIONS') return end(res, 204)

  if (req.method === 'GET' && url.pathname === `${config.server.basePath}/health`) {
    return json(res, 200, { ok: true, mock: MOCK, provider: config.provider, model: MOCK ? 'mock' : provider!.modelFor('generate') })
  }
  if (req.method !== 'POST' || url.pathname !== `${config.server.basePath}/complete`) {
    return json(res, 404, { error: 'Not found' })
  }

  if (!authorize(req)) return json(res, 401, { error: 'Unauthorized' })
  if (!rateLimit(clientIp(req))) return json(res, 429, { error: 'Too many AI requests. Try again in a minute.' })

  let request: AiRequest
  try {
    request = validate(JSON.parse(await readBody(req, config.limits.maxRequestBytes)))
  } catch (error) {
    const status = error instanceof UserFacingError ? error.status : 400
    return json(res, status, { error: error instanceof Error ? error.message : 'Invalid request' })
  }

  // Build the prompt on the server unless configured to trust the client's.
  const prompt = config.trustClientPrompt && request.prompt?.system ? request.prompt : buildPrompt(request, config.systemInstructionSuffix)

  // Cancel the model call when the user presses Stop (the browser closes the connection).
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) abort.abort()
  })
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(config.limits.timeoutMs)])

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  const send = (event: Record<string, unknown>) => res.write(`${JSON.stringify(event)}\n`)

  const started = Date.now()
  try {
    const stats = MOCK
      ? await mockCompletion(request, signal, (text) => send({ type: 'chunk', text }))
      : await provider!.stream(request.task, prompt, signal, (text) => send({ type: 'chunk', text }))
    send({ type: 'done' })
    log(request, { ...stats, ms: Date.now() - started })
    if (config.logging.content) console.log('[ai] prompt:', prompt, '\n[ai] instruction:', request.instruction)
  } catch (error) {
    if (abort.signal.aborted) {
      log(request, { model: MOCK ? 'mock' : provider!.modelFor(request.task), cancelled: true, ms: Date.now() - started })
    } else {
      const timedOut = signal.aborted
      const message = timedOut
        ? 'The AI took too long to respond. Try a smaller selection.'
        : error instanceof UserFacingError
          ? error.message
          : 'The AI request failed.'
      console.error('[ai] error:', error)
      send({ type: 'error', message })
    }
  } finally {
    res.end()
  }
})

async function mockCompletion(request: AiRequest, signal: AbortSignal, onText: (text: string) => void) {
  const output = await demo.complete(request, { signal, onChunk: onText })
  return { model: 'mock', outputChars: output.length }
}

// ---------------------------------------------------------------------------
// Validation, auth, limits
// ---------------------------------------------------------------------------

function validate(body: unknown): AiRequest {
  const r = body as Partial<AiRequest>
  const bad = (message: string) => new UserFacingError(message, 400)
  if (!r || typeof r !== 'object') throw bad('Invalid request body')
  if (!TASKS.has(r.task as AiTask)) throw bad('Unknown task')
  if (typeof r.instruction !== 'string') throw bad('Missing instruction')
  if (r.instruction.length > config.limits.maxInstructionChars) throw bad('Instruction is too long')
  if (r.task !== 'continue' && !r.instruction.trim()) throw bad('Instruction is empty')
  if (r.selection !== undefined && typeof r.selection !== 'string') throw bad('Invalid selection')
  if (r.task === 'edit-selection' && !r.selection?.trim()) throw bad('Nothing selected')
  if (r.blocks !== undefined) {
    if (!Array.isArray(r.blocks) || r.blocks.length > config.limits.maxBlocks) throw bad('Too many blocks')
    if (!r.blocks.every((b) => b && typeof b.id === 'string' && typeof b.markdown === 'string')) throw bad('Invalid blocks')
  }
  if (r.messages !== undefined) {
    if (!Array.isArray(r.messages) || r.messages.length > config.limits.maxChatTurns * 2) throw bad('Too many chat messages')
    if (!r.messages.every((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')) throw bad('Invalid chat messages')
  }
  const context = r.context && typeof r.context === 'object' ? r.context : {}
  return {
    task: r.task as AiTask,
    instruction: r.instruction,
    responseFormat: r.task === 'edit-document' ? 'block-patch' : r.task === 'chat' ? 'chat' : 'markdown',
    selection: r.selection,
    blocks: r.blocks,
    messages: r.messages,
    partial: r.partial === true,
    context: {
      before: typeof context.before === 'string' ? context.before : undefined,
      after: typeof context.after === 'string' ? context.after : undefined,
      title: typeof context.title === 'string' ? context.title.slice(0, 200) : undefined,
    },
    prompt: r.prompt ?? { system: '', user: '' },
  }
}

/**
 * Access check. Replace with your dashboard's real authentication (session cookie, JWT…)
 * before exposing this server: every allowed request costs Gemini tokens.
 */
function authorize(req: IncomingMessage): boolean {
  const envName = config.auth.bearerTokenEnv
  if (!envName) return true
  const expected = process.env[envName]
  const header = req.headers.authorization ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!expected || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

const hits = new Map<string, { count: number; reset: number }>()
function rateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + config.rateLimit.windowMs })
    return true
  }
  entry.count++
  return entry.count <= config.rateLimit.maxRequests
}

const clientIp = (req: IncomingMessage) => req.socket.remoteAddress ?? 'unknown'

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  if (origin && config.server.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new UserFacingError('The document is too large for an AI request.', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function end(res: ServerResponse, status: number) {
  res.writeHead(status)
  res.end()
}

function log(request: AiRequest, stats: Record<string, unknown>) {
  if (!config.logging.requests) return
  console.log(`[ai] ${request.task} ${JSON.stringify(stats)}`)
}

server.listen(PORT, () => {
  const mode = MOCK ? 'MOCK mode (no provider calls)' : `${config.provider} · ${provider!.modelFor('generate')}`
  console.log(`[ai] Rich Editor AI server on http://localhost:${PORT}${config.server.basePath} - ${mode}`)
})
