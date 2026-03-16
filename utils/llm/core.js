import { t } from '../i18n.js';
import { log, error } from '../logger.js';
import { ensureLLMConfiguration } from './config.js';
import { DEFAULT_RENAME_LENGTH } from './constants.js';
import { createProviderRateLimitError } from './errors.js';
import { parseResponse, parseBatchResponse } from './parsing.js';
import { generatePrompt, generateBatchClassifyPrompt, generateBatchRenamePrompt, normalizeRenameLength, MAX_BATCH_SIZE } from './prompt.js';
import { executeProviderRequest } from './providers/index.js';
import { consumeDailyRequestQuota, shouldConsumeDailyQuota } from './quota.js';
import { normalizeProvider, providerDisplayName, resolveProviderModel } from './shared.js';

async function requestWithProvider(provider, prompt, config) {
  try {
    return await executeProviderRequest(provider, prompt, config);
  } catch (err) {
    if (err?.status === 429) {
      throw createProviderRateLimitError(provider, config.language || 'zh_CN', err);
    }
    throw err;
  }
}

function normalizeTestConnectionError(provider, err) {
  if (provider !== 'default') return err;

  const message = String(err?.message || '');
  const isGovernorAuthError = err?.status === 401 && /authentication fails|governor/i.test(message);
  if (!isGovernorAuthError) return err;

  return new Error(
    t('defaultConnectionTestUnsupported') ||
      'The default free channel may not support direct connection testing right now. '
      + 'Try saving settings and verify with an actual smart bookmark action.'
  );
}

export async function testLLMConnection(configInput = null) {
  const config = await ensureLLMConfiguration(configInput);
  const provider = normalizeProvider(config.llmProvider);
  const lang = config.language || 'zh_CN';
  const prompt = (lang || '').startsWith('zh') ? '请仅回复 OK' : 'Reply with OK only';

  let responseText;
  try {
    responseText = await requestWithProvider(provider, prompt, config);
  } catch (err) {
    throw normalizeTestConnectionError(provider, err);
  }
  const normalizedResponse = String(responseText || '').trim();
  if (!normalizedResponse) {
    throw new Error(t('unknownError') || 'Empty response from model');
  }

  return {
    provider,
    providerName: providerDisplayName(provider),
    model: resolveProviderModel(provider, config.model),
    responseText: normalizedResponse
  };
}

export async function classifyWithLLM(
  title,
  url,
  content,
  existingFolders = [],
  allowNewFolders = true,
  enableRename = false,
  maxRenameLength = DEFAULT_RENAME_LENGTH
) {
  const config = await ensureLLMConfiguration();
  const provider = normalizeProvider(config.llmProvider);
  const lang = config.language || 'zh_CN';
  const finalMaxLength = normalizeRenameLength(maxRenameLength);

  if (shouldConsumeDailyQuota(provider)) {
    await consumeDailyRequestQuota(lang);
  }

  const prompt = generatePrompt(
    lang,
    title,
    url,
    content,
    existingFolders,
    allowNewFolders,
    enableRename,
    finalMaxLength
  );
  log('[LLM] Prompt generated for:', provider);

  let resultText;
  try {
    resultText = await requestWithProvider(provider, prompt, config);
  } catch (err) {
    error('[LLM] Provider call failed:', err);
    throw err;
  }

  log('[LLM] Raw Response:', resultText);
  return parseResponse(resultText, title, enableRename);
}

export async function classifyBatchWithLLM(
  bookmarks,
  existingFolders = [],
  folderCreationLevel = 'medium',
  enableRename = false,
  maxRenameLength = DEFAULT_RENAME_LENGTH
) {
  if (!bookmarks || bookmarks.length === 0) {
    return new Map();
  }

  const config = await ensureLLMConfiguration();
  const provider = normalizeProvider(config.llmProvider);
  const lang = config.language || 'zh_CN';
  const finalMaxLength = normalizeRenameLength(maxRenameLength);

  if (shouldConsumeDailyQuota(provider)) {
    await consumeDailyRequestQuota(lang, undefined, bookmarks.length);
  }

  const prompt = generateBatchClassifyPrompt(
    lang,
    bookmarks,
    existingFolders,
    folderCreationLevel,
    enableRename,
    finalMaxLength
  );
  log('[LLM] Batch prompt generated for:', provider, 'batch size:', bookmarks.length);

  let resultText;
  try {
    resultText = await requestWithProvider(provider, prompt, config);
  } catch (err) {
    error('[LLM] Batch provider call failed:', err);
    throw err;
  }

  log('[LLM] Batch Raw Response:', resultText);
  return parseBatchResponse(resultText, bookmarks, enableRename);
}

export async function renameBatchWithLLM(
  bookmarks,
  maxRenameLength = DEFAULT_RENAME_LENGTH
) {
  if (!bookmarks || bookmarks.length === 0) {
    return new Map();
  }

  const config = await ensureLLMConfiguration();
  const provider = normalizeProvider(config.llmProvider);
  const lang = config.language || 'zh_CN';
  const finalMaxLength = normalizeRenameLength(maxRenameLength);

  if (shouldConsumeDailyQuota(provider)) {
    await consumeDailyRequestQuota(lang, undefined, bookmarks.length);
  }

  const prompt = generateBatchRenamePrompt(lang, bookmarks, finalMaxLength);
  log('[LLM] Batch rename prompt generated for:', provider, 'batch size:', bookmarks.length);

  let resultText;
  try {
    resultText = await requestWithProvider(provider, prompt, config);
  } catch (err) {
    error('[LLM] Batch rename provider call failed:', err);
    throw err;
  }

  log('[LLM] Batch Rename Raw Response:', resultText);
  return parseBatchResponse(resultText, bookmarks, true);
}

export { MAX_BATCH_SIZE };
