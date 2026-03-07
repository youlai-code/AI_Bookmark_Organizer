export const APP_CONFIG = Object.freeze({
  llm: Object.freeze({
    dailyRequestLimit: 100
  })
});

export const DAILY_REQUEST_LIMIT = APP_CONFIG.llm.dailyRequestLimit;
