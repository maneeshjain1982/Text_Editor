import type { AiServerConfig } from '../config-types.ts'
import { createGeminiProvider } from './gemini.ts'
import { createOpenAiProvider } from './openai.ts'
import type { AiProvider } from './types.ts'

export { UserFacingError, settingsFor, type AiProvider, type StreamResult } from './types.ts'

/** Build the provider named by `config.provider`. Throws if its API key is missing. */
export function createProvider(config: AiServerConfig): AiProvider {
  switch (config.provider) {
    case 'gemini':
      return createGeminiProvider(config)
    case 'openai':
      return createOpenAiProvider(config, config.openai, 'openai')
    case 'gauss':
      return createOpenAiProvider(config, config.gauss, 'gauss')
    default: {
      const name: never = config.provider
      throw new Error(`Unknown provider "${name}". Use 'gemini', 'openai' or 'gauss' in ai.config.ts.`)
    }
  }
}
