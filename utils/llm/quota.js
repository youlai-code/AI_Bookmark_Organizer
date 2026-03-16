import {
  DAILY_REQUEST_LIMIT,
  DAILY_USAGE_STORAGE_KEY
} from './constants.js';
import { createDailyLimitError } from './errors.js';
import { normalizeProvider, providerDisplayName } from './shared.js';

function getLocalDateKey() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shouldConsumeDailyQuota(provider) {
  return provider === 'default';
}

export async function consumeDailyRequestQuota(lang, limit = DAILY_REQUEST_LIMIT, units = 1) {
  const today = getLocalDateKey();
  const data = await chrome.storage.local.get(DAILY_USAGE_STORAGE_KEY);
  const saved = data[DAILY_USAGE_STORAGE_KEY];
  const safeUnits = Math.max(1, Number(units) || 1);

  let count = 0;
  if (saved && saved.date === today) {
    count = Number(saved.count) || 0;
  }

  if (count + safeUnits > limit) {
    throw createDailyLimitError(lang, limit, count);
  }

  const nextCount = count + safeUnits;
  await chrome.storage.local.set({
    [DAILY_USAGE_STORAGE_KEY]: {
      date: today,
      count: nextCount,
      limit
    }
  });
}

export async function getDailyQuotaStatus(limit = DAILY_REQUEST_LIMIT) {
  const today = getLocalDateKey();
  const providerConfig = await chrome.storage.sync.get({ llmProvider: 'default' });
  const provider = normalizeProvider(providerConfig.llmProvider);
  const tracked = shouldConsumeDailyQuota(provider);
  const safeLimit = Math.max(limit, 1);
  const providerName = providerDisplayName(provider);

  if (!tracked) {
    return {
      date: today,
      used: 0,
      limit: safeLimit,
      remaining: safeLimit,
      tracked,
      provider,
      providerName
    };
  }

  const data = await chrome.storage.local.get(DAILY_USAGE_STORAGE_KEY);
  const saved = data[DAILY_USAGE_STORAGE_KEY];

  let used = 0;
  if (saved && saved.date === today) {
    used = Number(saved.count) || 0;
  }

  const safeUsed = Math.max(used, 0);
  const remaining = Math.max(safeLimit - safeUsed, 0);

  return {
    date: today,
    used: safeUsed,
    limit: safeLimit,
    remaining,
    tracked,
    provider,
    providerName
  };
}
