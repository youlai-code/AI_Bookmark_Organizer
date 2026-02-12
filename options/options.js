const OFFICIAL_PROXY = 'https://youlainote.cloud';
import { initI18n, t } from '../utils/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initI18n();
  restoreOptions();
  setupTabs();
  setupAutoSave();
  applyTranslations();
});

function applyTranslations() {
  // 1. Translate regular text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = t(key);
    if (message) {
      // If the element has children (like icons), we only want to replace the text node
      // But a simpler way for this extension's structure is to check if it has a specific text span or just replace if no children
      if (el.children.length === 0) {
        el.textContent = message;
      } else {
        // Find the last text node and replace it, or just handle specifically for nav items
        // For simplicity, if it's a nav-item or header with icon, we'll handle the text node
        const textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
        if (textNode) {
          textNode.textContent = message;
        } else {
          // Fallback: if no text node found but we have children, we might need to append or handle differently
          // In our HTML, most i18n are on spans or labels without complex mixed content
          // For those with icons, the text is usually after the icon
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              const trimmed = node.textContent.trim();
              if (trimmed && !trimmed.includes('{{') ) { // Basic check to avoid breaking things
                 node.textContent = node.textContent.replace(trimmed, message);
              }
            }
          });
        }
      }
    }
  });

  // 2. Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = t(key);
    if (message) {
      el.placeholder = message;
    }
  });

  // 3. Translate titles (tooltips)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = t(key);
    if (message) {
      el.title = message;
    }
  });

  // 4. Update page title
  const titleKey = document.querySelector('.nav-item.active')?.dataset.tab;
  if (titleKey) {
    updatePageTitle(titleKey);
  }
}

function updatePageTitle(tabId) {
  const pageTitle = document.getElementById('pageTitle');
  const titleMap = {
    'settings': t('navSettings'),
    'blocked': t('navBlocked'),
    'history': t('navHistory'),
    'bookmarks': t('navBookmarks')
  };
  const titleText = titleMap[tabId] || t('navSettings');
  pageTitle.textContent = titleText;
  
  const appName = t('appNameShort') || t('appName');
  if (appName && titleText) {
    document.title = `${appName} - ${titleText}`;
  } else if (appName) {
    document.title = appName;
  }
}

document.getElementById('clearHistory').addEventListener('click', clearHistory);

function setupAutoSave() {
    const inputs = [
        'llmProvider', 'apiKey', 'model', 'baseUrl', 'ollamaHost',
        'allowNewFolders', 'enableSmartRename', 'showFloatingButton', 'language'
    ];
    
    const debouncedSave = debounce(autoSaveOptions, 800);
    
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        if (el.tagName === 'SELECT' || el.type === 'checkbox') {
            el.addEventListener('change', () => {
                if (id === 'llmProvider') updateUIState();
                if (id === 'allowNewFolders') updateStrategyVisibility();
                if (id === 'language') {
                    // When language changes, save then re-apply translations
                    autoSaveOptions();
                    setTimeout(() => applyTranslations(), 100); 
                } else {
                    autoSaveOptions();
                }
            });
        } else {
            el.addEventListener('input', () => {
                if (id === 'baseUrl') updateUIState();
                debouncedSave();
            });
        }
    });

    // Special handling for folder strategy radio buttons
    document.querySelectorAll('input[name="folderStrategy"]').forEach(radio => {
        radio.addEventListener('change', autoSaveOptions);
    });
}

function updateStrategyVisibility() {
    const allowNewFolders = document.getElementById('allowNewFolders').checked;
    const strategyGroup = document.getElementById('folderStrategyGroup');
    if (strategyGroup) {
        if (allowNewFolders) {
            strategyGroup.style.display = 'block';
        } else {
            strategyGroup.style.display = 'none';
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setupTabs() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // 1. Update active state in sidebar
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // 2. Show corresponding tab content
      const tabId = item.dataset.tab;
      document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');

      // 3. Update Page Title
      updatePageTitle(tabId);
    });
  });
}

function autoSaveOptions() {
  const llmProvider = document.getElementById('llmProvider').value;
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  const baseUrl = document.getElementById('baseUrl').value;
  const ollamaHost = document.getElementById('ollamaHost').value;
  
  const allowNewFolders = document.getElementById('allowNewFolders').checked;

  // Get value from checked radio
  const folderCreationLevelRadio = document.querySelector('input[name="folderStrategy"]:checked');
  const folderCreationLevel = folderCreationLevelRadio ? folderCreationLevelRadio.value : 'weak';
  
  const enableSmartRename = document.getElementById('enableSmartRename').checked;
  const showFloatingButton = document.getElementById('showFloatingButton').checked;
  const language = document.getElementById('language').value;
  
  // Show saving status
  const status = document.getElementById('saveStatus');
  status.textContent = t('saveStatusSaving') || '正在保存...';
  status.style.color = '#5f6368';

  chrome.storage.sync.set(
    { 
      llmProvider, apiKey, model, baseUrl, ollamaHost, 
      allowNewFolders, folderCreationLevel, enableSmartRename, showFloatingButton, language 
    },
    () => {
      status.textContent = '✅ ' + (t('saveStatusSaved') || '已自动保存');
      status.style.color = '#188038';
      setTimeout(() => {
        status.textContent = '';
      }, 2000);
    }
  );
}

function restoreOptions() {
  chrome.storage.sync.get(
    { 
        llmProvider: 'default', 
        apiKey: '', 
        model: '', 
        baseUrl: OFFICIAL_PROXY,
        ollamaHost: '', 
        allowNewFolders: true, 
        folderCreationLevel: 'weak',
        enableSmartRename: false, 
        showFloatingButton: true,
        language: 'zh_CN',
        disabledDomains: [] 
    },
    (items) => {
      document.getElementById('llmProvider').value = items.llmProvider;
      document.getElementById('apiKey').value = items.apiKey;
      document.getElementById('model').value = items.model;
      document.getElementById('baseUrl').value = items.baseUrl;
      document.getElementById('ollamaHost').value = items.ollamaHost;
      
      // Migrate legacy allowNewFolders (which might be string or boolean) to new separate values
      let allowAI = true;
      let level = 'weak';

      // 1. Check legacy values (if they exist and are not boolean/undefined mixed up)
      if (typeof items.allowNewFolders === 'string') {
        // Was "off", "weak", "medium", "strong"
        if (items.allowNewFolders === 'off') {
            allowAI = false;
            level = 'weak'; // Default to weak if re-enabled
        } else {
            allowAI = true;
            level = items.allowNewFolders;
        }
      } else if (typeof items.allowNewFolders === 'boolean') {
        // Was true/false
        allowAI = items.allowNewFolders;
        level = 'medium'; // Legacy default was balanced
      } else {
        // New structure
        allowAI = items.allowNewFolders;
        level = items.folderCreationLevel || 'weak';
      }

      document.getElementById('allowNewFolders').checked = allowAI;
      
      // Select the correct radio button
      const radio = document.querySelector(`input[name="folderStrategy"][value="${level}"]`);
      if (radio) radio.checked = true;

      document.getElementById('enableSmartRename').checked = items.enableSmartRename;
      document.getElementById('showFloatingButton').checked = items.showFloatingButton;
      document.getElementById('language').value = items.language;
      
      renderBlockedList(items.disabledDomains);
      updateUIState();
      updateStrategyVisibility();
      loadHistory();
    }
  );
}

function updateUIState() {
    const provider = document.getElementById('llmProvider').value;
    const baseUrl = document.getElementById('baseUrl').value;
    
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const modelGroup = document.getElementById('modelGroup');
    const baseUrlGroup = document.getElementById('baseUrlGroup');
    const ollamaHostGroup = document.getElementById('ollamaHostGroup');
    const proxyStatus = document.getElementById('proxyStatus');
    const defaultModelStatus = document.getElementById('defaultModelStatus');
    
    const hint = document.getElementById('modelHint');
    const modelInput = document.getElementById('model');

    // Default visibility: Hide all first
    apiKeyGroup.style.display = 'none';
    modelGroup.style.display = 'none';
    baseUrlGroup.style.display = 'none';
    ollamaHostGroup.style.display = 'none';
    if(proxyStatus) proxyStatus.style.display = 'none';
    if(defaultModelStatus) defaultModelStatus.style.display = 'none';

    if (provider === 'default') {
        if(defaultModelStatus) defaultModelStatus.style.display = 'block';
        // 默认模型使用内置代理，不需要用户配置
    } else if (provider === 'deepseek') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        
        hint.textContent = t('modelHintDeepSeek') || '默认为 deepseek-chat';
        modelInput.placeholder = 'deepseek-chat';
    } else if (provider === 'chatgpt') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        
        hint.textContent = t('modelHintChatGPT') || '默认为 gpt-4o-mini';
        modelInput.placeholder = 'gpt-4o-mini';
    } else if (provider === 'gemini') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        
        hint.textContent = t('modelHintGemini') || '默认为 gemini-1.5-flash';
        modelInput.placeholder = 'gemini-1.5-flash';
    } 
    else if (provider === 'ollama') {
        ollamaHostGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        hint.textContent = t('modelHintOllama') || '默认为 llama3';
        modelInput.placeholder = 'llama3';
    } else if (provider === 'doubao') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        hint.textContent = t('modelHintDoubao') || 'Endpoint ID (如 ep-2024...)';
        modelInput.placeholder = 'ep-2024xxxx';
    }
}

function loadHistory() {
  chrome.storage.local.get({ history: [] }, (items) => {
    renderHistoryList(items.history);
  });
}

function renderHistoryList(history) {
  const list = document.getElementById('historyList');
  const emptyMsg = document.getElementById('emptyHistoryMsg');
  list.innerHTML = '';
  
  if (!history || history.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  
  emptyMsg.style.display = 'none';
  
  history.forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
    
    const date = new Date(item.timestamp).toLocaleString();
    
    li.innerHTML = `
      <div class="history-header">
        <div class="history-title" title="${item.title}">${item.title}</div>
        <div class="history-category">${item.category}</div>
      </div>
      <div class="history-url" title="${item.url}">${item.url}</div>
      <div class="history-time">${date}</div>
    `;
    list.appendChild(li);
  });
}

function clearHistory() {
  if (confirm(t('confirmClearHistory') || '确定要清空所有历史记录吗？')) {
    chrome.storage.local.set({ history: [] }, () => {
      loadHistory();
    });
  }
}

function renderBlockedList(domains) {
  const list = document.getElementById('blockedList');
  const emptyMsg = document.getElementById('emptyListMsg');
  list.innerHTML = '';
  
  if (!domains || domains.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  
  emptyMsg.style.display = 'none';
  
  domains.forEach((domain, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${domain}</span>
      <button class="text-btn danger remove-btn" data-domain="${domain}">${t('remove') || '移除'}</button>
    `;
    list.appendChild(li);
  });
  
  // 绑定移除事件
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const domainToRemove = e.target.dataset.domain;
      removeDomain(domainToRemove);
    });
  });
}

function removeDomain(domain) {
  chrome.storage.sync.get({ disabledDomains: [] }, (items) => {
    const newDomains = items.disabledDomains.filter(d => d !== domain);
    chrome.storage.sync.set({ disabledDomains: newDomains }, () => {
      renderBlockedList(newDomains);
    });
  });
}
