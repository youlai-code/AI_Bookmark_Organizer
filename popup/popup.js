import { initI18n, t, applyUITranslations } from '../utils/i18n.js';
import { log, error } from '../utils/logger.js';
import { getDailyQuotaStatus, DAILY_USAGE_STORAGE_KEY } from '../utils/llm.js';
import { DAILY_REQUEST_LIMIT } from '../config/app.config.js';

const LLM_CONFIG_ERROR_CODE = 'MODEL_NOT_CONFIGURED';

document.addEventListener('DOMContentLoaded', async () => {
  // Apply theme first
  chrome.storage.sync.get({ theme: 'auto' }, (items) => {
      applyTheme(items.theme);
  });
  
  await initI18n();
  applyUITranslations();
  loadHistory();
  refreshDailyQuotaStatus();
  
  document.getElementById('smartBookmarkBtn').addEventListener('click', triggerSmartBookmark);
  
  document.getElementById('openManager').addEventListener('click', () => {
    chrome.tabs.create({ url: 'manager/index.html' });
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[DAILY_USAGE_STORAGE_KEY]) {
      refreshDailyQuotaStatus();
      return;
    }
    if (area === 'sync' && changes.llmProvider) {
      refreshDailyQuotaStatus();
    }
  });
});

// 触发智能收藏
async function triggerSmartBookmark() {
  const btn = document.getElementById('smartBookmarkBtn');
  const status = document.getElementById('actionStatus');
  const loadingRing = document.getElementById('loadingRing');
  
  // 禁用按钮 & 显示 Loading
  btn.disabled = true;
  loadingRing.style.display = 'block';
  status.textContent = t('analyzing') || '分析中...';
  status.style.color = '#5f6368';

  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error(t('errorNoTab') || '无法获取当前标签页');
    }

    // 发送消息给 background
    log('[Popup] 发送请求到 Background:', { tabId: tab.id, url: tab.url });
    
    // 设置超时 Promise (防止 Popup 一直转圈)
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('请求超时 (Background 无响应)')), 30000);
    });

    const sendPromise = chrome.runtime.sendMessage({
      type: 'TRIGGER_CLASSIFICATION_FROM_POPUP',
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    });

    // Race
    const response = await Promise.race([sendPromise, timeoutPromise]);
    
    log('[Popup] 收到响应:', response);

    if (response && response.success) {
      const bookmarkedMsg = t('bookmarkedSuccess', { category: response.category }) || `已收藏: ${response.category}`;
      status.textContent = bookmarkedMsg;
      status.style.color = '#188038'; // Green
      
      // 刷新历史记录
      loadHistory();
      
      // 成功后自动关闭 Popup (可选，延迟一点让用户看到结果)
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      if (response?.errorCode === LLM_CONFIG_ERROR_CODE) {
        alert(response.error || t('errorModelNotConfigured') || 'AI model is not configured.');
      }
      throw new Error(response.error || t('unknownError') || '未知错误');
    }

  } catch (error) {
    error(error);
    const failMsg = t('failedPrefix') || '失败: ';
    status.textContent = `${failMsg}${error.message}`;
    status.style.color = '#d93025'; // Red
    btn.disabled = false;
  } finally {
    loadingRing.style.display = 'none';
    refreshDailyQuotaStatus();
  }
}

async function refreshDailyQuotaStatus() {
  const quotaEl = document.getElementById('dailyQuotaStatus');
  if (!quotaEl) return;

  try {
    const quota = await getDailyQuotaStatus();
    if (!quota.tracked) {
      const external = t('dailyQuotaExternal', { provider: quota.providerName || 'custom provider' });
      quotaEl.textContent = external && external !== 'dailyQuotaExternal'
        ? external
        : `Quota managed by ${quota.providerName || 'custom provider'}`;
      quotaEl.classList.remove('quota-low');
      return;
    }

    const translated = t('dailyQuotaRemaining', {
      remaining: String(quota.remaining),
      limit: String(quota.limit)
    });
    const message = translated && translated !== 'dailyQuotaRemaining'
      ? translated
      : `Today remaining: ${quota.remaining}/${quota.limit}`;

    quotaEl.textContent = message;
    quotaEl.classList.toggle('quota-low', quota.remaining <= 10);
  } catch (err) {
    const unavailable = t('dailyQuotaUnavailable', { limit: String(DAILY_REQUEST_LIMIT) });
    quotaEl.textContent = unavailable && unavailable !== 'dailyQuotaUnavailable'
      ? unavailable
      : `Today remaining: --/${DAILY_REQUEST_LIMIT}`;
    quotaEl.classList.remove('quota-low');
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
  list.innerHTML = '';
  
  if (!history || history.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  
  emptyMsg.style.display = 'none';
  
  history.forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.title = '点击打开链接';
    
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
