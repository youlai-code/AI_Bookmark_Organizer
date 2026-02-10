import { translations } from '../utils/locales.js';

let currentLang = 'zh-CN'; // Default

document.addEventListener('DOMContentLoaded', () => {
  // Load language preference
  chrome.storage.sync.get({ language: 'zh-CN' }, (items) => {
    // Determine language
    let lang = items.language || navigator.language || 'zh-CN';
    if (!translations[lang]) {
        const prefix = lang.split('-')[0];
        lang = translations[prefix] ? prefix : 'zh-CN';
    }
    updateLanguage(lang);
    loadHistory();
  });
  
  document.getElementById('smartBookmarkBtn').addEventListener('click', triggerSmartBookmark);
  
  document.getElementById('openOptions').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });
});

function updateLanguage(lang) {
  currentLang = lang;
  const t = translations[lang] || translations['zh-CN'];
  
  // Update text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      el.textContent = t[key];
    }
  });
  
  // Update titles
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (t[key]) {
      el.title = t[key];
    }
  });
}

// 触发智能收藏
async function triggerSmartBookmark() {
  const btn = document.getElementById('smartBookmarkBtn');
  const status = document.getElementById('actionStatus');
  const loadingRing = document.getElementById('loadingRing');
  const t = translations[currentLang] || translations['zh-CN'];
  
  // 禁用按钮 & 显示 Loading
  btn.disabled = true;
  loadingRing.style.display = 'block';
  status.textContent = t.status_analyzing || '分析中...';
  status.style.color = '#5f6368';

  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error(t.error_no_tab || '无法获取当前标签页');
    }

    // 发送消息给 background
    const response = await chrome.runtime.sendMessage({
      type: 'TRIGGER_CLASSIFICATION_FROM_POPUP',
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    });

    if (response && response.success) {
      status.textContent = (t.status_bookmarked || '已收藏: ') + response.category;
      status.style.color = '#188038'; // Green
      
      // 刷新历史记录
      loadHistory();
      
      // 成功后自动关闭 Popup (可选，延迟一点让用户看到结果)
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      throw new Error(response.error || (t.error_unknown || '未知错误'));
    }

  } catch (error) {
    console.error(error);
    status.textContent = (t.status_failed || '失败: ') + error.message;
    status.style.color = '#d93025'; // Red
    btn.disabled = false;
  } finally {
    loadingRing.style.display = 'none';
  }
}

// 加载历史记录
function loadHistory() {
  chrome.storage.local.get({ history: [] }, (items) => {
    const history = items.history || [];
    renderHistoryList(history.slice(0, 10)); // 只显示最近 10 条
  });
}

function renderHistoryList(history) {
  const list = document.getElementById('historyList');
  const emptyMsg = document.getElementById('emptyHistory');
  const t = translations[currentLang] || translations['zh-CN'];
  list.innerHTML = '';
  
  if (!history || history.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  
  emptyMsg.style.display = 'none';
  
  history.forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.title = t.hint_click_to_open || '点击打开链接';
    
    li.addEventListener('click', () => {
      chrome.tabs.create({ url: item.url });
    });

    li.innerHTML = `
      <div class="item-top">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-category">${escapeHtml(item.category)}</div>
      </div>
      <div class="item-url">${escapeHtml(item.url)}</div>
    `;
    list.appendChild(li);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
