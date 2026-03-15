import { initI18n, t } from '../utils/i18n.js';
import {
  classifyWithLLM,
  ensureLLMConfiguration,
  LLM_CONFIG_ERROR_CODE,
  isLLMDailyLimitError,
  isLLMRateLimitError,
  getDailyQuotaStatus,
  DAILY_USAGE_STORAGE_KEY
} from '../utils/llm.js';
import { createOrGetFolder, moveBookmark, getExistingFolderNames } from '../utils/bookmark.js';
import { createBookmarkBackup, formatBackupTimestamp } from '../utils/bookmark_backup.js';
import { DAILY_REQUEST_LIMIT } from '../config/app.config.js';

let contextMenuTargetNode = null;
let selectionAnchorIndex = null;
const selectedNodeIds = new Set();
const orderedNodeIds = [];
const nodeMetaMap = new Map();
const nodeChildrenMap = new Map();
let currentBookmarkCount = 0;
const BULK_PREVIEW_LIMIT = 60;
const BULK_CONCURRENCY = 3;
const bulkReviewModalState = {
  resolver: null,
  selectable: false,
  confirmTextBase: '',
  allRowIds: [],
  selectedRowIds: new Set(),
  checkboxMap: new Map()
};
const treeDragState = {
  active: false,
  sourceNodeId: null,
  sourceNodeIds: [],
  sourceIsFolder: false,
  targetNodeId: null,
  dropMode: null
};
let isDragMoveInProgress = false;

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
  document.getElementById('ctxNewFolder').addEventListener('click', handleCreateFolder);
  document.getElementById('ctxDeleteKeepBookmarks').addEventListener('click', handleDeleteKeepBookmarks);
  document.getElementById('ctxDelete').addEventListener('click', handleDelete);
  document.getElementById('selectAll').addEventListener('click', selectAll);
  document.getElementById('clearSelection').addEventListener('click', clearSelection);
  document.getElementById('manualBackupCurrent').addEventListener('click', handleManualBackupCurrent);
  document.getElementById('bulkSortTree').addEventListener('click', handleBulkSortTree);
  document.getElementById('bulkRenameSelected').addEventListener('click', handleBulkRenameSelected);
  document.getElementById('bulkClassifySelected').addEventListener('click', handleBulkClassifySelected);
  document.getElementById('checkInvalidSelected').addEventListener('click', handleCheckInvalidSelected);
  document.getElementById('deleteSelectedBookmarks').addEventListener('click', handleDeleteSelectedBookmarks);
  
  // Bind modal actions
  document.getElementById('closeModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('saveEdit').addEventListener('click', saveEdit);
  document.getElementById('closeBulkReview').addEventListener('click', () => resolveBulkReview(false));
  document.getElementById('bulkReviewCancel').addEventListener('click', () => resolveBulkReview(false));
  document.getElementById('bulkReviewConfirm').addEventListener('click', handleBulkReviewConfirm);
  document.getElementById('bulkReviewSelectAll').addEventListener('click', () => setBulkReviewSelectionForAll(true));
  document.getElementById('bulkReviewSelectNone').addEventListener('click', () => setBulkReviewSelectionForAll(false));
  document.getElementById('bulkReviewModal').addEventListener('click', (e) => {
    if (e.target.id === 'bulkReviewModal') {
      resolveBulkReview(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const bulkModal = document.getElementById('bulkReviewModal');
    if (bulkModal && bulkModal.style.display === 'flex') {
      resolveBulkReview(false);
    }
  });
  
  // Search functionality
  document.getElementById('search').addEventListener('input', handleSearch);
  updateDailyQuotaSummary();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[DAILY_USAGE_STORAGE_KEY]) {
      updateDailyQuotaSummary();
      return;
    }
    if (area === 'sync' && changes.llmProvider) {
      updateDailyQuotaSummary();
    }
  });

  // Listen for language changes
  window.addEventListener('i18nChanged', () => {
    applyTranslations();
    // Re-render tree if needed (though tree content comes from bookmarks API, 
    // context menu labels are static HTML, so applyTranslations covers them.
    // If tree nodes have static text (like 'Untitled Folder'), we might need to re-render.
    loadBookmarksTree();
    updateDailyQuotaSummary();
  });
});

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = t(key);
    if (message && message !== key) el.textContent = message;
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = t(key);
    if (message && message !== key) el.placeholder = message;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = t(key);
    if (message && message !== key) el.title = message;
  });

  const manualBackupButton = document.getElementById('manualBackupCurrent');
  if (manualBackupButton) {
    manualBackupButton.textContent = tr('manualBackupCurrent', '备份当前书签');
  }

  const newFolderLabel = document.querySelector('#ctxNewFolder span');
  if (newFolderLabel) {
    newFolderLabel.textContent = tr('ctxNewFolder', '新建收藏夹');
  }

  const deleteKeepLabel = document.querySelector('#ctxDeleteKeepBookmarks span');
  if (deleteKeepLabel) {
    deleteKeepLabel.textContent = tr('ctxDeleteKeepBookmarks', '删除文件夹并保留书签');
  }

  updateManagerTitleWithCount(currentBookmarkCount);
  updateSelectionSummary();
}

function loadBookmarksTree() {
  chrome.bookmarks.getTree((bookmarkTreeNodes) => {
    clearTreeDragState();
    selectionAnchorIndex = null;
    orderedNodeIds.length = 0;
    nodeMetaMap.clear();
    nodeChildrenMap.clear();
    pruneInvalidSelectionIds(bookmarkTreeNodes);

    const rootContainer = document.getElementById('bookmarkTree');
    rootContainer.innerHTML = '';
    
    const cliContainer = document.createElement('div');
    cliContainer.className = 'cli-container';
    const stats = { bookmarkCount: 0 };
    
    if (bookmarkTreeNodes.length > 0 && bookmarkTreeNodes[0].children) {
      traverseBookmarksCLI(bookmarkTreeNodes[0].children, '', cliContainer, stats);
    }
    
    rootContainer.appendChild(cliContainer);
    currentBookmarkCount = stats.bookmarkCount;
    updateManagerTitleWithCount(currentBookmarkCount);
    updateSelectionUI();
  });
}

function traverseBookmarksCLI(nodes, prefix, container, stats) {
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const lineConnector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    const isFolder = !node.url;
    if (!isFolder) stats.bookmarkCount += 1;
    
    const lineDiv = document.createElement('div');
    lineDiv.className = 'cli-line';
    
    // Store data for context menu
    lineDiv.dataset.id = node.id;
    lineDiv.dataset.title = node.title;
    lineDiv.dataset.url = node.url || '';
    lineDiv.dataset.parentId = node.parentId;
    lineDiv.dataset.isFolder = isFolder;

    orderedNodeIds.push(node.id);
    nodeMetaMap.set(node.id, {
      id: node.id,
      title: node.title || '',
      isFolder,
      parentId: node.parentId || ''
    });
    registerChildNode(node.parentId || '', node.id);

    const selectBox = document.createElement('input');
    selectBox.type = 'checkbox';
    selectBox.className = 'cli-select';
    if (isFolder) {
      selectBox.classList.add('cli-select-folder');
    } else {
      selectBox.classList.add('cli-select-bookmark');
    }
    selectBox.checked = selectedNodeIds.has(node.id);
    selectBox.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSelectionByInteraction(node.id, e, true);
    });

    lineDiv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const alreadySelected = isFolder ? isFolderSelectionActive(node.id) : selectedNodeIds.has(node.id);
      if (!alreadySelected) {
        selectedNodeIds.clear();
        addNodeSelection(node.id);
        updateSelectionUI();
      }
      showContextMenu(e, lineDiv.dataset);
    });

    lineDiv.addEventListener('click', (e) => {
      if (eventComesFrom(e, '.cli-link')) return;
      updateSelectionByInteraction(node.id, e);
    });

    lineDiv.draggable = true;
    lineDiv.classList.add('cli-line-draggable');
    lineDiv.addEventListener('dragstart', (e) => {
      handleNodeDragStart(e, node.id, lineDiv);
    });
    lineDiv.addEventListener('dragend', handleNodeDragEnd);
    lineDiv.addEventListener('dragover', (e) => {
      handleLineDragOver(e, node.id, lineDiv);
    });
    lineDiv.addEventListener('dragleave', (e) => {
      handleLineDragLeave(e, node.id, lineDiv);
    });
    lineDiv.addEventListener('drop', (e) => {
      void handleLineDrop(e, node.id);
    });
    
    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'cli-prefix';
    prefixSpan.textContent = prefix + lineConnector;
    
    const contentSpan = document.createElement('span');
    
    if (isFolder) {
      contentSpan.className = 'cli-folder';
      contentSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align: text-bottom;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>${node.title || t('untitledFolder') || 'Untitled Folder'}/`; 
    } else {
      const link = document.createElement('a');
      link.className = 'cli-link';
      link.href = node.url;
      link.target = '_blank';
      link.draggable = false;
      link.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align: text-bottom;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>${node.title || node.url}`;
      contentSpan.appendChild(link);
    }
    
    lineDiv.appendChild(selectBox);
    lineDiv.appendChild(prefixSpan);
    lineDiv.appendChild(contentSpan);
    container.appendChild(lineDiv);
    
    if (isFolder && node.children) {
      traverseBookmarksCLI(node.children, childPrefix, container, stats);
    }
  });
}

function getDragNodeIds(nodeId, isFolder) {
  if (isFolder) {
    return [nodeId];
  }

  const explicitSelectedBookmarkIds = Array.from(selectedNodeIds).filter((id) => {
    const meta = nodeMetaMap.get(id);
    return meta && !meta.isFolder;
  });

  if (explicitSelectedBookmarkIds.length > 1 && explicitSelectedBookmarkIds.includes(nodeId)) {
    return explicitSelectedBookmarkIds;
  }

  return [nodeId];
}

function getDragOrderedIds(sourceNodeIds) {
  const sourceIdSet = new Set(sourceNodeIds);
  const orderedIds = orderedNodeIds.filter(id => sourceIdSet.has(id));
  return orderedIds.length > 0 ? orderedIds : sourceNodeIds;
}

function getDropMode(targetMeta, event, lineDiv) {
  const rect = lineDiv.getBoundingClientRect();
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;

  if (targetMeta.isFolder) {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'into';
  }

  return ratio < 0.5 ? 'before' : 'after';
}

function getDropParentId(targetNodeId, targetMeta, dropMode) {
  if (dropMode === 'into' && targetMeta.isFolder) {
    return targetNodeId;
  }
  return targetMeta.parentId || null;
}

function isNodeDescendant(nodeId, ancestorId) {
  let currentId = nodeId;
  while (currentId) {
    if (currentId === ancestorId) return true;
    const meta = nodeMetaMap.get(currentId);
    if (!meta || !meta.parentId) return false;
    currentId = meta.parentId;
  }
  return false;
}

function canDropOnTarget(targetNodeId, dropMode) {
  if (!treeDragState.active || treeDragState.sourceNodeIds.length === 0) return false;
  const targetMeta = nodeMetaMap.get(targetNodeId);
  if (!targetMeta || !dropMode) return false;

  const dropParentId = getDropParentId(targetNodeId, targetMeta, dropMode);
  if (!dropParentId) return false;

  if (treeDragState.sourceNodeIds.includes(targetNodeId)) {
    return false;
  }

  if (treeDragState.sourceIsFolder) {
    const sourceId = treeDragState.sourceNodeIds[0];
    if (!sourceId) return false;
    if (dropParentId === sourceId) return false;
    if (isNodeDescendant(dropParentId, sourceId)) return false;
    return true;
  }

  return treeDragState.sourceNodeIds.some((sourceId) => {
    const sourceMeta = nodeMetaMap.get(sourceId);
    return sourceMeta && !sourceMeta.isFolder;
  });
}

function clearDropTargetIndicators() {
  document.querySelectorAll('.cli-line-drop-into, .cli-line-drop-before, .cli-line-drop-after').forEach((line) => {
    line.classList.remove('cli-line-drop-into', 'cli-line-drop-before', 'cli-line-drop-after');
  });
}

function clearTreeDragState() {
  treeDragState.active = false;
  treeDragState.sourceNodeId = null;
  treeDragState.sourceNodeIds = [];
  treeDragState.sourceIsFolder = false;
  treeDragState.targetNodeId = null;
  treeDragState.dropMode = null;

  clearDropTargetIndicators();
  document.querySelectorAll('.cli-line-dragging').forEach((line) => {
    line.classList.remove('cli-line-dragging');
  });
  document.body.classList.remove('tree-dragging');
}

function getEventTargetElement(event) {
  const target = event.target;
  if (target instanceof Element) {
    return target;
  }
  if (target && target.parentElement instanceof Element) {
    return target.parentElement;
  }
  return null;
}

function eventComesFrom(event, selector) {
  const targetEl = getEventTargetElement(event);
  return targetEl ? !!targetEl.closest(selector) : false;
}

function handleNodeDragStart(event, nodeId, lineDiv) {
  if (isDragMoveInProgress || eventComesFrom(event, '.cli-select') || eventComesFrom(event, '.cli-link')) {
    event.preventDefault();
    return;
  }

  const nodeMeta = nodeMetaMap.get(nodeId);
  if (!nodeMeta || nodeMeta.isFolder) {
    event.preventDefault();
    return;
  }

  const sourceNodeIds = getDragNodeIds(nodeId, nodeMeta.isFolder);
  if (sourceNodeIds.length === 0) {
    event.preventDefault();
    return;
  }

  treeDragState.active = true;
  treeDragState.sourceNodeId = nodeId;
  treeDragState.sourceNodeIds = sourceNodeIds;
  treeDragState.sourceIsFolder = nodeMeta.isFolder;
  treeDragState.targetNodeId = null;
  treeDragState.dropMode = null;

  lineDiv.classList.add('cli-line-dragging');
  document.body.classList.add('tree-dragging');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sourceNodeIds.join(','));
  }
}

function handleNodeDragEnd() {
  clearTreeDragState();
}

function applyDropIndicator(lineDiv, dropMode) {
  lineDiv.classList.remove('cli-line-drop-into', 'cli-line-drop-before', 'cli-line-drop-after');

  if (dropMode === 'into') {
    lineDiv.classList.add('cli-line-drop-into');
  } else if (dropMode === 'before') {
    lineDiv.classList.add('cli-line-drop-before');
  } else if (dropMode === 'after') {
    lineDiv.classList.add('cli-line-drop-after');
  }
}

function handleLineDragOver(event, targetNodeId, lineDiv) {
  if (!treeDragState.active || isDragMoveInProgress) return;
  const targetMeta = nodeMetaMap.get(targetNodeId);
  if (!targetMeta) return;

  const dropMode = getDropMode(targetMeta, event, lineDiv);
  if (!canDropOnTarget(targetNodeId, dropMode)) {
    if (treeDragState.targetNodeId === targetNodeId) {
      lineDiv.classList.remove('cli-line-drop-into', 'cli-line-drop-before', 'cli-line-drop-after');
      treeDragState.targetNodeId = null;
      treeDragState.dropMode = null;
    }
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }

  if (treeDragState.targetNodeId !== targetNodeId || treeDragState.dropMode !== dropMode) {
    clearDropTargetIndicators();
    applyDropIndicator(lineDiv, dropMode);
    treeDragState.targetNodeId = targetNodeId;
    treeDragState.dropMode = dropMode;
  }
}

function handleLineDragLeave(event, targetNodeId, lineDiv) {
  if (treeDragState.targetNodeId !== targetNodeId) return;
  if (event.relatedTarget && lineDiv.contains(event.relatedTarget)) return;

  lineDiv.classList.remove('cli-line-drop-into', 'cli-line-drop-before', 'cli-line-drop-after');
  treeDragState.targetNodeId = null;
  treeDragState.dropMode = null;
}

async function resolveDropDestination(targetNodeId, dropMode) {
  const targetMeta = nodeMetaMap.get(targetNodeId);
  if (!targetMeta) return null;

  const parentId = getDropParentId(targetNodeId, targetMeta, dropMode);
  if (!parentId) return null;

  if (dropMode === 'into') {
    return { parentId, index: null };
  }

  const siblings = await chrome.bookmarks.getChildren(parentId);
  const targetIndex = siblings.findIndex(node => node.id === targetNodeId);
  if (targetIndex < 0) return null;

  const index = dropMode === 'after' ? targetIndex + 1 : targetIndex;
  return { parentId, index, siblings };
}

function normalizeInsertIndex(index, siblings, movingIds) {
  if (typeof index !== 'number' || !Array.isArray(siblings) || siblings.length === 0) return index;
  const movingSet = new Set(movingIds);
  let adjusted = index;

  for (let i = 0; i < index; i += 1) {
    if (movingSet.has(siblings[i].id)) {
      adjusted -= 1;
    }
  }

  return Math.max(adjusted, 0);
}

async function moveNodes(sourceNodeIds, destination) {
  const moveOrder = getDragOrderedIds(sourceNodeIds);
  if (moveOrder.length === 0) return { moved: 0, failed: 0 };

  let insertIndex = destination.index;
  if (typeof insertIndex === 'number') {
    const siblings = destination.siblings || await chrome.bookmarks.getChildren(destination.parentId);
    insertIndex = normalizeInsertIndex(insertIndex, siblings, moveOrder);
  }

  let moved = 0;
  let failed = 0;

  for (const nodeId of moveOrder) {
    const meta = nodeMetaMap.get(nodeId);
    if (!meta) continue;

    const options = { parentId: destination.parentId };
    if (typeof insertIndex === 'number') {
      options.index = insertIndex;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await chrome.bookmarks.move(nodeId, options);
      moved += 1;
      if (typeof insertIndex === 'number') {
        insertIndex += 1;
      }
    } catch (error) {
      failed += 1;
    }
  }

  return { moved, failed };
}

async function handleLineDrop(event, targetNodeId) {
  event.preventDefault();
  event.stopPropagation();

  const dropMode = treeDragState.dropMode;
  if (!canDropOnTarget(targetNodeId, dropMode) || isDragMoveInProgress) {
    clearTreeDragState();
    return;
  }

  isDragMoveInProgress = true;
  const sourceNodeIds = [...treeDragState.sourceNodeIds];

  try {
    const destination = await resolveDropDestination(targetNodeId, dropMode);
    if (!destination) {
      return;
    }

    const result = await moveNodes(sourceNodeIds, destination);
    if (result.moved > 0) {
      loadBookmarksTree();
    }
    if (result.failed > 0) {
      showBulkResult(
        t('dragMovePartialFailed', { failed: String(result.failed) }) ||
        `Some bookmarks failed to move (${result.failed}).`
      );
    }
  } finally {
    isDragMoveInProgress = false;
    clearTreeDragState();
  }
}

function updateManagerTitleWithCount(count) {
  const baseTitle = t('managerTitle') || 'AI书签整理 · 收藏夹树';
  const finalTitle = `${baseTitle} （${count}）`;

  const titleEl = document.querySelector('[data-i18n="managerTitle"]');
  if (titleEl) {
    titleEl.textContent = finalTitle;
  }
  document.title = finalTitle;
}

function updateSelectionByInteraction(nodeId, event, fromCheckbox = false) {
  const currentIndex = orderedNodeIds.indexOf(nodeId);
  if (currentIndex < 0) return;
  const meta = nodeMetaMap.get(nodeId);

  if (fromCheckbox && !event.shiftKey) {
    if (meta && meta.isFolder) {
      toggleFolderDescendantSelection(nodeId);
      selectionAnchorIndex = currentIndex;
      updateSelectionUI();
      return;
    }

    if (selectedNodeIds.has(nodeId)) {
      selectedNodeIds.delete(nodeId);
    } else {
      selectedNodeIds.add(nodeId);
    }
    selectionAnchorIndex = currentIndex;
    updateSelectionUI();
    return;
  }

  if (event.shiftKey && selectionAnchorIndex !== null) {
    const start = Math.min(selectionAnchorIndex, currentIndex);
    const end = Math.max(selectionAnchorIndex, currentIndex);

    if (!event.ctrlKey && !event.metaKey) {
      selectedNodeIds.clear();
    }

    for (let i = start; i <= end; i += 1) {
      addNodeSelection(orderedNodeIds[i]);
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (meta && meta.isFolder) {
      toggleFolderDescendantSelection(nodeId);
    } else {
      if (selectedNodeIds.has(nodeId)) {
        selectedNodeIds.delete(nodeId);
      } else {
        selectedNodeIds.add(nodeId);
      }
    }
    selectionAnchorIndex = currentIndex;
  } else {
    let shouldClearSelection = false;

    if (meta && meta.isFolder) {
      const descendantBookmarkIds = getDescendantBookmarkIds(nodeId);
      const selectedDescendantCount = descendantBookmarkIds.reduce((count, id) => (
        count + (selectedNodeIds.has(id) ? 1 : 0)
      ), 0);
      const onlyThisFolderSelected = selectedDescendantCount > 0 && selectedNodeIds.size === selectedDescendantCount;
      shouldClearSelection = onlyThisFolderSelected;
    } else if (selectedNodeIds.has(nodeId) && selectedNodeIds.size === 1) {
      shouldClearSelection = true;
    }

    if (shouldClearSelection) {
      selectedNodeIds.clear();
      selectionAnchorIndex = null;
    } else {
      selectedNodeIds.clear();
      addNodeSelection(nodeId);
      selectionAnchorIndex = currentIndex;
    }
  }

  updateSelectionUI();
}

function clearSelection() {
  selectedNodeIds.clear();
  selectionAnchorIndex = null;
  updateSelectionUI();
}

function getVisibleNodeIds() {
  const ids = [];
  document.querySelectorAll('.cli-line').forEach((line) => {
    if (line.style.display === 'none') return;
    if (!line.dataset.id) return;
    ids.push(line.dataset.id);
  });
  return ids;
}

function selectAll() {
  selectedNodeIds.clear();
  const visibleNodeIds = getVisibleNodeIds();

  visibleNodeIds.forEach((id) => {
    const meta = nodeMetaMap.get(id);
    if (!meta) return;
    if (meta.isFolder) {
      getDescendantBookmarkIds(id).forEach((childBookmarkId) => selectedNodeIds.add(childBookmarkId));
    } else {
      selectedNodeIds.add(id);
    }
  });

  if (visibleNodeIds.length === 0) {
    selectionAnchorIndex = null;
  } else {
    const lastVisibleId = visibleNodeIds[visibleNodeIds.length - 1];
    selectionAnchorIndex = orderedNodeIds.indexOf(lastVisibleId);
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  Array.from(selectedNodeIds).forEach((id) => {
    const meta = nodeMetaMap.get(id);
    if (meta && meta.isFolder) {
      selectedNodeIds.delete(id);
    }
  });

  document.querySelectorAll('.cli-line').forEach(line => {
    const nodeId = line.dataset.id;
    const meta = nodeMetaMap.get(nodeId);
    let isSelected = selectedNodeIds.has(nodeId);

    const box = line.querySelector('.cli-select');
    if (box) {
      box.indeterminate = false;

      if (meta && meta.isFolder) {
        const descendantBookmarkIds = getDescendantBookmarkIds(nodeId);
        if (descendantBookmarkIds.length > 0) {
          const selectedCount = descendantBookmarkIds.reduce((acc, id) => acc + (selectedNodeIds.has(id) ? 1 : 0), 0);
          const allSelected = selectedCount === descendantBookmarkIds.length;
          const partialSelected = selectedCount > 0 && selectedCount < descendantBookmarkIds.length;
          box.checked = allSelected;
          box.indeterminate = partialSelected;
          isSelected = isSelected || selectedCount > 0;
        } else {
          box.checked = isSelected;
        }
      } else {
        box.checked = isSelected;
      }
    }

    line.classList.toggle('selected', isSelected);
  });

  updateSelectionSummary();
}

function updateSelectionSummary() {
  const summaryEl = document.getElementById('selectionSummary');
  if (!summaryEl) return;

  const count = getSelectedBookmarkIds().length;
  const text = t('selectionSummary', { count: String(count) }) || `已选 ${count} 项`;
  summaryEl.textContent = text;
}

async function updateDailyQuotaSummary() {
  const quotaEl = document.getElementById('dailyQuotaSummary');
  if (!quotaEl) return;

  try {
    const quota = await getDailyQuotaStatus();
    if (!quota.tracked) {
      quotaEl.textContent = tr(
        'dailyQuotaExternal',
        `Quota managed by ${quota.providerName || 'custom provider'}`,
        { provider: quota.providerName || 'custom provider' }
      );
      quotaEl.classList.remove('quota-low');
      return;
    }

    const message = tr(
      'dailyQuotaRemaining',
      `Today remaining: ${quota.remaining}/${quota.limit}`,
      { remaining: String(quota.remaining), limit: String(quota.limit) }
    );
    quotaEl.textContent = message;
    quotaEl.classList.toggle('quota-low', quota.remaining <= 10);
  } catch (err) {
    quotaEl.textContent = tr(
      'dailyQuotaUnavailable',
      `Today remaining: --/${DAILY_REQUEST_LIMIT}`,
      { limit: String(DAILY_REQUEST_LIMIT) }
    );
    quotaEl.classList.remove('quota-low');
  }
}

function pruneInvalidSelectionIds(treeNodes) {
  const validIds = new Set();

  const walk = (nodes) => {
    (nodes || []).forEach(node => {
      validIds.add(node.id);
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    });
  };

  if (treeNodes && treeNodes.length > 0) {
    walk(treeNodes[0].children || []);
  }

  Array.from(selectedNodeIds).forEach(id => {
    if (!validIds.has(id)) selectedNodeIds.delete(id);
  });
}

function registerChildNode(parentId, childId) {
  if (!nodeChildrenMap.has(parentId)) {
    nodeChildrenMap.set(parentId, []);
  }
  nodeChildrenMap.get(parentId).push(childId);
}

function getDescendantBookmarkIds(folderId) {
  const result = [];
  const stack = [folderId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    const children = nodeChildrenMap.get(currentId) || [];
    children.forEach(childId => {
      const meta = nodeMetaMap.get(childId);
      if (!meta) return;
      if (meta.isFolder) {
        stack.push(childId);
      } else {
        result.push(childId);
      }
    });
  }

  return result;
}

function isFolderSelectionActive(folderId) {
  const descendantBookmarkIds = getDescendantBookmarkIds(folderId);
  if (descendantBookmarkIds.length === 0) return false;
  return descendantBookmarkIds.some(id => selectedNodeIds.has(id));
}

function toggleFolderDescendantSelection(folderId, forceSelect = null) {
  const descendantBookmarkIds = getDescendantBookmarkIds(folderId);
  if (descendantBookmarkIds.length === 0) return false;

  const allSelected = descendantBookmarkIds.every(id => selectedNodeIds.has(id));
  const shouldSelect = forceSelect === null ? !allSelected : !!forceSelect;

  descendantBookmarkIds.forEach((id) => {
    if (shouldSelect) {
      selectedNodeIds.add(id);
    } else {
      selectedNodeIds.delete(id);
    }
  });

  return true;
}

function addNodeSelection(nodeId) {
  const meta = nodeMetaMap.get(nodeId);
  if (!meta) return;
  if (meta.isFolder) {
    toggleFolderDescendantSelection(nodeId, true);
  } else {
    selectedNodeIds.add(nodeId);
  }
}

function getSelectedBookmarkIds() {
  const bookmarkIds = new Set();

  selectedNodeIds.forEach(id => {
    const meta = nodeMetaMap.get(id);
    if (!meta) return;

    if (meta.isFolder) {
      getDescendantBookmarkIds(id).forEach(childBookmarkId => bookmarkIds.add(childBookmarkId));
    } else {
      bookmarkIds.add(id);
    }
  });

  return Array.from(bookmarkIds);
}

function getBookmarksByIds(ids) {
  return new Promise(resolve => {
    if (!ids || ids.length === 0) {
      resolve([]);
      return;
    }

    chrome.bookmarks.get(ids, nodes => {
      resolve((nodes || []).filter(node => !!node.url));
    });
  });
}

function setBulkButtonsDisabled(disabled) {
  [
    'selectAll',
    'clearSelection',
    'manualBackupCurrent',
    'bulkSortTree',
    'bulkRenameSelected',
    'bulkClassifySelected',
    'checkInvalidSelected',
    'deleteSelectedBookmarks'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

function tr(key, fallback, replacements = {}) {
  const translated = t(key, replacements);
  if (!translated || translated === key) return fallback;
  return translated;
}

function getBulkActionLabel(actionKey) {
  if (actionKey === 'sort') return tr('bulkActionLabelSort', '排序');
  if (actionKey === 'rename') return tr('bulkActionLabelRename', '重命名');
  if (actionKey === 'classify') return tr('bulkActionLabelClassify', '分类');
  if (actionKey === 'check') return tr('bulkActionLabelCheck', '失效检测');
  if (actionKey === 'delete') return tr('bulkActionLabelDelete', '删除');
  return tr('bulkActionLabelDefault', '批量处理');
}

function getBulkPhaseLabel(actionKey, phase) {
  if (phase === 'analyze') {
    if (actionKey === 'check') return tr('bulkPhaseCheck', '检测中');
    return tr('bulkPhaseAnalyze', '分析中');
  }
  if (phase === 'apply') return tr('bulkPhaseApply', '应用中');
  if (phase === 'done') return tr('bulkPhaseDone', '完成');
  return tr('bulkPhaseRunning', '处理中');
}

function formatBulkProgress(actionKey, phase, current, total) {
  const safeTotal = Math.max(Number(total) || 0, 1);
  const safeCurrent = Math.min(Math.max(Number(current) || 0, 0), safeTotal);
  const percent = Math.round((safeCurrent / safeTotal) * 100);
  const actionLabel = (getBulkActionLabel(actionKey) || '').trim();
  const phaseLabel = (getBulkPhaseLabel(actionKey, phase) || '').trim();

  let progressLabel = '';
  if (!actionLabel) {
    progressLabel = phaseLabel;
  } else if (!phaseLabel) {
    progressLabel = actionLabel;
  } else {
    const normalizedAction = actionLabel.replace(/\s+/g, '').toLowerCase();
    const normalizedPhase = phaseLabel.replace(/\s+/g, '').toLowerCase();
    progressLabel = normalizedPhase.startsWith(normalizedAction)
      ? phaseLabel
      : `${actionLabel} ${phaseLabel}`;
  }

  return `${progressLabel} ${safeCurrent}/${safeTotal} (${percent}%)`;
}

function showBulkResult(message) {
  alert(message);
}

function createBulkReviewResult(confirmed) {
  if (!confirmed) {
    return { confirmed: false, selectedIds: [] };
  }
  if (!bulkReviewModalState.selectable) {
    return { confirmed: true, selectedIds: [] };
  }
  return {
    confirmed: true,
    selectedIds: Array.from(bulkReviewModalState.selectedRowIds)
  };
}

function updateBulkReviewSelectionState() {
  const selectionStateEl = document.getElementById('bulkReviewSelectionState');
  const confirmBtn = document.getElementById('bulkReviewConfirm');
  if (!confirmBtn) return;

  if (!bulkReviewModalState.selectable) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = bulkReviewModalState.confirmTextBase || tr('bulkReviewConfirm', 'Confirm');
    if (selectionStateEl) selectionStateEl.textContent = '';
    return;
  }

  const selectedCount = bulkReviewModalState.selectedRowIds.size;
  const totalCount = bulkReviewModalState.allRowIds.length;

  if (selectionStateEl) {
    selectionStateEl.textContent = tr(
      'bulkReviewSelectedCount',
      `Selected ${selectedCount}/${totalCount}`,
      { selected: String(selectedCount), total: String(totalCount) }
    );
  }

  confirmBtn.disabled = selectedCount === 0;
  confirmBtn.textContent = `${bulkReviewModalState.confirmTextBase || tr('bulkReviewApply', 'Apply')} (${selectedCount})`;
}

function setBulkReviewRowSelected(rowId, selected) {
  if (selected) {
    bulkReviewModalState.selectedRowIds.add(rowId);
  } else {
    bulkReviewModalState.selectedRowIds.delete(rowId);
  }

  const checkbox = bulkReviewModalState.checkboxMap.get(rowId);
  if (checkbox) checkbox.checked = selected;
}

function setBulkReviewSelectionForAll(selected) {
  if (!bulkReviewModalState.selectable) return;
  bulkReviewModalState.allRowIds.forEach((rowId) => {
    setBulkReviewRowSelected(rowId, selected);
  });
  updateBulkReviewSelectionState();
}

function handleBulkReviewConfirm() {
  if (bulkReviewModalState.selectable && bulkReviewModalState.selectedRowIds.size === 0) return;
  resolveBulkReview(true);
}

function resolveBulkReview(result) {
  const modal = document.getElementById('bulkReviewModal');
  const finalResult = typeof result === 'boolean' ? createBulkReviewResult(result) : result;
  if (modal) {
    modal.style.display = 'none';
  }

  bulkReviewModalState.selectable = false;
  bulkReviewModalState.confirmTextBase = '';
  bulkReviewModalState.allRowIds = [];
  bulkReviewModalState.selectedRowIds.clear();
  bulkReviewModalState.checkboxMap.clear();

  if (bulkReviewModalState.resolver) {
    const resolver = bulkReviewModalState.resolver;
    bulkReviewModalState.resolver = null;
    resolver(finalResult || createBulkReviewResult(false));
  }
}

function openBulkReviewModal({
  title,
  description = '',
  summary = '',
  rows = [],
  confirmText,
  cancelText,
  showCancel = true,
  emphasize = 'default',
  selectable = false
}) {
  const modal = document.getElementById('bulkReviewModal');
  const titleEl = document.getElementById('bulkReviewTitle');
  const descriptionEl = document.getElementById('bulkReviewDescription');
  const summaryEl = document.getElementById('bulkReviewSummary');
  const listEl = document.getElementById('bulkReviewList');
  const toolbarEl = document.getElementById('bulkReviewToolbar');
  const selectionStateEl = document.getElementById('bulkReviewSelectionState');
  const selectAllBtn = document.getElementById('bulkReviewSelectAll');
  const selectNoneBtn = document.getElementById('bulkReviewSelectNone');
  const confirmBtn = document.getElementById('bulkReviewConfirm');
  const cancelBtn = document.getElementById('bulkReviewCancel');

  if (
    !modal
    || !titleEl
    || !descriptionEl
    || !summaryEl
    || !listEl
    || !confirmBtn
    || !cancelBtn
    || !toolbarEl
    || !selectionStateEl
    || !selectAllBtn
    || !selectNoneBtn
  ) {
    const confirmed = window.confirm(`${title}\n\n${summary}`);
    return Promise.resolve({
      confirmed,
      selectedIds: confirmed && selectable ? rows.map((row, index) => String(row.id || index)) : []
    });
  }

  bulkReviewModalState.selectable = selectable;
  bulkReviewModalState.confirmTextBase = confirmText || tr('bulkReviewConfirm', 'Confirm');
  bulkReviewModalState.allRowIds = [];
  bulkReviewModalState.selectedRowIds.clear();
  bulkReviewModalState.checkboxMap.clear();

  titleEl.textContent = title || tr('bulkReviewDefaultTitle', 'Batch action review');
  descriptionEl.textContent = description;
  summaryEl.textContent = summary;
  summaryEl.classList.toggle('bulk-review-summary-danger', emphasize === 'danger');
  toolbarEl.style.display = selectable ? 'flex' : 'none';
  selectionStateEl.textContent = '';
  selectAllBtn.textContent = tr('bulkReviewSelectAll', 'All');
  selectNoneBtn.textContent = tr('bulkReviewSelectNone', 'None');
  listEl.innerHTML = '';

  rows.forEach((row, index) => {
    const rowId = String(row.id ?? index);
    const rowSelectable = selectable && row.selectable !== false;
    const rowEl = document.createElement('div');
    rowEl.className = rowSelectable ? 'bulk-review-row bulk-review-row-selectable' : 'bulk-review-row';

    if (rowSelectable) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'bulk-review-check';
      checkbox.checked = true;
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => {
        setBulkReviewRowSelected(rowId, checkbox.checked);
        updateBulkReviewSelectionState();
      });

      bulkReviewModalState.allRowIds.push(rowId);
      bulkReviewModalState.selectedRowIds.add(rowId);
      bulkReviewModalState.checkboxMap.set(rowId, checkbox);
      rowEl.appendChild(checkbox);
    }

    const rowMain = document.createElement('div');
    rowMain.className = 'bulk-review-row-main';

    const rowTitle = document.createElement('div');
    rowTitle.className = 'bulk-review-row-title';
    rowTitle.textContent = row.title || '';
    rowMain.appendChild(rowTitle);

    if (row.detail) {
      const rowDetail = document.createElement('div');
      rowDetail.className = 'bulk-review-row-detail';
      rowDetail.textContent = row.detail;
      rowMain.appendChild(rowDetail);
    }

    if (row.meta) {
      const rowMeta = document.createElement('div');
      rowMeta.className = 'bulk-review-row-meta';
      rowMeta.textContent = row.meta;
      rowMain.appendChild(rowMeta);
    }

    if (rowSelectable) {
      rowEl.addEventListener('click', () => {
        const nextChecked = !bulkReviewModalState.selectedRowIds.has(rowId);
        setBulkReviewRowSelected(rowId, nextChecked);
        updateBulkReviewSelectionState();
      });
    }

    rowEl.appendChild(rowMain);
    listEl.appendChild(rowEl);
  });

  if (rows.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'bulk-review-empty';
    emptyEl.textContent = tr('bulkReviewNoRows', 'No items to display.');
    listEl.appendChild(emptyEl);
  }

  confirmBtn.textContent = bulkReviewModalState.confirmTextBase;
  cancelBtn.textContent = cancelText || tr('btnCancel', 'Cancel');
  cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
  updateBulkReviewSelectionState();
  modal.style.display = 'flex';

  return new Promise((resolve) => {
    if (bulkReviewModalState.resolver) {
      bulkReviewModalState.resolver(createBulkReviewResult(false));
    }
    bulkReviewModalState.resolver = resolve;
  });
}

async function showBulkInfoModal(options) {
  await openBulkReviewModal({
    ...options,
    showCancel: false,
    confirmText: options.confirmText || tr('bulkReviewOk', 'OK')
  });
}

function buildPreviewRows(items, builder) {
  const previewRows = items.slice(0, BULK_PREVIEW_LIMIT).map(builder);
  const remaining = items.length - previewRows.length;
  if (remaining > 0) {
    previewRows.push({
      title: tr('bulkReviewOmittedTitle', 'More items omitted'),
      detail: tr('bulkReviewOmittedDetail', `...and ${remaining} more items`, { count: String(remaining) })
    });
  }
  return previewRows;
}

function shortenText(text, maxLength = 120) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

function getBookmarkDisplayTitle(bookmarkNode) {
  return bookmarkNode?.title || bookmarkNode?.url || '(Untitled)';
}

function getFolderDisplayName(folderId) {
  const meta = nodeMetaMap.get(folderId);
  if (!meta) return tr('defaultFolder', 'Default');
  return meta.title || tr('defaultFolder', 'Default');
}

function normalizeSortNodeLabel(node) {
  return (node?.title || node?.url || '').trim();
}

function compareNodesForBulkSort(left, right, rootRule) {
  const leftIsFolder = !left.node.url;
  const rightIsFolder = !right.node.url;

  if (leftIsFolder !== rightIsFolder) {
    if (rootRule) return leftIsFolder ? 1 : -1;
    return leftIsFolder ? -1 : 1;
  }

  const leftLabel = normalizeSortNodeLabel(left.node);
  const rightLabel = normalizeSortNodeLabel(right.node);
  const labelCompare = leftLabel.localeCompare(rightLabel, undefined, {
    sensitivity: 'base',
    numeric: true
  });
  if (labelCompare !== 0) return labelCompare;

  return left.originalIndex - right.originalIndex;
}

function hasDifferentOrder(currentIds, nextIds) {
  if (currentIds.length !== nextIds.length) return true;
  for (let i = 0; i < currentIds.length; i += 1) {
    if (currentIds[i] !== nextIds[i]) return true;
  }
  return false;
}

function createBulkSortPlanForFolder(folderNode, rootRule) {
  const children = Array.isArray(folderNode?.children) ? folderNode.children : [];
  if (children.length <= 1) return null;

  const indexedChildren = children.map((child, originalIndex) => ({ node: child, originalIndex }));
  const sortedChildren = indexedChildren.slice().sort((left, right) => compareNodesForBulkSort(left, right, rootRule));
  const currentOrderIds = children.map(child => child.id);
  const sortedOrderIds = sortedChildren.map(item => item.node.id);

  if (!hasDifferentOrder(currentOrderIds, sortedOrderIds)) return null;
  return {
    parentId: folderNode.id,
    orderIds: sortedOrderIds
  };
}

function buildBookmarkNodeMap(treeRootNode) {
  const nodeMap = new Map();
  const stack = Array.isArray(treeRootNode?.children) ? [...treeRootNode.children] : [];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || !node.id) continue;
    nodeMap.set(node.id, node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      node.children.forEach(child => stack.push(child));
    }
  }

  return nodeMap;
}

function buildBulkSortPlansForFolderIds(treeRootNode, folderIds) {
  const plans = [];
  const nodeMap = buildBookmarkNodeMap(treeRootNode);
  let scannedFolders = 0;

  folderIds.forEach((folderId) => {
    const folderNode = nodeMap.get(folderId);
    if (!folderNode || folderNode.url) return;

    scannedFolders += 1;
    const plan = createBulkSortPlanForFolder(folderNode, folderId === '1');
    if (plan) {
      plans.push(plan);
    }
  });

  return { plans, scannedFolders };
}

function getSelectedSortFolderIds() {
  const selectedBookmarkIds = getSelectedBookmarkIds();
  const folderIdSet = new Set();

  selectedBookmarkIds.forEach((bookmarkId) => {
    const meta = nodeMetaMap.get(bookmarkId);
    if (meta?.parentId) {
      folderIdSet.add(meta.parentId);
    }
  });

  nodeMetaMap.forEach((meta, nodeId) => {
    if (!meta?.isFolder) return;
    const descendantBookmarkIds = getDescendantBookmarkIds(nodeId);
    if (descendantBookmarkIds.length === 0) return;
    const allSelected = descendantBookmarkIds.every(id => selectedNodeIds.has(id));
    if (allSelected) {
      folderIdSet.add(nodeId);
    }
  });

  return {
    selectedBookmarkIds,
    folderIds: Array.from(folderIdSet)
  };
}

async function applyBulkSortPlan(plan) {
  const currentChildren = await chrome.bookmarks.getChildren(plan.parentId);
  const currentOrder = currentChildren.map(node => node.id);
  let moved = 0;

  for (let index = 0; index < plan.orderIds.length; index += 1) {
    const targetId = plan.orderIds[index];
    if (currentOrder[index] === targetId) continue;

    await chrome.bookmarks.move(targetId, {
      parentId: plan.parentId,
      index
    });
    moved += 1;

    const fromIndex = currentOrder.indexOf(targetId);
    if (fromIndex >= 0) {
      currentOrder.splice(fromIndex, 1);
      currentOrder.splice(index, 0, targetId);
    }
  }

  return moved;
}

async function ensureModelConfiguredForBulk() {
  try {
    await ensureLLMConfiguration();
    return true;
  } catch (err) {
    if (err?.code === LLM_CONFIG_ERROR_CODE) {
      showBulkResult(err.message || t('errorModelNotConfigured') || 'AI model is not configured.');
      return false;
    }
    throw err;
  }
}

async function runBulkAction(actionKey, runner) {
  setBulkButtonsDisabled(true);
  const summaryEl = document.getElementById('selectionSummary');
  const originalSummary = summaryEl ? summaryEl.textContent : '';

  if (summaryEl) {
    summaryEl.textContent = t('bulkActionRunning') || '批量处理中...';
  }

  try {
    const reportProgress = (phase, current, total) => {
      if (!summaryEl) return;
      summaryEl.textContent = formatBulkProgress(actionKey, phase, current, total);
    };
    await runner(reportProgress);
  } catch (err) {
    showBulkResult((t('bulkActionFailed') || '批量操作失败：') + (err?.message || err));
  } finally {
    setBulkButtonsDisabled(false);
    if (summaryEl) {
      summaryEl.textContent = originalSummary;
    }
    updateDailyQuotaSummary();
    updateSelectionSummary();
  }
}

async function runWithConcurrencyPool(
  items,
  worker,
  {
    concurrency = BULK_CONCURRENCY,
    onProgress = null,
    continueOnError = true
  } = {}
) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  if (total === 0) {
    return { completed: 0, total: 0, stopped: false };
  }

  const poolSize = Math.max(1, Math.min(concurrency, total));
  let nextIndex = 0;
  let completed = 0;
  let stopped = false;
  let fatalError = null;

  const control = {
    stop: () => {
      stopped = true;
    },
    isStopped: () => stopped
  };

  const runWorker = async () => {
    while (true) {
      if (stopped) return;
      const currentIndex = nextIndex;
      if (currentIndex >= total) return;
      nextIndex += 1;

      try {
        await worker(list[currentIndex], currentIndex, control);
      } catch (err) {
        if (!continueOnError) {
          fatalError = fatalError || err;
          stopped = true;
        }
      } finally {
        completed += 1;
        if (typeof onProgress === 'function') {
          onProgress(completed, total);
        }
      }
    }
  };

  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));

  if (fatalError) throw fatalError;
  return { completed, total, stopped };
}

async function getFolderStrategyForBulk() {
  const settings = await chrome.storage.sync.get({
    allowNewFolders: false,
    folderCreationLevel: 'weak',
    renameMaxLength: 12
  });

  let finalLevel = 'weak';
  const { allowNewFolders, folderCreationLevel, renameMaxLength } = settings;

  if (typeof allowNewFolders === 'string') {
    finalLevel = allowNewFolders === 'off' ? 'off' : allowNewFolders;
  } else if (typeof allowNewFolders === 'boolean') {
    finalLevel = allowNewFolders ? (folderCreationLevel || 'weak') : 'off';
  }

  if (finalLevel !== 'off' && !['weak', 'medium', 'strong'].includes(finalLevel)) {
    finalLevel = 'medium';
  }

  return {
    folderCreationLevel: finalLevel,
    renameMaxLength
  };
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function probeBookmarkUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'unsupported_url' };
  }

  const tryFetch = async (init) => {
    const { signal, clear } = createTimeoutSignal(9000);
    try {
      const res = await fetch(url, { redirect: 'follow', cache: 'no-store', signal, ...init });
      return res;
    } finally {
      clear();
    }
  };

  try {
    let res = await tryFetch({ method: 'HEAD' });
    if ((res.status === 405 || res.status === 501) && !res.ok) {
      res = await tryFetch({
        method: 'GET',
        headers: { Range: 'bytes=0-0' }
      });
    }

    if (res.ok) return { ok: true, status: res.status };
    if ([401, 403].includes(res.status)) return { ok: true, status: res.status, restricted: true };
    return { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, reason: err?.name || 'network_error' };
  }
}

function showContextMenu(e, nodeData) {
  contextMenuTargetNode = nodeData;
  const menu = document.getElementById('contextMenu');
  const editItem = document.getElementById('ctxEdit');
  const newFolderItem = document.getElementById('ctxNewFolder');
  const keepFolderItem = document.getElementById('ctxDeleteKeepBookmarks');
  const deleteText = document.getElementById('ctxDeleteText');
  const isFolder = nodeData?.isFolder === 'true';
  const canDeleteFolderOnly = isFolder && !!nodeData?.parentId && nodeData.parentId !== '0';
  const isBulkSelection = getSelectedBookmarkIds().length > 1;

  if (editItem) {
    editItem.style.display = isBulkSelection ? 'none' : 'flex';
  }

  if (newFolderItem) {
    newFolderItem.style.display = isBulkSelection ? 'none' : 'flex';
  }

  if (keepFolderItem) {
    keepFolderItem.style.display = canDeleteFolderOnly ? 'flex' : 'none';
  }

  if (deleteText) {
    if (isFolder) {
      deleteText.textContent = '删除文件夹和书签';
    } else {
      deleteText.textContent = '删除书签';
    }
  }

  menu.style.display = 'block';
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
}

function getBookmarkSubTree(folderId) {
  return new Promise((resolve) => {
    chrome.bookmarks.getSubTree(folderId, (nodes) => {
      resolve(nodes || []);
    });
  });
}

function collectBookmarkIdsFromNodes(nodes, output) {
  (nodes || []).forEach((node) => {
    if (node.url) {
      output.push(node.id);
      return;
    }
    collectBookmarkIdsFromNodes(node.children || [], output);
  });
}

function moveBookmarkToParent(bookmarkId, parentId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(bookmarkId, { parentId }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

async function handleDeleteKeepBookmarks() {
  if (!contextMenuTargetNode || contextMenuTargetNode.isFolder !== 'true') return;

  const { id, title, parentId } = contextMenuTargetNode;
  if (!parentId || parentId === '0') {
    showBulkResult('该系统文件夹不支持此操作。');
    return;
  }

  const confirmMsg = `删除文件夹 "${title}"，并将其中书签移动到上一级吗？`;
  if (!confirm(confirmMsg)) return;

  try {
    const subtree = await getBookmarkSubTree(id);
    const folderNode = subtree[0];
    if (!folderNode) throw new Error('Folder not found');

    const bookmarkIds = [];
    collectBookmarkIdsFromNodes(folderNode.children || [], bookmarkIds);

    let movedCount = 0;
    let failedCount = 0;
    for (const bookmarkId of bookmarkIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await moveBookmarkToParent(bookmarkId, parentId);
        movedCount += 1;
      } catch (err) {
        failedCount += 1;
      }
    }

    if (failedCount > 0) {
      showBulkResult(`已移动 ${movedCount} 个书签，${failedCount} 个失败。为避免数据丢失，文件夹未删除。`);
      loadBookmarksTree();
      return;
    }

    await removeBookmarkItem(id, true);
    selectedNodeIds.delete(id);
    selectionAnchorIndex = null;
    loadBookmarksTree();
    showBulkResult(`文件夹已删除，已保留 ${movedCount} 个书签。`);
  } catch (err) {
    showBulkResult(`操作失败：${err?.message || err}`);
  }
}

function createFolderNode(parentId, title) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create({ parentId, title }, (created) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(created);
    });
  });
}

function getCreateFolderParentIdFromContext() {
  if (!contextMenuTargetNode) return '';
  if (contextMenuTargetNode.isFolder === 'true') {
    return contextMenuTargetNode.id || '';
  }
  return contextMenuTargetNode.parentId || '';
}

async function handleCreateFolder() {
  const parentId = getCreateFolderParentIdFromContext();
  if (!parentId) {
    showBulkResult('无法确定新建收藏夹的位置。');
    return;
  }

  const defaultName = '新建收藏夹';
  const folderName = window.prompt('请输入收藏夹名称：', defaultName);
  if (folderName === null) return;

  const title = folderName.trim();
  if (!title) {
    showBulkResult('收藏夹名称不能为空。');
    return;
  }

  try {
    await createFolderNode(parentId, title);
    selectedNodeIds.clear();
    selectionAnchorIndex = null;
    loadBookmarksTree();
  } catch (err) {
    showBulkResult(`新建收藏夹失败：${err?.message || err}`);
  }
}

function handleDelete() {
  if (!contextMenuTargetNode) return;
  const targetId = contextMenuTargetNode.id;

  // If right-clicked node is part of multi-selection, delete all selected.
  if (selectedNodeIds.size > 1 && selectedNodeIds.has(targetId)) {
    handleDeleteSelectedNodes();
    return;
  }

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

async function handleDeleteSelectedNodes() {
  if (selectedNodeIds.size === 0) return;

  const idsToDelete = buildBatchDeleteList(Array.from(selectedNodeIds));
  const count = idsToDelete.length;
  const confirmMsg = t('confirmDeleteSelected', { count: String(count) }) || `确定要删除选中的 ${count} 项吗？`;
  if (!confirm(confirmMsg)) return;

  for (const id of idsToDelete) {
    const meta = nodeMetaMap.get(id);
    if (!meta) continue;
    // Ignore item-level errors to allow best-effort batch deletion.
    // Parent-folder deletion may already remove descendants.
    // eslint-disable-next-line no-await-in-loop
    await removeBookmarkItem(id, meta.isFolder);
  }

  selectedNodeIds.clear();
  selectionAnchorIndex = null;
  loadBookmarksTree();
}

async function handleDeleteSelectedBookmarks() {
  const bookmarkIds = getSelectedBookmarkIds();
  if (bookmarkIds.length === 0) {
    showBulkResult(t('bulkNoBookmarksSelected') || '请先选择至少一个标签。');
    return;
  }

  const confirmMsg = t('confirmDeleteSelectedBookmarks', { count: String(bookmarkIds.length) }) || `确定要删除选中的 ${bookmarkIds.length} 个标签吗？`;
  if (!confirm(confirmMsg)) return;

  await runBulkAction('delete', async (reportProgress) => {
    await runWithConcurrencyPool(
      bookmarkIds,
      async (id) => {
        await removeBookmarkItem(id, false);
      },
      {
        concurrency: BULK_CONCURRENCY,
        onProgress: (current, total) => reportProgress('apply', current, total)
      }
    );

    selectedNodeIds.clear();
    selectionAnchorIndex = null;
    loadBookmarksTree();
    showBulkResult(t('bulkDeleteDone', { count: String(bookmarkIds.length) }) || `已删除 ${bookmarkIds.length} 个标签。`);
  });
}

async function handleManualBackupCurrent() {
  const button = document.getElementById('manualBackupCurrent');
  if (button) {
    button.disabled = true;
  }

  try {
    const backup = await createBookmarkBackup({
      source: 'manager'
    });

    showBulkResult(
      tr(
        'manualBackupCreated',
        `已创建备份：${tr('manualBackupLabel', '手动备份')} ${formatBackupTimestamp(backup.createdAt)}（${backup.bookmarkCount} 个书签）。`,
        {
          label: `${tr('manualBackupLabel', '手动备份')} ${formatBackupTimestamp(backup.createdAt)}`,
          count: String(backup.bookmarkCount)
        }
      )
    );
  } catch (err) {
    showBulkResult(
      tr(
        'manualBackupFailed',
        `备份失败：${err?.message || err}`,
        { error: err?.message || String(err) }
      )
    );
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function handleBulkSortTree() {
  const { selectedBookmarkIds, folderIds } = getSelectedSortFolderIds();
  if (selectedBookmarkIds.length === 0 || folderIds.length === 0) {
    showBulkResult(tr('bulkSortNoSelection', 'Please select bookmarks or folders to sort first.'));
    return;
  }

  const confirmMessage = tr(
    'confirmBulkSortTree',
    'Sort selected folders now? Root folder uses bookmark-first; other folders use folder-first.'
  );
  if (!window.confirm(confirmMessage)) return;

  await runBulkAction('sort', async (reportProgress) => {
    const tree = await chrome.bookmarks.getTree();
    const rootNode = tree?.[0];
    if (!rootNode) {
      showBulkResult(tr('bulkSortFailed', 'Sort failed: bookmark tree unavailable.'));
      return;
    }

    reportProgress('analyze', 1, 1);
    const { plans, scannedFolders } = buildBulkSortPlansForFolderIds(rootNode, folderIds);

    if (plans.length === 0) {
      showBulkResult(tr('bulkSortNoChange', 'Sorting complete: no changes needed.'));
      return;
    }

    let movedCount = 0;
    let failedFolders = 0;

    for (let i = 0; i < plans.length; i += 1) {
      const plan = plans[i];
      try {
        // eslint-disable-next-line no-await-in-loop
        movedCount += await applyBulkSortPlan(plan);
      } catch (err) {
        failedFolders += 1;
      } finally {
        reportProgress('apply', i + 1, plans.length);
      }
    }

    selectedNodeIds.clear();
    selectionAnchorIndex = null;
    loadBookmarksTree();
    showBulkResult(
      tr(
        'bulkSortDone',
        `Sorting complete: ${movedCount} items moved, ${failedFolders} folders failed (scanned ${scannedFolders} folders).`,
        {
          moved: String(movedCount),
          failed: String(failedFolders),
          folders: String(scannedFolders)
        }
      )
    );
  });
}

async function handleBulkRenameSelected() {
  const bookmarkIds = getSelectedBookmarkIds();
  if (bookmarkIds.length === 0) {
    showBulkResult(t('bulkNoBookmarksSelected') || 'Please select at least one bookmark first.');
    return;
  }

  if (!(await ensureModelConfiguredForBulk())) return;

  await runBulkAction('rename', async (reportProgress) => {
    const bookmarks = await getBookmarksByIds(bookmarkIds);
    const { renameMaxLength } = await getFolderStrategyForBulk();
    const renamePlanSlots = new Array(bookmarks.length).fill(null);
    let analysisFailedCount = 0;
    let limitReachedMessage = '';

    await runWithConcurrencyPool(
      bookmarks,
      async (bm, index, control) => {
        if (control.isStopped()) return;
        try {
          const result = await classifyWithLLM(
            bm.title || '',
            bm.url || '',
            { description: '', keywords: '', body: '' },
            [],
            'off',
            true,
            renameMaxLength
          );

          const newTitle = (result?.title || '').trim();
          if (newTitle && newTitle !== bm.title) {
            renamePlanSlots[index] = {
              id: bm.id,
              oldTitle: getBookmarkDisplayTitle(bm),
              newTitle,
              url: bm.url || ''
            };
          }
        } catch (e) {
          if (isLLMDailyLimitError(e)) {
            limitReachedMessage = e.message || tr('bulkDailyLimitReached', 'Daily AI request limit reached.');
            control.stop();
            return;
          }
          if (isLLMRateLimitError(e)) {
            limitReachedMessage = e.message || 'Provider rate limit reached.';
            control.stop();
            return;
          }
          analysisFailedCount += 1;
        }
      },
      {
        concurrency: BULK_CONCURRENCY,
        onProgress: (current, total) => reportProgress('analyze', current, total)
      }
    );

    const renamePlans = renamePlanSlots.filter(Boolean);

    if (limitReachedMessage && renamePlans.length === 0) {
      showBulkResult(limitReachedMessage);
      return;
    }

    if (renamePlans.length === 0) {
      await showBulkInfoModal({
        title: tr('bulkRenameReviewTitle', 'Bulk rename'),
        description: tr('bulkRenameNothingToApply', 'No valid rename suggestions found.'),
        summary: analysisFailedCount > 0
          ? tr('bulkRenameAnalysisFailed', `${analysisFailedCount} bookmarks failed to analyze.`, { failed: String(analysisFailedCount) })
          : tr('bulkRenameNoChange', 'Selected bookmarks do not need renaming.'),
        rows: []
      });
      return;
    }

    const review = await openBulkReviewModal({
      title: tr('bulkRenameReviewTitle', 'Bulk rename review'),
      description: limitReachedMessage
        ? `${tr('bulkRenameReviewDesc', 'Please confirm the AI rename suggestions before applying (all selected by default).')} ${limitReachedMessage}`
        : tr('bulkRenameReviewDesc', 'Please confirm the AI rename suggestions before applying (all selected by default).'),
      summary: analysisFailedCount > 0
        ? tr(
          'bulkRenameReviewSummaryWithFailed',
          `${renamePlans.length} bookmarks will be renamed, ${analysisFailedCount} failed to analyze.`,
          { count: String(renamePlans.length), failed: String(analysisFailedCount) }
        )
        : tr('bulkRenameReviewSummary', `${renamePlans.length} bookmarks will be renamed.`, { count: String(renamePlans.length) }),
      rows: renamePlans.map((plan, idx) => ({
        id: plan.id,
        title: `${idx + 1}. ${shortenText(plan.oldTitle, 72)}`,
        detail: `${shortenText(plan.oldTitle, 40)} => ${shortenText(plan.newTitle, 40)}`,
        meta: shortenText(plan.url, 100)
      })),
      confirmText: tr('bulkReviewApply', 'Apply'),
      cancelText: tr('btnCancel', 'Cancel'),
      showCancel: true,
      selectable: true
    });

    if (!review.confirmed) {
      showBulkResult(tr('bulkRenameCancelled', 'Bulk rename cancelled, no changes were applied.'));
      return;
    }

    const selectedPlanIds = new Set((review.selectedIds || []).map(id => String(id)));
    const selectedPlans = renamePlans.filter(plan => selectedPlanIds.has(String(plan.id)));
    if (selectedPlans.length === 0) {
      showBulkResult(tr('bulkReviewNoSelection', 'No changes selected.'));
      return;
    }

    let successCount = 0;
    let failedCount = analysisFailedCount;
    await runWithConcurrencyPool(
      selectedPlans,
      async (plan) => {
        try {
          await chrome.bookmarks.update(plan.id, { title: plan.newTitle });
          successCount += 1;
        } catch (e) {
          failedCount += 1;
        }
      },
      {
        concurrency: BULK_CONCURRENCY,
        onProgress: (current, total) => reportProgress('apply', current, total)
      }
    );

    loadBookmarksTree();
    showBulkResult(
      t('bulkRenameDone', { success: String(successCount), failed: String(failedCount) }) ||
      `Bulk rename complete: ${successCount} succeeded, ${failedCount} failed.`
    );
  });
}

async function handleBulkClassifySelected() {
  const bookmarkIds = getSelectedBookmarkIds();
  if (bookmarkIds.length === 0) {
    showBulkResult(t('bulkNoBookmarksSelected') || 'Please select at least one bookmark first.');
    return;
  }

  if (!(await ensureModelConfiguredForBulk())) return;

  await runBulkAction('classify', async (reportProgress) => {
    const bookmarks = await getBookmarksByIds(bookmarkIds);
    const { folderCreationLevel, renameMaxLength } = await getFolderStrategyForBulk();
    const existingFolders = await getExistingFolderNames();
    const existingFolderSet = new Set(existingFolders);
    const classifyPlanSlots = new Array(bookmarks.length).fill(null);
    let analysisFailedCount = 0;
    let limitReachedMessage = '';

    await runWithConcurrencyPool(
      bookmarks,
      async (bm, index, control) => {
        if (control.isStopped()) return;
        try {
          const result = await classifyWithLLM(
            bm.title || '',
            bm.url || '',
            { description: '', keywords: '', body: '' },
            existingFolders,
            folderCreationLevel,
            false,
            renameMaxLength
          );

          const category = (result?.category || '').trim();
          if (!category) throw new Error('Empty category');

          const currentFolder = getFolderDisplayName(bm.parentId);
          if (currentFolder !== category) {
            classifyPlanSlots[index] = {
              id: bm.id,
              title: getBookmarkDisplayTitle(bm),
              fromFolder: currentFolder,
              toFolder: category,
              url: bm.url || ''
            };
          }
        } catch (e) {
          if (isLLMDailyLimitError(e)) {
            limitReachedMessage = e.message || tr('bulkDailyLimitReached', 'Daily AI request limit reached.');
            control.stop();
            return;
          }
          if (isLLMRateLimitError(e)) {
            limitReachedMessage = e.message || 'Provider rate limit reached.';
            control.stop();
            return;
          }
          analysisFailedCount += 1;
        }
      },
      {
        concurrency: BULK_CONCURRENCY,
        onProgress: (current, total) => reportProgress('analyze', current, total)
      }
    );

    const classifyPlans = classifyPlanSlots.filter(Boolean);

    if (limitReachedMessage && classifyPlans.length === 0) {
      showBulkResult(limitReachedMessage);
      return;
    }

    if (classifyPlans.length === 0) {
      await showBulkInfoModal({
        title: tr('bulkClassifyReviewTitle', 'Bulk classify'),
        description: tr('bulkClassifyNothingToApply', 'No category changes are required.'),
        summary: analysisFailedCount > 0
          ? tr('bulkClassifyAnalysisFailed', `${analysisFailedCount} bookmarks failed to analyze.`, { failed: String(analysisFailedCount) })
          : tr('bulkClassifyNoChange', 'Selected bookmarks are already in recommended folders.'),
        rows: []
      });
      return;
    }

    const review = await openBulkReviewModal({
      title: tr('bulkClassifyReviewTitle', 'Bulk classify review'),
      description: limitReachedMessage
        ? `${tr('bulkClassifyReviewDesc', 'Please confirm the target folders before moving bookmarks (all selected by default).')} ${limitReachedMessage}`
        : tr('bulkClassifyReviewDesc', 'Please confirm the target folders before moving bookmarks (all selected by default).'),
      summary: analysisFailedCount > 0
        ? tr(
          'bulkClassifyReviewSummaryWithFailed',
          `${classifyPlans.length} bookmarks will be moved, ${analysisFailedCount} failed to analyze.`,
          { count: String(classifyPlans.length), failed: String(analysisFailedCount) }
        )
        : tr('bulkClassifyReviewSummary', `${classifyPlans.length} bookmarks will be moved.`, { count: String(classifyPlans.length) }),
      rows: classifyPlans.map((plan, idx) => ({
        id: plan.id,
        title: `${idx + 1}. ${shortenText(plan.title, 72)}`,
        detail: `${shortenText(plan.fromFolder, 32)} => ${shortenText(plan.toFolder, 32)}`,
        meta: shortenText(plan.url, 100)
      })),
      confirmText: tr('bulkReviewApply', 'Apply'),
      cancelText: tr('btnCancel', 'Cancel'),
      showCancel: true,
      selectable: true
    });

    if (!review.confirmed) {
      showBulkResult(tr('bulkClassifyCancelled', 'Bulk classify cancelled, no changes were applied.'));
      return;
    }

    const selectedPlanIds = new Set((review.selectedIds || []).map(id => String(id)));
    const selectedPlans = classifyPlans.filter(plan => selectedPlanIds.has(String(plan.id)));
    if (selectedPlans.length === 0) {
      showBulkResult(tr('bulkReviewNoSelection', 'No changes selected.'));
      return;
    }

    let successCount = 0;
    let failedCount = analysisFailedCount;
    const folderPromiseCache = new Map();

    const getFolderIdCached = (folderName) => {
      if (!folderPromiseCache.has(folderName)) {
        folderPromiseCache.set(folderName, createOrGetFolder(folderName));
      }
      return folderPromiseCache.get(folderName);
    };

    await runWithConcurrencyPool(
      selectedPlans,
      async (plan) => {
        try {
          const folderId = await getFolderIdCached(plan.toFolder);
          await moveBookmark(plan.id, folderId);

          if (!existingFolderSet.has(plan.toFolder)) {
            existingFolderSet.add(plan.toFolder);
            existingFolders.push(plan.toFolder);
          }
          successCount += 1;
        } catch (e) {
          failedCount += 1;
        }
      },
      {
        concurrency: BULK_CONCURRENCY,
        onProgress: (current, total) => reportProgress('apply', current, total)
      }
    );

    loadBookmarksTree();
    showBulkResult(
      t('bulkClassifyDone', { success: String(successCount), failed: String(failedCount) }) ||
      `Bulk classify complete: ${successCount} succeeded, ${failedCount} failed.`
    );
  });
}

async function handleCheckInvalidSelected() {
  const bookmarkIds = getSelectedBookmarkIds();
  if (bookmarkIds.length === 0) {
    showBulkResult(t('bulkNoBookmarksSelected') || 'Please select at least one bookmark first.');
    return;
  }

  await runBulkAction('check', async (reportProgress) => {
    const bookmarks = await getBookmarksByIds(bookmarkIds);
    const invalidItemSlots = new Array(bookmarks.length).fill(null);

    await runWithConcurrencyPool(
      bookmarks,
      async (bm, index) => {
        const probe = await probeBookmarkUrl(bm.url);
        if (!probe.ok) {
          invalidItemSlots[index] = {
            id: bm.id,
            title: bm.title || bm.url || '(Untitled)',
            url: bm.url || '',
            status: probe.status || probe.reason || 'unknown'
          };
        }
      },
      {
        concurrency: BULK_CONCURRENCY,
        onProgress: (current, total) => reportProgress('analyze', current, total)
      }
    );

    const invalidItems = invalidItemSlots.filter(Boolean);

    if (invalidItems.length > 0) {
      selectedNodeIds.clear();
      invalidItems.forEach(item => selectedNodeIds.add(item.id));
      updateSelectionUI();
    }

    if (invalidItems.length === 0) {
      await showBulkInfoModal({
        title: tr('bulkInvalidReviewTitle', '失效检测结果'),
        description: tr('bulkInvalidReviewDesc', '已在树中高亮疑似失效链接。'),
        summary: t('bulkCheckInvalidDone', {
          invalid: String(invalidItems.length),
          total: String(bookmarks.length)
        }) || `失效检测完成：共 ${bookmarks.length} 个，疑似失效 ${invalidItems.length} 个。`,
        rows: [],
        confirmText: tr('bulkReviewOk', '确定')
      });
      return;
    }

    const review = await openBulkReviewModal({
      title: tr('bulkInvalidReviewTitle', '失效检测结果'),
      description: tr(
        'bulkInvalidReviewDeleteDesc',
        '请选择要删除的疑似失效链接（默认全选）。注意：网络波动、地区网络限制、网站反爬或临时故障都可能导致检测失败，不一定代表网站已失效，请谨慎删除。'
      ),
      summary: t('bulkCheckInvalidDone', {
        invalid: String(invalidItems.length),
        total: String(bookmarks.length)
      }) || `失效检测完成：共 ${bookmarks.length} 个，疑似失效 ${invalidItems.length} 个。`,
      rows: invalidItems.map((item, idx) => ({
        id: item.id,
        title: `${idx + 1}. ${shortenText(item.title, 80)}`,
        detail: `[${item.status}] ${shortenText(item.url, 100)}`
      })),
      confirmText: tr('bulkInvalidDeleteSelected', '删除勾选项'),
      cancelText: tr('btnCancel', '取消'),
      showCancel: true,
      selectable: true,
      emphasize: 'danger'
    });

    if (!review.confirmed) {
      showBulkResult(tr('bulkInvalidDeleteCancelled', '已取消删除，未应用任何变更。'));
      return;
    }

    const selectedIdSet = new Set((review.selectedIds || []).map(id => String(id)));
    const selectedInvalidItems = invalidItems.filter(item => selectedIdSet.has(String(item.id)));
    if (selectedInvalidItems.length === 0) {
      showBulkResult(tr('bulkReviewNoSelection', 'No changes selected.'));
      return;
    }

    let deletedCount = 0;

    await runWithConcurrencyPool(
      selectedInvalidItems,
      async (item) => {
        const removed = await removeBookmarkItem(item.id, false);
        if (removed !== false) {
          deletedCount += 1;
        }
      },
      {
        concurrency: BULK_CONCURRENCY,
        onProgress: (current, total) => reportProgress('apply', current, total)
      }
    );

    const failedCount = Math.max(selectedInvalidItems.length - deletedCount, 0);
    selectedNodeIds.clear();
    selectionAnchorIndex = null;
    loadBookmarksTree();
    showBulkResult(
      t('bulkInvalidDeleteDone', {
        success: String(deletedCount),
        failed: String(failedCount)
      }) || `失效链接清理完成：已删除 ${deletedCount} 条，失败 ${failedCount} 条。`
    );
  });
}

function buildBatchDeleteList(ids) {
  const selectedSet = new Set(ids);

  return ids.filter(id => {
    let current = nodeMetaMap.get(id);
    while (current && current.parentId) {
      if (selectedSet.has(current.parentId)) {
        const parentMeta = nodeMetaMap.get(current.parentId);
        if (parentMeta && parentMeta.isFolder) {
          return false;
        }
      }
      current = nodeMetaMap.get(current.parentId);
    }
    return true;
  });
}

function removeBookmarkItem(id, isFolder) {
  return new Promise(resolve => {
    const done = () => {
      if (chrome.runtime?.lastError) {
        resolve(false);
        return;
      }
      resolve(true);
    };
    if (isFolder) {
      chrome.bookmarks.removeTree(id, done);
    } else {
      chrome.bookmarks.remove(id, done);
    }
  });
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
