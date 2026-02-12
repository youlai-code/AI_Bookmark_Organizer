import { initI18n, t } from '../utils/i18n.js';

let contextMenuTargetNode = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Apply theme first
  chrome.storage.sync.get({ theme: 'auto' }, (items) => {
      applyTheme(items.theme);
  });
  
  await initI18n();
  applyTranslations();
  loadBookmarksTree();
  
  // Close context menu on click elsewhere
  document.addEventListener('click', () => {
    document.getElementById('contextMenu').style.display = 'none';
  });

  // Bind context menu actions
  document.getElementById('ctxEdit').addEventListener('click', handleEdit);
  document.getElementById('ctxDelete').addEventListener('click', handleDelete);
  
  // Bind modal actions
  document.getElementById('closeModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('saveEdit').addEventListener('click', saveEdit);
  
  // Search functionality
  document.getElementById('search').addEventListener('input', handleSearch);

  // Listen for language changes
  window.addEventListener('i18nChanged', () => {
    applyTranslations();
    // Re-render tree if needed (though tree content comes from bookmarks API, 
    // context menu labels are static HTML, so applyTranslations covers them.
    // If tree nodes have static text (like 'Untitled Folder'), we might need to re-render.
    loadBookmarksTree(); 
  });
});

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = t(key);
    if (message) el.textContent = message;
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = t(key);
    if (message) el.placeholder = message;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = t(key);
    if (message) el.title = message;
  });

  const appName = t('appNameShort') || t('appName');
  const pageName = t('navBookmarks') || '收藏夹树';
  if (appName && pageName) {
    document.title = `${appName} - ${pageName}`;
  } else if (appName) {
    document.title = appName;
  }
}

function loadBookmarksTree() {
  chrome.bookmarks.getTree((bookmarkTreeNodes) => {
    const rootContainer = document.getElementById('bookmarkTree');
    rootContainer.innerHTML = '';
    
    const cliContainer = document.createElement('div');
    cliContainer.className = 'cli-container';
    
    if (bookmarkTreeNodes.length > 0 && bookmarkTreeNodes[0].children) {
      traverseBookmarksCLI(bookmarkTreeNodes[0].children, '', cliContainer);
    }
    
    rootContainer.appendChild(cliContainer);
  });
}

function traverseBookmarksCLI(nodes, prefix, container) {
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const lineConnector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    
    const lineDiv = document.createElement('div');
    lineDiv.className = 'cli-line';
    
    // Store data for context menu
    lineDiv.dataset.id = node.id;
    lineDiv.dataset.title = node.title;
    lineDiv.dataset.url = node.url || '';
    lineDiv.dataset.parentId = node.parentId;
    lineDiv.dataset.isFolder = !node.url;

    lineDiv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, lineDiv.dataset);
    });
    
    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'cli-prefix';
    prefixSpan.textContent = prefix + lineConnector;
    
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
      contentSpan.appendChild(link);
    }
    
    lineDiv.appendChild(prefixSpan);
    lineDiv.appendChild(contentSpan);
    container.appendChild(lineDiv);
    
    if (isFolder && node.children) {
      traverseBookmarksCLI(node.children, childPrefix, container);
    }
  });
}

function showContextMenu(e, nodeData) {
  contextMenuTargetNode = nodeData;
  const menu = document.getElementById('contextMenu');
  menu.style.display = 'block';
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
}

function handleDelete() {
  if (!contextMenuTargetNode) return;
  const { id, title, isFolder } = contextMenuTargetNode;
  
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
}

function handleEdit() {
  if (!contextMenuTargetNode) return;
  openEditModal(contextMenuTargetNode);
}

// --- Edit Modal Logic ---
function openEditModal(nodeData) {
  document.getElementById('editId').value = nodeData.id;
  document.getElementById('editTitle').value = nodeData.title;
  document.getElementById('editUrl').value = nodeData.url;
  document.getElementById('editParentId').value = nodeData.parentId;
  
  if (nodeData.isFolder === 'true') {
    document.getElementById('editUrlGroup').style.display = 'none';
  } else {
    document.getElementById('editUrlGroup').style.display = 'block';
  }
  
  loadFolderSelector(nodeData.parentId);
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

function saveEdit() {
  const id = document.getElementById('editId').value;
  const title = document.getElementById('editTitle').value;
  const url = document.getElementById('editUrl').value;
  const newParentId = document.getElementById('editParentId').value;
  const isFolder = document.getElementById('editUrlGroup').style.display === 'none';
  
  // 1. Update Title/URL
  const changes = { title };
  if (!isFolder) {
    changes.url = url;
  }
  
  chrome.bookmarks.update(id, changes, () => {
    // 2. Check if moved
    chrome.bookmarks.get(id, (results) => {
      const node = results[0];
      if (node.parentId !== newParentId) {
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
}

function loadFolderSelector(currentParentId) {
  chrome.bookmarks.getTree((tree) => {
    const selector = document.getElementById('folderSelector');
    selector.innerHTML = '';
    
    if (tree.length > 0 && tree[0].children) {
      traverseFolders(tree[0].children, 0, selector, currentParentId);
    }
  });
}

function traverseFolders(nodes, depth, container, currentParentId) {
  nodes.forEach(node => {
    if (!node.url) { // Is folder
      const div = document.createElement('div');
      div.className = 'folder-option';
      if (node.id === currentParentId) div.classList.add('selected');
      
      div.innerHTML = `<span class="folder-indent" style="width: ${depth * 20}px"></span>` +
                      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>` +
                      (node.title || 'Root');
                      
      div.addEventListener('click', () => {
        document.querySelectorAll('.folder-option').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        document.getElementById('editParentId').value = node.id;
      });
      
      container.appendChild(div);
      
      if (node.children) {
        traverseFolders(node.children, depth + 1, container, currentParentId);
      }
    }
  });
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  const lines = document.querySelectorAll('.cli-line');
  
  if (!query) {
    lines.forEach(line => line.style.display = 'flex');
    return;
  }
  
  lines.forEach(line => {
    const title = (line.dataset.title || '').toLowerCase();
    const url = (line.dataset.url || '').toLowerCase();
    
    if (title.includes(query) || url.includes(query)) {
      line.style.display = 'flex';
      // Optional: highlight parent folders? For now just simple filtering
    } else {
      line.style.display = 'none';
    }
  });
}
