import { OFFICIAL_PROXY } from './constants.js';

const OFFICIAL_PROXY_ALIASES = new Set([OFFICIAL_PROXY]);

export function normalizeProvider(provider) {
  return provider || 'default';
}

export function normalizeConfiguredBaseUrl(provider, configuredBaseUrl) {
  const value = String(configuredBaseUrl || '').trim();
  if (!value) return '';

  const normalized = value.replace(/\/+$/, '');

  if (provider !== 'default' && OFFICIAL_PROXY_ALIASES.has(normalized)) {
    return '';
  }

  return normalized;
}

export function isBlank(value) {
  return !value || !String(value).trim();
}

export function providerDisplayName(provider) {
  switch (provider) {
    case 'deepseek':
      return 'DeepSeek';
    case 'chatgpt':
      return 'ChatGPT';
    case 'gemini':
      return 'Gemini';
    case 'zhipu':
      return 'Zhipu AI';
    case 'doubao':
      return 'Doubao';
    case 'ollama':
      return 'Ollama';
    default:
      return 'Default';
  }
}

export function getProviderDefaultModel(provider) {
  switch (provider) {
    case 'default':
    case 'deepseek':
      return 'deepseek-chat';
    case 'chatgpt':
      return 'gpt-4o-mini';
    case 'gemini':
      return 'gemini-1.5-flash';
    case 'zhipu':
      return 'glm-4.7-flash';
    case 'ollama':
      return 'llama3';
    default:
      return '';
  }
}

export function resolveProviderModel(provider, configuredModel) {
  const model = String(configuredModel || '').trim();
  return model || getProviderDefaultModel(provider);
}
