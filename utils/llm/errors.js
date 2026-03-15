import { t } from '../i18n.js';
import {
  LLM_CONFIG_ERROR_CODE,
  LLM_DAILY_LIMIT_ERROR_CODE,
  LLM_RATE_LIMIT_ERROR_CODE
} from './constants.js';
import { providerDisplayName } from './shared.js';

export function createLlmConfigError(message) {
  const err = new Error(message);
  err.code = LLM_CONFIG_ERROR_CODE;
  return err;
}

export function buildMissingConfigMessage(provider, missingField) {
  const name = providerDisplayName(provider);
  if (missingField === 'apiKey') {
    return t('errorApiKeyRequired', { provider: name }) ||
      `AI provider "${name}" is not configured. Please set API Key in Settings.`;
  }
  if (missingField === 'model') {
    return t('errorModelIdRequired', { provider: name }) ||
      `AI provider "${name}" is not configured. Please set Model / Endpoint ID in Settings.`;
  }
  return t('errorModelNotConfigured') ||
    'AI model is not configured. Please complete settings before sending requests.';
}

export function buildProviderRateLimitMessage(provider, lang, retryAfterMs = 0) {
  const name = providerDisplayName(provider);
  const retryAfterSeconds = retryAfterMs > 0 ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : 0;

  if ((lang || '').startsWith('zh')) {
    if (retryAfterSeconds > 0) {
      return `${name} 请求过于频繁，请约 ${retryAfterSeconds} 秒后重试。`;
    }
    return `${name} 请求过于频繁，请稍后重试。`;
  }

  if (retryAfterSeconds > 0) {
    return `${name} rate limit reached. Please retry in about ${retryAfterSeconds} seconds.`;
  }
  return `${name} rate limit reached. Please try again later.`;
}

export function createProviderRateLimitError(provider, lang, originalError) {
  const err = new Error(
    buildProviderRateLimitMessage(provider, lang, originalError?.retryAfterMs || 0)
  );
  err.code = LLM_RATE_LIMIT_ERROR_CODE;
  err.provider = provider;
  err.status = 429;
  err.retryAfterMs = originalError?.retryAfterMs || 0;
  err.cause = originalError;
  return err;
}

export function buildDailyLimitMessage(lang, limit) {
  const localized = t('dailyLimitReached', { limit: String(limit) });
  if (localized && localized !== 'dailyLimitReached') {
    return localized;
  }
  if ((lang || '').startsWith('zh')) {
    return `今日 AI 请求已达上限（${limit}），请明天再试。`;
  }
  return `Daily AI request limit reached (${limit}). Please try again tomorrow.`;
}

export function createDailyLimitError(lang, limit, used) {
  const err = new Error(buildDailyLimitMessage(lang, limit));
  err.code = LLM_DAILY_LIMIT_ERROR_CODE;
  err.limit = limit;
  err.used = used;
  return err;
}

export function isLLMDailyLimitError(err) {
  return err?.code === LLM_DAILY_LIMIT_ERROR_CODE;
}

export function isLLMRateLimitError(err) {
  return err?.code === LLM_RATE_LIMIT_ERROR_CODE;
}
