import { LLM_CONFIG_ERROR_CODE, PROVIDERS_REQUIRING_API_KEY } from './constants.js';
import { buildMissingConfigMessage, createLlmConfigError } from './errors.js';
import { isBlank, normalizeProvider } from './shared.js';

export async function ensureLLMConfiguration(configInput = null) {
  const config = configInput || await chrome.storage.sync.get([
    'llmProvider', 'apiKey', 'model', 'ollamaHost', 'baseUrl', 'language'
  ]);
  const provider = normalizeProvider(config.llmProvider);

  if (provider === 'default' || provider === 'ollama') return config;

  if (PROVIDERS_REQUIRING_API_KEY.has(provider) && isBlank(config.apiKey)) {
    throw createLlmConfigError(buildMissingConfigMessage(provider, 'apiKey'));
  }

  if (provider === 'doubao' && isBlank(config.model)) {
    throw createLlmConfigError(buildMissingConfigMessage(provider, 'model'));
  }

  return config;
}

export function isLLMConfigError(err) {
  return err?.code === LLM_CONFIG_ERROR_CODE;
}
