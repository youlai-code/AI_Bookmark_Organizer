
let messages = null;
let currentLang = 'zh_CN';

export async function initI18n() {
  const data = await chrome.storage.sync.get('language');
  currentLang = data.language || 'zh_CN';
  await loadMessages(currentLang);
  
  // Listen for changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.language) {
      currentLang = changes.language.newValue;
      loadMessages(currentLang).then(() => {
          // Dispatch a custom event or let the caller handle UI update
          if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('i18nChanged', { detail: { lang: currentLang } }));
          }
      });
    }
  });
}

async function loadMessages(lang) {
  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    messages = await response.json();
  } catch (e) {
    console.error(`Failed to load messages for ${lang}:`, e);
    // Fallback to zh_CN
    if (lang !== 'zh_CN') {
        try {
            const url = chrome.runtime.getURL(`_locales/zh_CN/messages.json`);
            const response = await fetch(url);
            messages = await response.json();
        } catch(e2) {}
    }
  }
}

export function t(key, replacements = {}) {
  if (!messages || !messages[key]) {
      // Fallback to chrome.i18n if possible (for initial load) or key
      // But chrome.i18n uses browser locale, so it might differ.
      // Better return key or a safe default if not loaded.
      // If messages is null, try chrome.i18n as last resort
      const msg = chrome.i18n.getMessage(key);
      if (msg) return formatMessage(msg, replacements);
      return key;
  }
  
  const msgEntry = messages[key];
  let message = msgEntry.message;
  
  return formatMessage(message, replacements);
}

function formatMessage(message, replacements) {
  if (!replacements) return message;
  
  // Replace $KEY$ with value from replacements
  return message.replace(/\$([a-zA-Z0-9_]+)\$/g, (match, placeholderName) => {
    const key = placeholderName.toLowerCase();
    // Check if the placeholder exists in the replacements object
    if (replacements.hasOwnProperty(key)) {
        return replacements[key];
    }
    
    // Also support array index if replacements is array (legacy support)
    if (Array.isArray(replacements)) {
        // This is tricky because $CATEGORY$ doesn't map to index 0 easily without the placeholders def.
        // But for my usage, I will pass object: t('key', { category: '...' })
        return match; 
    }
    
    return match;
  });
}

// Helper for UI translation
export function applyUITranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
}
