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

  // 3. Update page title
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
  pageTitle.textContent = titleMap[tabId] || t('navSettings');
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
      const titleMap = {
        'settings': '设置',
        'blocked': '屏蔽规则',
        'history': '历史记录'
      };
      pageTitle.textContent = titleMap[tabId] || '设置';
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
      allowNewFolders, enableSmartRename, showFloatingButton, language 
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
      document.getElementById('allowNewFolders').checked = items.allowNewFolders;
      document.getElementById('enableSmartRename').checked = items.enableSmartRename;
      document.getElementById('showFloatingButton').checked = items.showFloatingButton;
      document.getElementById('language').value = items.language;
      
      renderBlockedList(items.disabledDomains);
      updateUIState();
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
        
        hint.textContent = t('modelHintDeepSeek') || '默认为 deepseek-chat';
        modelInput.placeholder = 'deepseek-chat';
    } else if (provider === 'chatgpt') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        baseUrlGroup.style.display = 'block'; // ChatGPT 也常需要代理
        
        hint.textContent = t('modelHintChatGPT') || '默认为 gpt-4o-mini';
        modelInput.placeholder = 'gpt-4o-mini';
    } else if (provider === 'gemini') {
        apiKeyGroup.style.display = 'block';
        modelGroup.style.display = 'block';
        
        hint.textContent = t('modelHintGemini') || '默认为 gemini-1.5-flash';
        modelInput.placeholder = 'gemini-1.5-flash';
    } 
    // Legacy support logic (hidden in UI but logic kept)
    else if (provider === 'chrome_builtin') {
        chromeAiStatus.style.display = 'block';
        checkChromeAIStatus();
    } else if (provider === 'ollama') {
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

async function checkChromeAIStatus() {
    const statusText = document.getElementById('aiStatusText');
    const guide = document.getElementById('chromeAiGuide');
    
    // Reset guide visibility
    guide.style.display = 'none';

    if (!window.ai) {
        statusText.textContent = '❌ 当前浏览器不支持 window.ai (请查看下方指南)';
        statusText.style.color = '#d93025';
        guide.style.display = 'block';
        return;
    }
    
    try {
        const capabilities = await window.ai.languageModel.capabilities();
        if (capabilities.available === 'no') {
             statusText.textContent = '❌ 模型未就绪 (请检查 Flags 或等待下载)';
             statusText.style.color = '#d93025';
             guide.style.display = 'block';
        } else {
             statusText.textContent = '✅ Chrome 内置 AI 可用';
             statusText.style.color = '#188038';
        }
    } catch (e) {
        statusText.textContent = '⚠️ 检测失败: ' + e.message;
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
            contentSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align: text-bottom;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>${node.title || t('untitledFolder') || 'Untitled Folder'}/`; 
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
    
    const typeFolder = t('typeFolder') || '文件夹';
    const typeBookmark = t('typeBookmark') || '书签';
    const typeName = isFolder === 'true' ? typeFolder : typeBookmark;
    
    const confirmMsg = isFolder === 'true' 
        ? (t('confirmDeleteFolder', { title }) || `确定要删除文件夹 "${title}" 吗？\n(其内所有内容也将被删除)`)
        : (t('confirmDeleteBookmark', { title }) || `确定要删除书签 "${title}" 吗？`);

    if (confirm(confirmMsg)) {
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
