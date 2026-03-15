import { t } from '../i18n.js';
import { log, warn } from '../logger.js';
import {
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  PROVIDER_REQUEST_POLICIES,
  RETRYABLE_HTTP_STATUS,
  RETRY_DELAY
} from './constants.js';
import { appendUsageLogEntry, logUsageMetrics } from './usage_logs.js';

const providerRequestStates = new Map();

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = DEFAULT_TIMEOUT } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(t('errorTimeout') || 'Request timed out');
    }
    throw err;
  }
}

function parseRetryAfterMilliseconds(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 0;

  const seconds = Number.parseFloat(normalized);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const dateValue = Date.parse(normalized);
  if (Number.isNaN(dateValue)) return 0;
  return Math.max(0, dateValue - Date.now());
}

async function createHttpError(response) {
  const errorText = await response.text();
  const err = new Error(`HTTP ${response.status}: ${errorText}`);
  err.status = response.status;
  err.responseText = errorText;
  err.retryAfterMs = parseRetryAfterMilliseconds(response.headers.get('Retry-After'));
  return err;
}

function isRetryableError(err) {
  if (!err) return false;
  if (typeof err.status === 'number') {
    return RETRYABLE_HTTP_STATUS.has(err.status);
  }
  return true;
}

function getRetryDelayMs(err, attempt, baseDelayMs) {
  if (err?.retryAfterMs > 0) {
    return err.retryAfterMs;
  }

  const safeBaseDelay = Math.max(baseDelayMs, 200);
  return safeBaseDelay * Math.pow(2, attempt);
}

async function fetchWithRetry(resource, options = {}, retryOptions = {}) {
  const {
    retries = MAX_RETRIES,
    retryDelayMs = RETRY_DELAY
  } = retryOptions;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) log(`Retry attempt ${attempt}/${retries}...`);
      const response = await fetchWithTimeout(resource, options);
      if (!response.ok) {
        throw await createHttpError(response);
      }
      return response;
    } catch (err) {
      lastError = err;
      warn(`Request failed (attempt ${attempt + 1}):`, err.message);
      const shouldRetry = attempt < retries && isRetryableError(err);
      if (!shouldRetry) break;
      await sleep(getRetryDelayMs(err, attempt, retryDelayMs));
    }
  }

  throw lastError;
}

function getProviderRequestPolicy(provider) {
  return {
    concurrency: Number.MAX_SAFE_INTEGER,
    minIntervalMs: 0,
    retries: MAX_RETRIES,
    retryDelayMs: RETRY_DELAY,
    ...(PROVIDER_REQUEST_POLICIES[provider] || {})
  };
}

function getProviderRequestState(provider) {
  if (!providerRequestStates.has(provider)) {
    providerRequestStates.set(provider, {
      activeCount: 0,
      queue: [],
      timerId: null,
      lastStartedAt: 0
    });
  }
  return providerRequestStates.get(provider);
}

function processProviderRequestQueue(provider) {
  const policy = getProviderRequestPolicy(provider);
  const state = getProviderRequestState(provider);

  if (state.timerId) return;
  if (state.activeCount >= policy.concurrency) return;
  if (state.queue.length === 0) return;

  const elapsed = Date.now() - state.lastStartedAt;
  const waitMs = Math.max(policy.minIntervalMs - elapsed, 0);
  if (waitMs > 0) {
    state.timerId = setTimeout(() => {
      state.timerId = null;
      processProviderRequestQueue(provider);
    }, waitMs);
    return;
  }

  const job = state.queue.shift();
  if (!job) return;

  state.activeCount += 1;
  state.lastStartedAt = Date.now();

  Promise.resolve()
    .then(job.task)
    .then(job.resolve, job.reject)
    .finally(() => {
      state.activeCount = Math.max(0, state.activeCount - 1);
      processProviderRequestQueue(provider);
    });
}

export function runProviderRequest(provider, task) {
  const policy = getProviderRequestPolicy(provider);
  if (policy.concurrency >= Number.MAX_SAFE_INTEGER && policy.minIntervalMs <= 0) {
    return task();
  }

  return new Promise((resolve, reject) => {
    const state = getProviderRequestState(provider);
    state.queue.push({ task, resolve, reject });
    processProviderRequestQueue(provider);
  });
}

export async function postJson(url, headers, body, requestOptions = {}) {
  const { provider = 'default', model = '' } = requestOptions;
  const retryPolicy = getProviderRequestPolicy(provider);

  log(`[POST] ${url}`);
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, {
    retries: retryPolicy.retries,
    retryDelayMs: retryPolicy.retryDelayMs
  });

  const data = await response.json();
  logUsageMetrics(provider, model, data);
  await appendUsageLogEntry(provider, model, data);
  return data;
}
