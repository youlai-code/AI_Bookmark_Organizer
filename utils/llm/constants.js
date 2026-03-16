import {
  DAILY_REQUEST_LIMIT as CONFIG_DAILY_REQUEST_LIMIT,
  OFFICIAL_PROXY as CONFIG_OFFICIAL_PROXY
} from '../../config/app.config.js';

export const OFFICIAL_PROXY = CONFIG_OFFICIAL_PROXY;
export const DEFAULT_TIMEOUT = 20000;
export const MAX_RETRIES = 1;
export const RETRY_DELAY = 1000;

export const LLM_CONFIG_ERROR_CODE = 'MODEL_NOT_CONFIGURED';
export const LLM_DAILY_LIMIT_ERROR_CODE = 'DAILY_LIMIT_REACHED';
export const LLM_RATE_LIMIT_ERROR_CODE = 'PROVIDER_RATE_LIMITED';

export const DAILY_REQUEST_LIMIT = CONFIG_DAILY_REQUEST_LIMIT;
export const DAILY_USAGE_STORAGE_KEY = 'llmDailyUsage';
export const LLM_USAGE_LOGS_STORAGE_KEY = 'llmUsageLogs';

export const MIN_RENAME_LENGTH = 4;
export const MAX_RENAME_LENGTH = 20;
export const DEFAULT_RENAME_LENGTH = 12;
export const NON_CJK_MULTIPLIER = 2;
export const NON_CJK_MAX_CAP = 60;
export const MAX_LLM_USAGE_LOGS = 300;

export const RETRYABLE_HTTP_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export const PROVIDER_REQUEST_POLICIES = {
  zhipu: {
    concurrency: 1,
    minIntervalMs: 1500,
    retries: 3,
    retryDelayMs: 2500
  }
};

export const PROVIDERS_REQUIRING_API_KEY = new Set([
  'deepseek',
  'chatgpt',
  'gemini',
  'zhipu',
  'doubao'
]);
