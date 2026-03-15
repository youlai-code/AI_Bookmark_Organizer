import {
  LLM_USAGE_LOGS_STORAGE_KEY,
  MAX_LLM_USAGE_LOGS
} from './constants.js';
import { resolveProviderModel } from './shared.js';

export function extractUsageMetrics(provider, data) {
  if (!data || typeof data !== 'object') return null;

  if (provider === 'gemini' && data.usageMetadata) {
    const usage = data.usageMetadata;
    return {
      promptTokens: usage.promptTokenCount ?? null,
      completionTokens: usage.candidatesTokenCount ?? null,
      totalTokens: usage.totalTokenCount ?? null,
      thoughtsTokens: usage.thoughtsTokenCount ?? null,
      raw: usage
    };
  }

  if (provider === 'ollama') {
    const promptTokens = data.prompt_eval_count ?? null;
    const completionTokens = data.eval_count ?? null;
    const totalTokens =
      Number.isFinite(promptTokens) && Number.isFinite(completionTokens)
        ? promptTokens + completionTokens
        : null;

    if (promptTokens == null && completionTokens == null && totalTokens == null) {
      return null;
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      raw: {
        prompt_eval_count: data.prompt_eval_count,
        eval_count: data.eval_count,
        total_duration: data.total_duration,
        load_duration: data.load_duration,
        prompt_eval_duration: data.prompt_eval_duration,
        eval_duration: data.eval_duration
      }
    };
  }

  if (data.usage && typeof data.usage === 'object') {
    const usage = data.usage;
    return {
      promptTokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
      completionTokens: usage.completion_tokens ?? usage.output_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      reasoningTokens:
        usage.completion_tokens_details?.reasoning_tokens ??
        usage.output_tokens_details?.reasoning_tokens ??
        null,
      cachedTokens:
        usage.prompt_tokens_details?.cached_tokens ??
        usage.input_tokens_details?.cached_tokens ??
        null,
      raw: usage
    };
  }

  return null;
}

export function logUsageMetrics(provider, model, data) {
  const usage = extractUsageMetrics(provider, data);
  if (!usage) return;

  console.info('[LLM Usage]', {
    provider,
    model: model || resolveProviderModel(provider, ''),
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    reasoningTokens: usage.reasoningTokens ?? usage.thoughtsTokens ?? null,
    cachedTokens: usage.cachedTokens ?? null,
    usage: usage.raw
  });
}

export async function appendUsageLogEntry(provider, model, data) {
  const usage = extractUsageMetrics(provider, data);
  if (!usage) return;

  const { [LLM_USAGE_LOGS_STORAGE_KEY]: usageLogs = [] } = await chrome.storage.local.get({
    [LLM_USAGE_LOGS_STORAGE_KEY]: []
  });

  const nextLogs = Array.isArray(usageLogs) ? usageLogs.slice(0, MAX_LLM_USAGE_LOGS - 1) : [];
  nextLogs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    provider,
    model: model || resolveProviderModel(provider, ''),
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    reasoningTokens: usage.reasoningTokens ?? usage.thoughtsTokens ?? null,
    cachedTokens: usage.cachedTokens ?? null,
    usage: usage.raw
  });

  await chrome.storage.local.set({
    [LLM_USAGE_LOGS_STORAGE_KEY]: nextLogs
  });
}

export async function getLlmUsageLogs() {
  const { [LLM_USAGE_LOGS_STORAGE_KEY]: usageLogs = [] } = await chrome.storage.local.get({
    [LLM_USAGE_LOGS_STORAGE_KEY]: []
  });
  return Array.isArray(usageLogs) ? usageLogs : [];
}

export async function clearLlmUsageLogs() {
  await chrome.storage.local.set({
    [LLM_USAGE_LOGS_STORAGE_KEY]: []
  });
}
