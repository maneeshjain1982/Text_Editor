import type { AiPrompt, AiTask } from '@local/rich-editor/ai'
import type { AiServerConfig, TaskSettings } from '../config-types.ts'

/** An error whose message is safe to show to the user. */
export class UserFacingError extends Error {
  readonly status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export interface StreamResult {
  model: string
  outputChars: number
  inputTokens?: number
  outputTokens?: number
}

/** What the server needs from a provider: a name, the model it will use, and a text stream. */
export interface AiProvider {
  readonly name: string
  /** Model used for a task, for logging and /health. */
  modelFor(task: AiTask): string
  stream(task: AiTask, prompt: AiPrompt, signal: AbortSignal, onText: (text: string) => void): Promise<StreamResult>
}

/** Task settings merged over the defaults, with the provider's model as the fallback. */
export function settingsFor(config: AiServerConfig, task: AiTask, providerModel: string): TaskSettings & { model: string } {
  return { ...config.defaults, model: providerModel, ...config.tasks[task] }
}
