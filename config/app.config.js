export const APP_CONFIG = Object.freeze({
  llm: Object.freeze({
    dailyRequestLimit: 100,
    officialProxy: 'https://youlainote.cloud'
  })
});

export const DAILY_REQUEST_LIMIT = APP_CONFIG.llm.dailyRequestLimit;
export const OFFICIAL_PROXY = APP_CONFIG.llm.officialProxy;
