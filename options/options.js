import { OFFICIAL_PROXY as CONFIG_OFFICIAL_PROXY } from '../config/app.config.js';

const OFFICIAL_PROXY = CONFIG_OFFICIAL_PROXY;
const OFFICIAL_PROXY_ALIASES = new Set([OFFICIAL_PROXY]);
import { initI18n, t } from '../utils/i18n.js';
import { testLLMConnection } from '../utils/llm.js';
import {
  createBookmarkBackup,
  deleteBookmarkBackup,
  exportCurrentBookmarksAsHtml,
  formatBackupTimestamp,
  importBookmarksFromHtml,
  listBookmarkBackups,
  restoreBookmarkBackup
} from '../utils/bookmark_backup.js';

const MIN_RENAME_LENGTH = 4;
const MAX_RENAME_LENGTH = 20;
const DEFAULT_RENAME_LENGTH = 12;
const USAGE_STATS_STORAGE_KEY = 'usageStats';

document.addEventListener('DOMContentLoaded', async () => {
  await initI18n();
  setupTabs();
  setupAutoSave();
  setupLlmConnectionTest();
  setupHistoryActions();
  setupUsageStatsActions();
  setupBookmarkBackupActions();
  restoreOptions();
  applyTranslations();
  resetBookmarkBackupStatus();
  await loadBookmarkBackups();
  void loadUsageStats({ silent: true });

  window.addEventListener('i18nChanged', async () => {
    applyTranslations();
    resetLlmTestStatus();
    resetBookmarkBackupStatus();
    await loadBookmarkBackups();
    loadHistory();
    void loadUsageStats({ silent: true });
    chrome.storage.sync.get({ disabledDomains: [] }, (items) => {
      renderBlockedList(items.disabledDomains);
    });
  });
});

function tt(key, fallback, replacements = {}) {
  const message = t(key, replacements);
  if (!message || message === key) {
    return fallback;
  }
  return message;
}

function setTextBySelector(selector, text) {
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = text;
  });
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const message = t(key);
    if (!message || message === key) return;

    if (el.children.length === 0) {
      el.textContent = message;
      return;
    }

    const textNode = Array.from(el.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ''
    );

    if (textNode) {
      textNode.textContent = message;
      return;
    }

    el.childNodes.forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const trimmed = node.textContent.trim();
      if (!trimmed) return;
      node.textContent = node.textContent.replace(trimmed, message);
    });
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = t(key);
    if (message && message !== key) {
      el.placeholder = message;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    const message = t(key);
    if (message && message !== key) {
      el.title = message;
    }
  });

  // Force-refresh backup section labels with current-language fallbacks.
  setTextBySelector('.nav-item[data-tab="bookmarks"] [data-i18n="navBookmarks"]', tt('sectionBookmarkBackup', '书签备份'));
  setTextBySelector('#bookmarks [data-i18n="sectionBookmarkBackup"]', tt('sectionBookmarkBackup', '书签备份'));
  setTextBySelector('#bookmarks [data-i18n="bookmarkBackupDesc"]', tt('bookmarkBackupDesc', '把手动备份直接存到扩展本地，并支持 HTML 导入和导出。'));
  setTextBySelector('#createBackupNow', tt('createBackupNow', '立即备份'));
  setTextBySelector('#exportBookmarksHtml', tt('exportBookmarksHtml', '导出 HTML'));
  setTextBySelector('#importBookmarksHtml', tt('importBookmarksHtml', '导入 HTML'));
  setTextBySelector('#emptyBackupMsg', tt('noBackups', '还没有备份记录'));

  const titleKey = document.querySelector('.nav-item.active')?.dataset.tab || 'settings';
  updatePageTitle(titleKey);
}

function updatePageTitle(tabId) {
  const pageTitle = document.getElementById('pageTitle');
  const titleMap = {
    settings: tt('navSettings', '设置'),
    bookmarks: tt('sectionBookmarkBackup', '书签备份'),
    blocked: tt('navBlocked', '屏蔽规则'),
    history: tt('navHistory', '历史记录'),
    usage: tt('navUsageStats', '使用统计'),
    about: tt('navAbout', '关于')
  };
  const titleText = titleMap[tabId] || tt('navSettings', '设置');
  pageTitle.textContent = titleText;

  const appName = tt('appNameShort', tt('appName', 'AI书签整理'));
  document.title = titleText ? `${appName} - ${titleText}` : appName;
}

function setupHistoryActions() {
  document.getElementById('clearHistory')?.addEventListener('click', clearHistory);
}

function setupUsageStatsActions() {
  document.getElementById('usageStatsRefresh')?.addEventListener('click', () => {
    void loadUsageStats({ silent: false });
  });

  document.getElementById('usageStatsClear')?.addEventListener('click', () => {
    openUsageStatsConfirmModal();
  });

  document.getElementById('usageStatsConfirmCancel')?.addEventListener('click', () => {
    closeUsageStatsConfirmModal();
  });

  document.getElementById('usageStatsConfirmOk')?.addEventListener('click', () => {
    void clearUsageStats();
  });

  document.getElementById('usageStatsConfirmModal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'usageStatsConfirmModal') {
      closeUsageStatsConfirmModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const modal = document.getElementById('usageStatsConfirmModal');
    if (modal?.hasAttribute('hidden')) return;
    closeUsageStatsConfirmModal();
  });
}

function setupLlmConnectionTest() {
  document.getElementById('testLlmConnection')?.addEventListener('click', () => {
    void handleTestLlmConnection();
  });
}

function getCurrentLlmConfig() {
  return {
    llmProvider: document.getElementById('llmProvider')?.value || 'default',
    apiKey: document.getElementById('apiKey')?.value || '',
    model: document.getElementById('model')?.value || '',
    baseUrl: document.getElementById('baseUrl')?.value || '',
    ollamaHost: document.getElementById('ollamaHost')?.value || '',
    language: document.getElementById('language')?.value || 'zh_CN'
  };
}

function setLlmTestStatus(message, tone = 'muted') {
  const status = document.getElementById('llmTestStatus');
  if (!status) return;
  status.textContent = message || '';

  if (!message || tone === 'muted') {
    delete status.dataset.state;
    return;
  }

  status.dataset.state = tone;
}

function resetLlmTestStatus() {
  setLlmTestStatus('');
}

async function handleTestLlmConnection() {
  const button = document.getElementById('testLlmConnection');
  if (!button) return;

  const originalLabel = tt('testConnection', 'Test Connection');
  button.disabled = true;
  button.textContent = tt('testingConnection', 'Testing...');
  setLlmTestStatus(tt('testingConnection', 'Testing...'));

  try {
    const result = await testLLMConnection(getCurrentLlmConfig());
    setLlmTestStatus(
      tt(
        'connectionTestSuccess',
        `Connection successful. Received a valid response from ${result.providerName}.`,
        { provider: result.providerName }
      ),
      'success'
    );
  } catch (err) {
    const errorMessage = err?.message || String(err);
    setLlmTestStatus(
      tt('connectionTestFailed', `Connection failed: ${errorMessage}`, { error: errorMessage }),
      'error'
    );
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function setupAutoSave() {
  const inputs = [
    'llmProvider',
    'apiKey',
    'model',
    'baseUrl',
    'ollamaHost',
    'allowNewFolders',
    'enableSmartRename',
    'renameMaxLength',
    'showFloatingButton',
    'captureNativeBookmarkEvents',
    'language',
    'theme'
  ];
  const llmInputIds = new Set(['llmProvider', 'apiKey', 'model', 'baseUrl', 'ollamaHost', 'language']);

  const debouncedSave = debounce(autoSaveOptions, 800);

  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === 'SELECT' || el.type === 'checkbox') {
      el.addEventListener('change', () => {
        if (llmInputIds.has(id)) resetLlmTestStatus();
        if (id === 'llmProvider') updateUIState();
        if (id === 'allowNewFolders') updateStrategyVisibility();
        if (id === 'enableSmartRename') updateRenameLengthVisibility();
        if (id === 'captureNativeBookmarkEvents') updateNativeBookmarkWarningVisibility();
        if (id === 'theme') applyTheme(el.value);

        autoSaveOptions();

        if (id === 'language') {
          setTimeout(() => {
            applyTranslations();
            updateNativeBookmarkWarningVisibility();
            resetBookmarkBackupStatus();
            void loadBookmarkBackups();
          }, 100);
        }
      });
      return;
    }

    el.addEventListener('input', () => {
      if (llmInputIds.has(id)) resetLlmTestStatus();
      if (id === 'baseUrl') updateUIState();
      if (id === 'renameMaxLength') updateRenameLengthDisplay(el.value);
      debouncedSave();
    });
  });

  document.querySelectorAll('input[name="folderStrategy"]').forEach((radio) => {
    radio.addEventListener('change', autoSaveOptions);
  });
}

function updateStrategyVisibility() {
  const allowNewFolders = document.getElementById('allowNewFolders')?.checked;
  const strategyGroup = document.getElementById('folderStrategyGroup');
  if (!strategyGroup) return;
  strategyGroup.style.display = allowNewFolders ? 'block' : 'none';
}

function updateRenameLengthDisplay(value) {
  const display = document.getElementById('renameMaxLengthValue');
  if (display) {
    display.textContent = String(value);
  }
}

function normalizeRenameLength(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return DEFAULT_RENAME_LENGTH;
  return Math.max(MIN_RENAME_LENGTH, Math.min(MAX_RENAME_LENGTH, parsed));
}

function updateRenameLengthVisibility() {
  const group = document.getElementById('renameLengthGroup');
  if (!group) return;
  group.style.display = document.getElementById('enableSmartRename')?.checked ? 'block' : 'none';
}

function updateNativeBookmarkWarningVisibility() {
  const warning = document.getElementById('captureNativeBookmarkEventsWarningHint');
  if (!warning) return;
  warning.style.display = document.getElementById('captureNativeBookmarkEvents')?.checked ? 'flex' : 'none';
}

function debounce(func, wait) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function setupTabs() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((nav) => nav.classList.remove('active'));
      item.classList.add('active');

      const tabId = item.dataset.tab;
      document.querySelectorAll('.tab-view').forEach((view) => {
        view.classList.remove('active');
      });
      document.getElementById(tabId)?.classList.add('active');
      updatePageTitle(tabId);

      if (tabId === 'usage') {
        void loadUsageStats({ silent: true });
      }
    });
  });
}

function setUsageStatsStatus(message, tone = 'muted') {
  const status = document.getElementById('usageStatsStatus');
  if (!status) return;
  status.textContent = message || '';

  if (!message || tone === 'muted') {
    delete status.dataset.state;
    return;
  }

  status.dataset.state = tone;
}

function normalizeUsageStatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeUsageStats(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const lastResetAt = obj.lastResetAt == null ? null : Number(obj.lastResetAt);
  const updatedAt = obj.updatedAt == null ? null : Number(obj.updatedAt);

  return {
    aiClassifyCount: normalizeUsageStatCount(obj.aiClassifyCount),
    aiRenameCount: normalizeUsageStatCount(obj.aiRenameCount),
    invalidDetectedCount: normalizeUsageStatCount(obj.invalidDetectedCount),
    lastResetAt: Number.isFinite(lastResetAt) ? lastResetAt : null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null
  };
}

function formatUsageStatsTime(ts) {
  if (!ts) return tt('usageStatsNeverReset', '未清零过');
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function openUsageStatsConfirmModal() {
  const modal = document.getElementById('usageStatsConfirmModal');
  if (!modal) return;
  modal.removeAttribute('hidden');
  const ok = document.getElementById('usageStatsConfirmOk');
  ok?.focus();
}

function closeUsageStatsConfirmModal() {
  const modal = document.getElementById('usageStatsConfirmModal');
  if (!modal) return;
  modal.setAttribute('hidden', '');
}

async function loadUsageStats({ silent }) {
  if (!silent) {
    setUsageStatsStatus(tt('usageStatsLoading', '读取中...'));
  } else {
    setUsageStatsStatus('');
  }

  try {
    const stored = await chrome.storage.local.get({ [USAGE_STATS_STORAGE_KEY]: null });
    const stats = normalizeUsageStats(stored?.[USAGE_STATS_STORAGE_KEY]);

    document.getElementById('usageStatAiClassifyValue').textContent = String(stats.aiClassifyCount);
    document.getElementById('usageStatAiRenameValue').textContent = String(stats.aiRenameCount);
    document.getElementById('usageStatInvalidDetectedValue').textContent = String(stats.invalidDetectedCount);

    if (!silent) {
      setUsageStatsStatus(tt('usageStatsLoaded', '已刷新'), 'success');
      setTimeout(() => setUsageStatsStatus(''), 1500);
    }
  } catch (err) {
    const message = err?.message || String(err);
    setUsageStatsStatus(tt('usageStatsLoadFailed', `读取失败：${message}`, { error: message }), 'error');
  }
}

async function clearUsageStats() {
  const okButton = document.getElementById('usageStatsConfirmOk');
  if (okButton) okButton.disabled = true;

  try {
    const now = Date.now();
    await chrome.storage.local.set({
      [USAGE_STATS_STORAGE_KEY]: {
        aiClassifyCount: 0,
        aiRenameCount: 0,
        invalidDetectedCount: 0,
        lastResetAt: now,
        updatedAt: now
      }
    });

    closeUsageStatsConfirmModal();
    setUsageStatsStatus(tt('usageStatsCleared', '已清零'), 'success');
    void loadUsageStats({ silent: true });
  } catch (err) {
    const message = err?.message || String(err);
    setUsageStatsStatus(tt('usageStatsClearFailed', `清零失败：${message}`, { error: message }), 'error');
  } finally {
    if (okButton) okButton.disabled = false;
  }
}

function setupBookmarkBackupActions() {
  document.getElementById('createBackupNow')?.addEventListener('click', () => {
    void handleCreateBackupNow();
  });
  document.getElementById('exportBookmarksHtml')?.addEventListener('click', () => {
    void handleExportBookmarksHtml();
  });
  document.getElementById('importBookmarksHtml')?.addEventListener('click', () => {
    document.getElementById('bookmarkImportInput')?.click();
  });
  document.getElementById('bookmarkImportInput')?.addEventListener('change', (event) => {
    void handleImportBookmarksFileChange(event);
  });
}

function resetBookmarkBackupStatus() {
  setBookmarkBackupStatus(
    tt('bookmarkBackupHint', '导入时会先自动创建一份安全备份，并尽量匹配到对应的根目录。')
  );
}

function setBookmarkBackupStatus(message, tone = 'muted') {
  const status = document.getElementById('bookmarkBackupStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = tone;
}

function getBackupSourceLabel(source) {
  const sourceKey = String(source || '').trim();
  if (sourceKey === 'manager' || sourceKey === 'options' || sourceKey === 'manual') {
    return tt('manualBackupLabel', '手动备份');
  }
  if (sourceKey === 'pre-import') {
    return tt('preImportBackupLabel', '导入前备份');
  }
  if (sourceKey === 'pre-restore') {
    return tt('preRestoreBackupLabel', '恢复前备份');
  }
  return sourceKey || tt('manualBackupLabel', '手动备份');
}

function getBackupDisplayLabel(backup) {
  return `${getBackupSourceLabel(backup?.source)} ${formatBackupTimestamp(backup?.createdAt)}`;
}

function buildBackupFilename(prefix) {
  const stamp = formatBackupTimestamp()
    .replace(/[^0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}-${stamp}.html`;
}

function triggerTextDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function loadBookmarkBackups() {
  const backups = await listBookmarkBackups();
  renderBookmarkBackups(backups);
}

function renderBookmarkBackups(backups) {
  const list = document.getElementById('backupList');
  const empty = document.getElementById('emptyBackupMsg');
  if (!list || !empty) return;

  list.innerHTML = '';

  if (!Array.isArray(backups) || backups.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  backups.forEach((backup) => {
    const li = document.createElement('li');
    li.className = 'backup-item';

    const main = document.createElement('div');
    main.className = 'backup-main';

    const title = document.createElement('div');
    title.className = 'backup-title';
    title.textContent = getBackupDisplayLabel(backup);

    const meta = document.createElement('div');
    meta.className = 'backup-meta';
    meta.textContent = tt(
      'backupItemMeta',
      `${formatBackupTimestamp(backup.createdAt)} · ${getBackupSourceLabel(backup.source)} · ${backup.bookmarkCount || 0} 个书签 · ${backup.folderCount || 0} 个文件夹`,
      {
        time: formatBackupTimestamp(backup.createdAt),
        source: getBackupSourceLabel(backup.source),
        bookmarks: String(backup.bookmarkCount || 0),
        folders: String(backup.folderCount || 0)
      }
    );

    const actions = document.createElement('div');
    actions.className = 'backup-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'text-btn';
    restoreBtn.textContent = tt('restoreBackup', '恢复');
    restoreBtn.addEventListener('click', () => {
      void handleRestoreBackup(backup.id);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-btn danger';
    deleteBtn.textContent = tt('deleteBackup', '删除');
    deleteBtn.addEventListener('click', () => {
      void handleDeleteBackup(backup.id);
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);
    main.appendChild(title);
    main.appendChild(meta);
    li.appendChild(main);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

async function handleCreateBackupNow() {
  const button = document.getElementById('createBackupNow');
  if (button) button.disabled = true;
  setBookmarkBackupStatus(tt('bookmarkBackupCreating', '正在创建备份...'), 'muted');

  try {
    const backup = await createBookmarkBackup({
      source: 'options'
    });
    await loadBookmarkBackups();
    setBookmarkBackupStatus(
      tt(
        'manualBackupCreated',
        `已创建备份：${getBackupDisplayLabel(backup)}（${backup.bookmarkCount || 0} 个书签）。`,
        {
          label: getBackupDisplayLabel(backup),
          count: String(backup.bookmarkCount || 0)
        }
      ),
      'success'
    );
  } catch (err) {
    setBookmarkBackupStatus(
      tt('manualBackupFailed', `备份失败：${err?.message || err}`, { error: err?.message || String(err) }),
      'error'
    );
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleExportBookmarksHtml() {
  const button = document.getElementById('exportBookmarksHtml');
  if (button) button.disabled = true;
  setBookmarkBackupStatus(tt('bookmarkExportRunning', '正在导出书签...'), 'muted');

  try {
    const html = await exportCurrentBookmarksAsHtml({
      title: tt('bookmarkExportTitle', '书签备份')
    });
    triggerTextDownload(buildBackupFilename('bookmarks-export'), html, 'text/html;charset=utf-8');
    setBookmarkBackupStatus(tt('bookmarkExportDone', '已开始导出 HTML 文件。'), 'success');
  } catch (err) {
    setBookmarkBackupStatus(
      tt('bookmarkExportFailed', `导出失败：${err?.message || err}`, { error: err?.message || String(err) }),
      'error'
    );
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleImportBookmarksFileChange(event) {
  const input = event.target;
  const file = input?.files?.[0];
  if (!file) return;

  setBookmarkBackupStatus(tt('bookmarkImportRunning', '正在导入 HTML...'), 'muted');

  try {
    const html = await file.text();
    const result = await importBookmarksFromHtml(html);
    await loadBookmarkBackups();
    setBookmarkBackupStatus(
      Array.isArray(result.destinationTitles) && result.destinationTitles.filter(Boolean).length > 1
        ? tt(
          'bookmarkImportDoneMultiple',
          `已导入 ${result.importedBookmarks || 0} 个书签，并自动匹配到对应目录。`,
          {
            count: String(result.importedBookmarks || 0)
          }
        )
        : tt(
          'bookmarkImportDone',
          `已导入到“${result.destinationTitles?.[0] || result.folderTitle}”，共 ${result.importedBookmarks || 0} 个书签。`,
          {
            folder: result.destinationTitles?.[0] || result.folderTitle,
            count: String(result.importedBookmarks || 0)
          }
        ),
      'success'
    );
  } catch (err) {
    setBookmarkBackupStatus(
      tt('bookmarkImportFailed', `导入失败：${err?.message || err}`, { error: err?.message || String(err) }),
      'error'
    );
  } finally {
    if (input) {
      input.value = '';
    }
  }
}

async function handleRestoreBackup(backupId) {
  const confirmMessage = tt(
    'confirmRestoreBackup',
    '确定恢复这份备份吗？恢复前会先自动备份当前书签。'
  );
  if (!window.confirm(confirmMessage)) return;

  setBookmarkBackupStatus(tt('bookmarkRestoreRunning', '正在恢复备份...'), 'muted');

  try {
    const backup = await restoreBookmarkBackup(backupId, {
      safetyBackupSource: 'pre-restore'
    });
    await loadBookmarkBackups();
    setBookmarkBackupStatus(
      tt(
        'bookmarkRestoreDone',
        `已恢复备份：${getBackupDisplayLabel(backup)}`,
        { label: getBackupDisplayLabel(backup) }
      ),
      'success'
    );
  } catch (err) {
    setBookmarkBackupStatus(
      tt('bookmarkRestoreFailed', `恢复失败：${err?.message || err}`, { error: err?.message || String(err) }),
      'error'
    );
  }
}

async function handleDeleteBackup(backupId) {
  const confirmMessage = tt('confirmDeleteBackup', '确定删除这条本地备份吗？');
  if (!window.confirm(confirmMessage)) return;

  try {
    await deleteBookmarkBackup(backupId);
    await loadBookmarkBackups();
    setBookmarkBackupStatus(tt('bookmarkDeleteDone', '备份已删除。'), 'success');
  } catch (err) {
    setBookmarkBackupStatus(
      tt('bookmarkDeleteFailed', `删除失败：${err?.message || err}`, { error: err?.message || String(err) }),
      'error'
    );
  }
}

function autoSaveOptions() {
  const llmProvider = document.getElementById('llmProvider').value;
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  const baseUrl = document.getElementById('baseUrl').value;
  const ollamaHost = document.getElementById('ollamaHost').value;
  const allowNewFolders = document.getElementById('allowNewFolders').checked;
  const folderCreationLevel = document.querySelector('input[name="folderStrategy"]:checked')?.value || 'weak';
  const enableSmartRename = document.getElementById('enableSmartRename').checked;
  const renameMaxLength = normalizeRenameLength(document.getElementById('renameMaxLength').value);
  const showFloatingButton = document.getElementById('showFloatingButton').checked;
  const captureNativeBookmarkEvents = document.getElementById('captureNativeBookmarkEvents').checked;
  const language = document.getElementById('language').value;
  const theme = document.getElementById('theme').value;

  const status = document.getElementById('saveStatus');
  status.textContent = tt('saveStatusSaving', 'Saving...');
  status.style.color = '#5f6368';

  chrome.storage.sync.set(
    {
      llmProvider,
      apiKey,
      model,
      baseUrl,
      ollamaHost,
      allowNewFolders,
      folderCreationLevel,
      enableSmartRename,
      renameMaxLength,
      showFloatingButton,
      captureNativeBookmarkEvents,
      language,
      theme
    },
    () => {
      status.textContent = `OK ${tt('saveStatusSaved', 'Saved automatically')}`;
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
      baseUrl: '',
      ollamaHost: '',
      allowNewFolders: false,
      folderCreationLevel: 'weak',
      enableSmartRename: true,
      renameMaxLength: DEFAULT_RENAME_LENGTH,
      showFloatingButton: true,
      captureNativeBookmarkEvents: false,
      language: 'zh_CN',
      theme: 'auto',
      disabledDomains: []
    },
    (items) => {
      document.getElementById('llmProvider').value = items.llmProvider;
      document.getElementById('apiKey').value = items.apiKey;
      document.getElementById('model').value = items.model;
      const normalizedBaseUrl = String(items.baseUrl || '').trim().replace(/\/+$/, '');
      const migratedBaseUrl = items.llmProvider !== 'default' && OFFICIAL_PROXY_ALIASES.has(normalizedBaseUrl)
        ? ''
        : items.baseUrl;
      document.getElementById('baseUrl').value = migratedBaseUrl;
      document.getElementById('ollamaHost').value = items.ollamaHost;

      let allowAI = true;
      let level = 'weak';

      if (typeof items.allowNewFolders === 'string') {
        allowAI = items.allowNewFolders !== 'off';
        level = allowAI ? items.allowNewFolders : 'weak';
      } else if (typeof items.allowNewFolders === 'boolean') {
        allowAI = items.allowNewFolders;
        level = items.folderCreationLevel || 'medium';
      } else {
        allowAI = !!items.allowNewFolders;
        level = items.folderCreationLevel || 'weak';
      }

      if (level !== 'off' && !['weak', 'medium', 'strong'].includes(level)) {
        level = 'weak';
      }

      if (typeof items.allowNewFolders === 'string') {
        chrome.storage.sync.set({ allowNewFolders: allowAI, folderCreationLevel: level }, () => {});
      } else if (typeof items.allowNewFolders === 'boolean' && !items.folderCreationLevel && allowAI) {
        chrome.storage.sync.set({ folderCreationLevel: level }, () => {});
      }

      document.getElementById('allowNewFolders').checked = allowAI;
      const checkedRadio = document.querySelector(`input[name="folderStrategy"][value="${level}"]`);
      if (checkedRadio) checkedRadio.checked = true;

      document.getElementById('enableSmartRename').checked = items.enableSmartRename;
      const normalizedRenameLength = normalizeRenameLength(items.renameMaxLength);
      document.getElementById('renameMaxLength').value = normalizedRenameLength;
      updateRenameLengthDisplay(normalizedRenameLength);
      document.getElementById('showFloatingButton').checked = items.showFloatingButton;
      document.getElementById('captureNativeBookmarkEvents').checked = !!items.captureNativeBookmarkEvents;
      document.getElementById('language').value = items.language;
      document.getElementById('theme').value = items.theme || 'auto';

      if (migratedBaseUrl !== items.baseUrl) {
        chrome.storage.sync.set({ baseUrl: migratedBaseUrl }, () => {});
      }

      applyTheme(items.theme || 'auto');
      renderBlockedList(items.disabledDomains);
      updateUIState();
      updateStrategyVisibility();
      updateRenameLengthVisibility();
      updateNativeBookmarkWarningVisibility();
      resetLlmTestStatus();
      loadHistory();
      resetBookmarkBackupStatus();
    }
  );
}

function updateUIState() {
  const provider = document.getElementById('llmProvider').value;
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  const modelGroup = document.getElementById('modelGroup');
  const baseUrlGroup = document.getElementById('baseUrlGroup');
  const ollamaHostGroup = document.getElementById('ollamaHostGroup');
  const llmConfigActions = document.getElementById('llmConfigActions');
  const proxyStatus = document.getElementById('proxyStatus');
  const defaultModelStatus = document.getElementById('defaultModelStatus');
  const hint = document.getElementById('modelHint');
  const modelInput = document.getElementById('model');

  apiKeyGroup.style.display = 'none';
  modelGroup.style.display = 'none';
  baseUrlGroup.style.display = 'none';
  ollamaHostGroup.style.display = 'none';
  if (llmConfigActions) llmConfigActions.style.display = 'flex';
  if (proxyStatus) proxyStatus.style.display = 'none';
  if (defaultModelStatus) defaultModelStatus.style.display = 'none';

  if (provider === 'default') {
    if (llmConfigActions) llmConfigActions.style.display = 'none';
    resetLlmTestStatus();
    if (defaultModelStatus) defaultModelStatus.style.display = 'block';
    return;
  }

  if (provider === 'deepseek') {
    apiKeyGroup.style.display = 'block';
    modelGroup.style.display = 'block';
    hint.textContent = tt('modelHintDeepSeek', 'deepseek-chat');
    modelInput.placeholder = 'deepseek-chat';
    return;
  }

  if (provider === 'chatgpt') {
    apiKeyGroup.style.display = 'block';
    modelGroup.style.display = 'block';
    hint.textContent = tt('modelHintChatGPT', 'gpt-4o-mini');
    modelInput.placeholder = 'gpt-4o-mini';
    return;
  }

  if (provider === 'gemini') {
    apiKeyGroup.style.display = 'block';
    modelGroup.style.display = 'block';
    hint.textContent = tt('modelHintGemini', 'gemini-1.5-flash');
    modelInput.placeholder = 'gemini-1.5-flash';
    return;
  }

  if (provider === 'zhipu') {
    apiKeyGroup.style.display = 'block';
    modelGroup.style.display = 'block';
    hint.textContent = tt('modelHintZhipu', 'glm-4.7-flash');
    modelInput.placeholder = 'glm-4.7-flash';
    return;
  }

  if (provider === 'ollama') {
    ollamaHostGroup.style.display = 'block';
    modelGroup.style.display = 'block';
    hint.textContent = tt('modelHintOllama', 'llama3');
    modelInput.placeholder = 'llama3';
    return;
  }

  if (provider === 'doubao') {
    apiKeyGroup.style.display = 'block';
    modelGroup.style.display = 'block';
    hint.textContent = tt('modelHintDoubao', 'Endpoint ID');
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

  history.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const header = document.createElement('div');
    header.className = 'history-header';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'history-title';
    titleDiv.textContent = item.title || item.url || '';
    titleDiv.title = item.title || item.url || '';

    const metaDiv = document.createElement('div');
    metaDiv.className = 'history-meta';

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'history-category';
    categoryDiv.textContent = item.category || '';

    const unbookmarkBtn = document.createElement('button');
    unbookmarkBtn.className = 'text-btn danger unbookmark-btn';
    unbookmarkBtn.textContent = tt('unbookmark', '取消收藏');
    unbookmarkBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await handleUnbookmark(item);
    });

    metaDiv.appendChild(categoryDiv);
    metaDiv.appendChild(unbookmarkBtn);
    header.appendChild(titleDiv);
    header.appendChild(metaDiv);

    const urlDiv = document.createElement('div');
    urlDiv.className = 'history-url';
    urlDiv.textContent = item.url || '';
    urlDiv.title = item.url || '';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'history-time';
    timeDiv.textContent = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';

    li.appendChild(header);
    li.appendChild(urlDiv);
    li.appendChild(timeDiv);
    li.addEventListener('click', () => {
      if (item.url) openUrl(item.url);
    });

    list.appendChild(li);
  });
}

function openUrl(url) {
  if (!url) return;
  chrome.tabs.create({ url });
}

async function handleUnbookmark(item) {
  if (!item?.url) return;

  const confirmMsg = tt('confirmUnbookmark', '确定要取消收藏这个书签吗？');
  if (!window.confirm(confirmMsg)) return;

  let bookmarkId = item.bookmarkId;

  if (!bookmarkId) {
    const found = await chrome.bookmarks.search({ url: item.url });
    if (found?.length) {
      bookmarkId = found[0].id;
    }
  }

  if (!bookmarkId) {
    alert(tt('unbookmarkNotFound', '未找到对应书签。'));
    return;
  }

  try {
    await chrome.bookmarks.remove(bookmarkId);
  } catch (err) {
    alert(`${tt('unbookmarkFailed', '取消收藏失败：')}${err?.message || err}`);
    return;
  }

  const { history } = await chrome.storage.local.get({ history: [] });
  const nextHistory = (history || []).filter((entry) => entry.id !== item.id);
  await chrome.storage.local.set({ history: nextHistory });
  loadHistory();
}

function clearHistory() {
  if (!window.confirm(tt('confirmClearHistory', '确定要清空全部历史记录吗？'))) return;
  chrome.storage.local.set({ history: [] }, () => {
    loadHistory();
  });
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

  domains.forEach((domain) => {
    const li = document.createElement('li');

    const label = document.createElement('span');
    label.textContent = domain;

    const button = document.createElement('button');
    button.className = 'text-btn danger remove-btn';
    button.textContent = tt('remove', '移除');
    button.dataset.domain = domain;
    button.addEventListener('click', (event) => {
      removeDomain(event.currentTarget.dataset.domain);
    });

    li.appendChild(label);
    li.appendChild(button);
    list.appendChild(li);
  });
}

function removeDomain(domain) {
  chrome.storage.sync.get({ disabledDomains: [] }, (items) => {
    const nextDomains = items.disabledDomains.filter((item) => item !== domain);
    chrome.storage.sync.set({ disabledDomains: nextDomains }, () => {
      renderBlockedList(nextDomains);
    });
  });
}
