import { translations } from '../utils/locales.js';

const OFFICIAL_PROXY = 'https://aibookmark.tenb68.workers.dev';

let currentLang = 'zh-CN'; // Default language

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  setupTabs();
  setupAutoSave();
});

function updateLanguage(lang) {
  currentLang = lang;
  const t = translations[lang] || translations['zh-CN'];
  
  // Update the selector value if it's not already correct
  const languageSelector = document.getElementById('languageSelector');
  if (languageSelector && languageSelector.value !== lang) {
    languageSelector.value = lang;
  }

  // 1. Update text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      el.textContent = t[key];
    }
  });

  // 2. Update placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key]) {
      el.placeholder = t[key];
    }
  });

  // 3. Update specific dynamic elements if needed
  updateUIState(); // Re-render hints in correct language
  
  // 4. Reload lists if they are visible
  const activeTab = document.querySelector('.nav-item.active');
  if (activeTab) {
    const tabId = activeTab.dataset.tab;
    if (tabId === 'history') loadHistory();
    if (tabId === 'blocked') {
        chrome.storage.sync.get({ disabledDomains: [] }, (items) => {
            renderBlockedList(items.disabledDomains);
        });
    }
    if (tabId === 'bookmarks') loadBookmarksTree();
  }
}

// document.getElementById('save').addEventListener('click', saveOptions); // Removed save button
document.getElementById('clearHistory').addEventListener('click', clearHistory);

function setupAutoSave() {
    const inputs = [
        'llmProvider', 'apiKey', 'model', 'baseUrl', 'ollamaHost',
        'allowNewFolders', 'enableSmartRename', 'showFloatingButton', 'languageSelector'
    ];
    
    const debouncedSave = debounce(autoSaveOptions, 800);
    
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        if (el.tagName === 'SELECT' || el.type === 'checkbox') {
            el.addEventListener('change', () => {
                if (id === 'llmProvider') updateUIState();
                if (id === 'languageSelector') {
                    updateLanguage(el.value);
                }
                autoSaveOptions();
            });
        } else {
            el.addEventListener('input', () => {
                if (id === 'baseUrl') updateUIState();
                debouncedSave();
            });
        }
    });
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
  const pageTitle = document.getElementById('pageTitle');

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
  const t = translations[currentLang] || translations['zh-CN'];
  const titleMap = {
    'settings': t.pageTitle_settings || '设置',
    'blocked': t.pageTitle_blocked || '屏蔽规则',
    'history': t.pageTitle_history || '历史记录',
    'bookmarks': t.pageTitle_bookmarks || '收藏夹树'
  };
  pageTitle.textContent = titleMap[tabId] || t.pageTitle_settings;

  if (tabId === 'bookmarks') {
        loadBookmarksTree();
      }
    });
  });
}

function autoSaveOptions() {
  const language = document.getElementById('languageSelector').value;
  const llmProvider = document.getElementById('llmProvider').value;
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  const baseUrl = document.getElementById('baseUrl').value;
  const ollamaHost = document.getElementById('ollamaHost').value;
  const allowNewFolders = document.getElementById('allowNewFolders').checked;
  const enableSmartRename = document.getElementById('enableSmartRename').checked;
  const showFloatingButton = document.getElementById('showFloatingButton').checked;
  
  // Show saving status
  const status = document.getElementById('saveStatus');
  const t = translations[currentLang] || translations['zh-CN'];
  status.textContent = t.status_saving || '正在保存...';
  status.style.color = '#5f6368';

  chrome.storage.sync.set(
    { language, llmProvider, apiKey, model, baseUrl, ollamaHost, allowNewFolders, enableSmartRename, showFloatingButton },
    () => {
      status.textContent = t.status_saved || '✅ 已自动保存';
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
        language: 'zh-CN',
        llmProvider: 'default', 
        apiKey: '', 
        model: '', 
        baseUrl: OFFICIAL_PROXY,
        ollamaHost: '', 
        allowNewFolders: true, 
        enableSmartRename: false, 
        showFloatingButton: true,
        disabledDomains: [] 
    },
    (items) => {
      // Set language first
      const lang = items.language || navigator.language || 'zh-CN';
      // Normalize simple language codes (e.g. 'en-US' -> 'en' if we only have 'en')
      // Our supported locales are keys in translations object
      let supportedLang = lang;
      if (!translations[lang]) {
          // Try to match prefix, e.g. en-US -> en
          const prefix = lang.split('-')[0];
          if (translations[prefix]) {
              supportedLang = prefix;
          } else {
              supportedLang = 'zh-CN'; // Fallback
          }
      }
      
      document.getElementById('languageSelector').value = supportedLang;
      updateLanguage(supportedLang);

      document.getElementById('llmProvider').value = items.llmProvider;
      document.getElementById('apiKey').value = items.apiKey;
      document.getElementById('model').value = items.model;
      document.getElementById('baseUrl').value = items.baseUrl;
      document.getElementById('ollamaHost').value = items.ollamaHost;
      document.getElementById('allowNewFolders').checked = items.allowNewFolders;
      document.getElementById('enableSmartRename').checked = items.enableSmartRename;
      document.getElementById('showFloatingButton').checked = items.showFloatingButton;
      
      renderBlockedList(items.disabledDomains);
      updateUIState();
      loadHistory();
    }
  );
}

function updateUIState() {
    const t = translations[currentLang] || translations['zh-CN'];
    const provider = document.getElementById('llmProvider').value;
    const baseUrl = document.getElementById('baseUrl').value;
    
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const modelGroup = document.getElementById('modelGroup');
    const baseUrlGroup = document.getElementById('baseUrlGroup');
    const ollamaHostGroup = document.getElementById('ollamaHostGroup');
    const chromeAiStatus = document.getElementById('chromeAiStatus');
    const proxyStatus = document.getElementById('proxyStatus');
    const defaultModelStatus = document.getElementById('defaultModelStatus');
    
    const hint = document.getElementById('modelHint');
    const modelInput = document.getElementById('model');

    // Default visibility: Hide all first
    apiKeyGroup.style.display = 'none';
    modelGroup.style.display = 'none';
    baseUrlGroup.style.display = 'none';
    ollamaHostGroup.style.display = 'none';
    chromeAiStatus.style.display = 'none';
    if(proxyStatus) proxyStatus.style.display = 'none';
    if(defaultModelStatus) defaultModelStatus.style.display = 'none';

    if (provider === 'default') {
        if(defaultModelStatus) defaultModelStatus.style.display = 'block';
        // 默认模型使用内置代理，不需要用户配置
    } else if (provider === 'deepseek') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        
        hint.textContent = t.hint_model_deepseek || '默认为 deepseek-chat';
        modelInput.placeholder = 'deepseek-chat';
    } else if (provider === 'chatgpt') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        baseUrlGroup.style.display = 'block'; // ChatGPT 也常需要代理
        
        hint.textContent = t.hint_model_chatgpt || '默认为 gpt-4o-mini';
        modelInput.placeholder = 'gpt-4o-mini';
    } else if (provider === 'gemini') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        
        hint.textContent = t.hint_model_gemini || '默认为 gemini-1.5-flash';
        modelInput.placeholder = 'gemini-1.5-flash';
    } 
    // Legacy support logic (hidden in UI but logic kept)
    else if (provider === 'chrome_builtin') {
        chromeAiStatus.style.display = 'block';
        checkChromeAIStatus();
    } else if (provider === 'ollama') {
        ollamaHostGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        hint.textContent = t.hint_model_ollama || '默认为 llama3';
        modelInput.placeholder = 'llama3';
    } else if (provider === 'doubao') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        hint.textContent = 'Endpoint ID (如 ep-2024...)';
        modelInput.placeholder = 'ep-2024xxxx';
    }
}

async function checkChromeAIStatus() {
    const statusText = document.getElementById('aiStatusText');
    const guide = document.getElementById('chromeAiGuide');
    const t = translations[currentLang] || translations['zh-CN'];
    
    // Reset guide visibility
    guide.style.display = 'none';

    if (!window.ai) {
        statusText.textContent = t.status_chrome_ai_unsupported || '❌ 当前浏览器不支持 window.ai (请查看下方指南)';
        statusText.style.color = '#d93025';
        guide.style.display = 'block';
        return;
    }
    
    try {
        const capabilities = await window.ai.languageModel.capabilities();
        if (capabilities.available === 'no') {
             statusText.textContent = t.status_chrome_ai_not_ready || '❌ 模型未就绪 (请检查 Flags 或等待下载)';
             statusText.style.color = '#d93025';
             guide.style.display = 'block';
        } else {
             statusText.textContent = t.status_chrome_ai_ready || '✅ Chrome 内置 AI 可用';
             statusText.style.color = '#188038';
        }
    } catch (e) {
        statusText.textContent = (t.status_chrome_ai_error || '⚠️ 检测失败: ') + e.message;
        statusText.style.color = '#f9ab00';
        guide.style.display = 'block';
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
    
    const date = new Date(item.timestamp).toLocaleString(currentLang);
    
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
  const t = translations[currentLang] || translations['zh-CN'];
  if (confirm(t.confirm_clear_history || '确定要清空所有历史记录吗？')) {
    chrome.storage.local.set({ history: [] }, () => {
      loadHistory();
    });
  }
}

function renderBlockedList(domains) {
  const list = document.getElementById('blockedList');
  const emptyMsg = document.getElementById('emptyListMsg');
  const t = translations[currentLang] || translations['zh-CN'];
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
      <button class="text-btn danger remove-btn" data-domain="${domain}">${t.btn_remove || '移除'}</button>
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

// Bookmark Tree Logic (CLI Style)
let contextMenuTargetNode = null;

function loadBookmarksTree() {
  chrome.bookmarks.getTree((bookmarkTreeNodes) => {
    const rootContainer = document.getElementById('bookmarkTreeRoot');
    rootContainer.innerHTML = ''; // Clear existing
    
    const cliContainer = document.createElement('div');
    cliContainer.className = 'cli-container';
    
    // Start from the top-level children (Bookmarks Bar, Other Bookmarks, etc.)
    if (bookmarkTreeNodes.length > 0 && bookmarkTreeNodes[0].children) {
        traverseBookmarksCLI(bookmarkTreeNodes[0].children, '', cliContainer);
    }
    
    rootContainer.appendChild(cliContainer);
  });
}

function traverseBookmarksCLI(nodes, prefix, container) {
    const t = translations[currentLang] || translations['zh-CN'];
    nodes.forEach((node, index) => {
        const isLast = index === nodes.length - 1;
        // Construct the tree connector strings
        const lineConnector = isLast ? '└── ' : '├── ';
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        
        const lineDiv = document.createElement('div');
        lineDiv.className = 'cli-line';
        
        // Bind data for context menu
        lineDiv.dataset.id = node.id;
        lineDiv.dataset.title = node.title;
        lineDiv.dataset.url = node.url || '';
        lineDiv.dataset.parentId = node.parentId;
        lineDiv.dataset.isFolder = !node.url;

        // Context Menu Event
        lineDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, lineDiv.dataset);
        });
        
        // 1. Prefix (The tree lines)
        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'cli-prefix';
        prefixSpan.textContent = prefix + lineConnector;
        
        // 2. Content (Folder or Link)
        const contentSpan = document.createElement('span');
        const isFolder = !node.url;
        
        if (isFolder) {
            contentSpan.className = 'cli-folder';
            contentSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align: text-bottom;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>${node.title || (t.untitled_folder || 'Untitled Folder')}/`; 
        } else {
            const link = document.createElement('a');
            link.className = 'cli-link';
            link.href = node.url;
            link.target = '_blank';
            link.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align: text-bottom;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>${node.title || node.url}`;
            // Prevent link click from triggering context menu on parent div (optional, but consistent)
            // Actually we want context menu on link too, so we don't stop propagation of contextmenu
            contentSpan.appendChild(link);
        }
        
        lineDiv.appendChild(prefixSpan);
        lineDiv.appendChild(contentSpan);
        container.appendChild(lineDiv);
        
        // 3. Recurse if folder
        if (isFolder && node.children) {
            traverseBookmarksCLI(node.children, childPrefix, container);
        }
    });
}

// --- Context Menu Logic ---
const contextMenu = document.getElementById('contextMenu');
const ctxEdit = document.getElementById('ctxEdit');
const ctxDelete = document.getElementById('ctxDelete');

document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
});

function showContextMenu(e, nodeData) {
    contextMenuTargetNode = nodeData;
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
}

ctxDelete.addEventListener('click', () => {
    if (!contextMenuTargetNode) return;
    const { id, title, isFolder } = contextMenuTargetNode;
    const t = translations[currentLang] || translations['zh-CN'];
    
    const typeName = isFolder === 'true' ? (t.type_folder || '文件夹') : (t.type_bookmark || '书签');
    const msg = (t.confirm_delete || '确定要删除{type} "{title}" 吗？{suffix}')
        .replace('{type}', typeName)
        .replace('{title}', title)
        .replace('{suffix}', isFolder === 'true' ? ('\n' + (t.confirm_delete_suffix || '(其内所有内容也将被删除)')) : '');

    if (confirm(msg)) {
        if (isFolder === 'true') {
            chrome.bookmarks.removeTree(id, () => loadBookmarksTree());
        } else {
            chrome.bookmarks.remove(id, () => loadBookmarksTree());
        }
    }
});

ctxEdit.addEventListener('click', () => {
    if (!contextMenuTargetNode) return;
    openEditModal(contextMenuTargetNode);
});

// --- Edit Modal Logic ---
const editModal = document.getElementById('editModal');
const closeModalBtn = document.getElementById('closeModal');
const cancelEditBtn = document.getElementById('cancelEdit');
const saveEditBtn = document.getElementById('saveEdit');

const editIdInput = document.getElementById('editId');
const editTitleInput = document.getElementById('editTitle');
const editUrlInput = document.getElementById('editUrl');
const editUrlGroup = document.getElementById('editUrlGroup');
const editParentIdInput = document.getElementById('editParentId');
const folderSelector = document.getElementById('folderSelector');

function openEditModal(nodeData) {
    editIdInput.value = nodeData.id;
    editTitleInput.value = nodeData.title;
    editUrlInput.value = nodeData.url;
    editParentIdInput.value = nodeData.parentId;
    
    if (nodeData.isFolder === 'true') {
        editUrlGroup.style.display = 'none';
    } else {
        editUrlGroup.style.display = 'block';
    }
    
    loadFolderSelector(nodeData.parentId); // Load tree and select current parent
    
    editModal.style.display = 'flex';
}

function closeEditModal() {
    editModal.style.display = 'none';
}

closeModalBtn.addEventListener('click', closeEditModal);
cancelEditBtn.addEventListener('click', closeEditModal);

saveEditBtn.addEventListener('click', () => {
    const id = editIdInput.value;
    const title = editTitleInput.value;
    const url = editUrlInput.value;
    const newParentId = editParentIdInput.value;
    
    // 1. Update Title/URL
    const changes = { title };
    if (editUrlGroup.style.display !== 'none') {
        changes.url = url;
    }
    
    chrome.bookmarks.update(id, changes, () => {
        // 2. Move if parent changed
        // We need to check if parent actually changed. 
        // Note: The contextMenuTargetNode.parentId might be stale if we didn't refresh, 
        // but here we are using the value from when modal opened.
        // To be safe, we just try to move. Chrome handles "move to same parent" gracefully usually.
        // But let's check against the original parentId stored in data attribute.
        
        if (newParentId && newParentId !== contextMenuTargetNode.parentId) {
             chrome.bookmarks.move(id, { parentId: newParentId }, () => {
                 closeEditModal();
                 loadBookmarksTree();
             });
        } else {
            closeEditModal();
            loadBookmarksTree();
        }
    });
});

// Load folders for the selector
function loadFolderSelector(selectedParentId) {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        folderSelector.innerHTML = '';
        if (bookmarkTreeNodes.length > 0) {
            // Usually index 0 is root, which contains "Bookmarks Bar", etc.
            // We want to allow selecting these top level folders too if possible, 
            // or just iterate their children. 
            // Chrome bookmarks root (id 0) usually has children id 1 (Bar) and 2 (Other).
            // We can't move things to Root (0), only to Bar or Other.
            
            const rootNode = bookmarkTreeNodes[0];
            traverseFolderTree(rootNode.children, 0, folderSelector, selectedParentId);
        }
    });
}

function traverseFolderTree(nodes, level, container, selectedParentId) {
    nodes.forEach(node => {
        // Only folders
        if (!node.url) {
            const div = document.createElement('div');
            div.className = 'folder-option';
            if (node.id === selectedParentId) {
                div.classList.add('selected');
            }
            
            // Indent
            let indentHtml = '';
            for(let i=0; i<level; i++) {
                indentHtml += '<span class="folder-indent"></span>';
            }
            
            // Icon
            const iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; vertical-align: text-bottom;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
            
            div.innerHTML = `${indentHtml}${iconHtml}${node.title}`;
            
            div.addEventListener('click', () => {
                // Deselect others
                document.querySelectorAll('.folder-option.selected').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                editParentIdInput.value = node.id;
            });
            
            container.appendChild(div);
            
            if (node.children) {
                traverseFolderTree(node.children, level + 1, container, selectedParentId);
            }
        }
    });
}
