/**
 * AI Canvas types. This module is pure TypeScript (no DOM, no Vue) so it can be
 * shared with a Node backend through the `@local/rich-editor/ai` entry.
 */

export type AiTask = 'generate' | 'edit-selection' | 'continue' | 'edit-document' | 'chat'

/**
 * `markdown`: the model returns content. `block-patch`: JSON edits for changed blocks only.
 * `chat`: a Markdown answer citing blocks as [b3], optionally followed by a fenced `edits` block (a block patch).
 */
export type AiResponseFormat = 'markdown' | 'block-patch' | 'chat'

/** One turn of a document chat. */
export interface AiChatMessage {
  role: 'user' | 'assistant'
  /** Markdown. Assistant answers may cite blocks as [b3]. */
  content: string
}

/** A top-level block of the document, as sent for whole-document edits. */
export interface AiBlock {
  id: string
  markdown: string
}

/** Ready-to-send prompt, built by `buildPrompt()`. */
export interface AiPrompt {
  system: string
  user: string
  /** Earlier turns for multi-turn tasks (`chat`), oldest first. Send them before `user`. */
  history?: AiChatMessage[]
}

/** What the editor sends to your adapter (and your adapter to your backend). */
export interface AiRequest {
  task: AiTask
  /** The user's instruction or quick-action instruction. May be empty for `continue`. */
  instruction: string
  responseFormat: AiResponseFormat
  /** Markdown of the selected passage (`edit-selection`). */
  selection?: string
  /** Surrounding text, trimmed to a limited size. */
  context?: {
    before?: string
    after?: string
    /** Document title, when the host provides `documentName`. */
    title?: string
  }
  /** Top-level blocks with ids (`edit-document`, `chat`). */
  blocks?: AiBlock[]
  /** Earlier chat turns (`chat`), oldest first. The current question is `instruction`. */
  messages?: AiChatMessage[]
  /** `chat`: true when only part of a long document is included in `blocks`. */
  partial?: boolean
  /**
   * The prompt the editor built for this request. Convenient for quick setups; in
   * production, rebuild it on the server with `buildPrompt(request)` so users can't
   * turn your endpoint into a general-purpose model proxy.
   */
  prompt: AiPrompt
}

export interface AiAdapterOptions {
  /** Aborted when the user presses Stop, closes the AI bar or starts another request. */
  signal: AbortSignal
  /** Call with each streamed text chunk (a delta, not the accumulated text). Optional. */
  onChunk: (delta: string) => void
}

/**
 * Connects the editor to your backend. Return the model's complete text output.
 * Streaming is optional: call `onChunk` as text arrives to show live progress.
 */
export interface AiAdapter {
  complete(request: AiRequest, options: AiAdapterOptions): Promise<string>
}

/** A one-click action offered for a selection. */
export interface AiQuickAction {
  id: string
  label: string
  /** Instruction sent to the model. */
  instruction: string
  /** Put the instruction in the input for the user to complete instead of sending it (e.g. "Translate to "). */
  prefill?: boolean
}

/** Block-patch response (for `edit-document`). */
export interface AiBlockPatch {
  edits: Array<
    | { id: string; markdown: string }
    | { id: string; delete: true }
    | { after: string; markdown: string }
  >
}
