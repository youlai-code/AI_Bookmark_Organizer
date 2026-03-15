const BOOKMARK_BACKUPS_STORAGE_KEY = 'bookmarkBackups';
const BOOKMARK_BACKUP_LIMIT = 10;
const BOOKMARK_IMPORT_STATE_STORAGE_KEY = 'bookmarkImportState';
const BOOKMARK_IMPORT_SUPPRESS_MS = 60 * 1000;

function generateBackupId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `backup_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function sanitizeTitle(title, fallback = 'Untitled Folder') {
  const value = typeof title === 'string' ? title.trim() : '';
  return value || fallback;
}

function cloneSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBookmarkTimestamp(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(':');
}

function serializeBookmarkNode(node) {
  if (node.url) {
    return {
      title: node.title || node.url || '',
      url: node.url
    };
  }

  return {
    title: sanitizeTitle(node.title),
    children: serializeBookmarkNodes(node.children || [])
  };
}

function serializeBookmarkNodes(nodes = []) {
  return nodes.map(serializeBookmarkNode);
}

function collectSnapshotCounts(nodes, counts = { bookmarks: 0, folders: 0 }) {
  (nodes || []).forEach((node) => {
    if (node.url) {
      counts.bookmarks += 1;
      return;
    }
    counts.folders += 1;
    collectSnapshotCounts(node.children || [], counts);
  });
  return counts;
}

function buildContainerSnapshot(containerNode, index) {
  return {
    key: containerNode?.id || `root-${index}`,
    title: sanitizeTitle(containerNode?.title, `Root ${index + 1}`),
    children: serializeBookmarkNodes(containerNode?.children || [])
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.containers)) {
    throw new Error('Invalid bookmark snapshot');
  }

  return {
    version: snapshot.version || 1,
    capturedAt: snapshot.capturedAt || new Date().toISOString(),
    containers: snapshot.containers.map((container, index) => ({
      key: container?.key || `root-${index}`,
      title: sanitizeTitle(container?.title, `Root ${index + 1}`),
      children: serializeBookmarkNodes(container?.children || [])
    }))
  };
}

function findImportTargetContainer(rootChildren) {
  return rootChildren.find((node) => node.id === '1') || rootChildren[0] || null;
}

async function setBookmarkImportState(active) {
  const state = {
    active: Boolean(active),
    updatedAt: Date.now(),
    suppressUntil: active ? Date.now() + BOOKMARK_IMPORT_SUPPRESS_MS : Date.now() + BOOKMARK_IMPORT_SUPPRESS_MS
  };

  await chrome.storage.local.set({
    [BOOKMARK_IMPORT_STATE_STORAGE_KEY]: state
  });
}

function normalizeContainerTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizeBookmarkUrl(url) {
  return String(url || '').trim();
}

function getRootContainerAliases(node) {
  const title = normalizeContainerTitle(node?.title);
  const aliases = new Set([title]);

  switch (node?.id) {
    case '1':
      [
        'bookmarkbar',
        'bookmarktoolbar',
        'bookmarksbar',
        'bookmarkstoolbar',
        'favoritesbar',
        'toolbar',
        '收藏夹栏',
        '书签栏',
        '书签工具栏',
        '收藏栏'
      ].forEach((alias) => aliases.add(normalizeContainerTitle(alias)));
      break;
    case '2':
      [
        'otherbookmarks',
        'otherfavorites',
        'other',
        '其他收藏夹',
        '其他书签',
        '其它收藏夹',
        '其它书签'
      ].forEach((alias) => aliases.add(normalizeContainerTitle(alias)));
      break;
    case '3':
      [
        'mobilebookmarks',
        'mobilefavorites',
        'mobile',
        '移动书签',
        '手机书签',
        '移动收藏夹'
      ].forEach((alias) => aliases.add(normalizeContainerTitle(alias)));
      break;
    default:
      break;
  }

  return aliases;
}

function findMatchingRootContainer(node, rootChildren) {
  if (!node || node.url) {
    return null;
  }

  const importedTitle = normalizeContainerTitle(node.title);
  if (!importedTitle) {
    return null;
  }

  return rootChildren.find((rootNode) => getRootContainerAliases(rootNode).has(importedTitle)) || null;
}

async function getBookmarkRootChildren() {
  const tree = await chrome.bookmarks.getTree();
  const rootChildren = tree?.[0]?.children || [];
  if (!Array.isArray(rootChildren) || rootChildren.length === 0) {
    throw new Error('Bookmark tree is unavailable');
  }
  return rootChildren;
}

async function removeFolderChildren(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  for (const child of children) {
    if (child.url) {
      // eslint-disable-next-line no-await-in-loop
      await chrome.bookmarks.remove(child.id);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await chrome.bookmarks.removeTree(child.id);
    }
  }
}

async function createNodesUnderParent(parentId, nodes) {
  let createdBookmarks = 0;
  let createdFolders = 0;

  for (const node of nodes || []) {
    // eslint-disable-next-line no-await-in-loop
    const children = await chrome.bookmarks.getChildren(parentId);

    if (node.url) {
      const nodeUrl = normalizeBookmarkUrl(node.url);
      const existingBookmark = children.find((child) => (
        Boolean(child.url)
        && normalizeBookmarkUrl(child.url) === nodeUrl
      ));

      if (existingBookmark) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await chrome.bookmarks.create({
        parentId,
        title: node.title || node.url,
        url: node.url
      });
      createdBookmarks += 1;
      continue;
    }

    const folderTitle = sanitizeTitle(node.title);
    const existingFolder = children.find(
      (child) => !child.url && sanitizeTitle(child.title) === folderTitle
    );

    let targetFolderId = existingFolder?.id || null;
    if (!targetFolderId) {
      // eslint-disable-next-line no-await-in-loop
      const createdFolder = await chrome.bookmarks.create({
        parentId,
        title: folderTitle
      });
      targetFolderId = createdFolder.id;
      createdFolders += 1;
    }

    // eslint-disable-next-line no-await-in-loop
    const nestedCounts = await createNodesUnderParent(targetFolderId, node.children || []);
    createdBookmarks += nestedCounts.createdBookmarks;
    createdFolders += nestedCounts.createdFolders;
  }

  return { createdBookmarks, createdFolders };
}

function buildHtmlForNodes(nodes, depth = 0) {
  const indent = '    '.repeat(depth);
  const nestedIndent = '    '.repeat(depth + 1);

  return (nodes || []).map((node) => {
    if (node.url) {
      return `${indent}<DT><A HREF="${escapeHtml(node.url)}">${escapeHtml(node.title || node.url)}</A>\n`;
    }

    const title = escapeHtml(sanitizeTitle(node.title));
    const childrenHtml = buildHtmlForNodes(node.children || [], depth + 1);
    return [
      `${indent}<DT><H3>${title}</H3>\n`,
      `${indent}<DL><p>\n`,
      childrenHtml,
      `${indent}</DL><p>\n`
    ].join('');
  }).join('');
}

function getDirectChildByTagName(element, tagName) {
  return Array.from(element.children).find((child) => child.tagName === tagName) || null;
}

function parseBookmarkHtmlList(container) {
  const result = [];
  const elements = Array.from(container.children || []);

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const tagName = element.tagName;

    if (tagName === 'DT') {
      const directLink = getDirectChildByTagName(element, 'A');
      if (directLink) {
        const url = directLink.getAttribute('HREF') || directLink.getAttribute('href');
        if (url) {
          result.push({
            title: directLink.textContent?.trim() || url,
            url
          });
        }
        continue;
      }

      const directFolder = getDirectChildByTagName(element, 'H3');
      if (directFolder) {
        let nestedList = getDirectChildByTagName(element, 'DL');
        if (!nestedList) {
          const nextElement = elements[index + 1];
          if (nextElement?.tagName === 'DL') {
            nestedList = nextElement;
            index += 1;
          }
        }

        result.push({
          title: directFolder.textContent?.trim() || 'Imported Folder',
          children: nestedList ? parseBookmarkHtmlList(nestedList) : []
        });
      }
      continue;
    }

    if (tagName === 'A') {
      const url = element.getAttribute('HREF') || element.getAttribute('href');
      if (url) {
        result.push({
          title: element.textContent?.trim() || url,
          url
        });
      }
      continue;
    }

    if (tagName === 'H3') {
      const nextElement = elements[index + 1];
      const nestedList = nextElement?.tagName === 'DL' ? nextElement : null;
      if (nestedList) {
        index += 1;
      }
      result.push({
        title: element.textContent?.trim() || 'Imported Folder',
        children: nestedList ? parseBookmarkHtmlList(nestedList) : []
      });
    }
  }

  return result;
}

export function getBookmarkBackupStorageKey() {
  return BOOKMARK_BACKUPS_STORAGE_KEY;
}

export function formatBackupTimestamp(dateLike) {
  return formatBookmarkTimestamp(dateLike);
}

export async function captureCurrentBookmarkSnapshot() {
  const rootChildren = await getBookmarkRootChildren();
  const containers = rootChildren.map((node, index) => buildContainerSnapshot(node, index));
  return normalizeSnapshot({
    version: 1,
    capturedAt: new Date().toISOString(),
    containers
  });
}

export async function listBookmarkBackups() {
  const { [BOOKMARK_BACKUPS_STORAGE_KEY]: backups = [] } = await chrome.storage.local.get({
    [BOOKMARK_BACKUPS_STORAGE_KEY]: []
  });
  return Array.isArray(backups) ? backups : [];
}

export async function saveBookmarkBackup(snapshot, metadata = {}) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const counts = collectSnapshotCounts(
    normalizedSnapshot.containers.flatMap((container) => container.children || [])
  );
  const backups = await listBookmarkBackups();
  const createdAt = metadata.createdAt || new Date().toISOString();
  const source = metadata.source || 'manual';
  const label = metadata.label?.trim() || `${source} ${formatBookmarkTimestamp(createdAt)}`;

  const backup = {
    id: metadata.id || generateBackupId(),
    createdAt,
    source,
    label,
    bookmarkCount: counts.bookmarks,
    folderCount: counts.folders,
    snapshot: normalizedSnapshot
  };

  const nextBackups = [backup, ...backups].slice(0, BOOKMARK_BACKUP_LIMIT);
  await chrome.storage.local.set({
    [BOOKMARK_BACKUPS_STORAGE_KEY]: nextBackups
  });
  return backup;
}

export async function createBookmarkBackup(metadata = {}) {
  const snapshot = await captureCurrentBookmarkSnapshot();
  return saveBookmarkBackup(snapshot, metadata);
}

export async function getBookmarkBackupById(backupId) {
  const backups = await listBookmarkBackups();
  return backups.find((item) => item.id === backupId) || null;
}

export async function deleteBookmarkBackup(backupId) {
  const backups = await listBookmarkBackups();
  const nextBackups = backups.filter((item) => item.id !== backupId);
  await chrome.storage.local.set({
    [BOOKMARK_BACKUPS_STORAGE_KEY]: nextBackups
  });
  return nextBackups.length !== backups.length;
}

export async function restoreBookmarkSnapshot(snapshot) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const rootChildren = await getBookmarkRootChildren();

  for (let index = 0; index < rootChildren.length; index += 1) {
    const currentContainer = rootChildren[index];
    const snapshotContainer = normalizedSnapshot.containers[index];

    // eslint-disable-next-line no-await-in-loop
    await removeFolderChildren(currentContainer.id);

    if (snapshotContainer?.children?.length) {
      // eslint-disable-next-line no-await-in-loop
      await createNodesUnderParent(currentContainer.id, snapshotContainer.children);
    }
  }

  if (normalizedSnapshot.containers.length > rootChildren.length) {
    const importTarget = findImportTargetContainer(rootChildren);
    if (!importTarget) {
      throw new Error('Bookmark root is unavailable');
    }

    for (let index = rootChildren.length; index < normalizedSnapshot.containers.length; index += 1) {
      const extraContainer = normalizedSnapshot.containers[index];
      // eslint-disable-next-line no-await-in-loop
      const createdFolder = await chrome.bookmarks.create({
        parentId: importTarget.id,
        title: sanitizeTitle(extraContainer.title)
      });
      // eslint-disable-next-line no-await-in-loop
      await createNodesUnderParent(createdFolder.id, extraContainer.children || []);
    }
  }

  return cloneSnapshot(normalizedSnapshot);
}

export async function restoreBookmarkBackup(backupId, options = {}) {
  const backup = await getBookmarkBackupById(backupId);
  if (!backup) {
    throw new Error('Backup not found');
  }

  if (options.createSafetyBackup !== false) {
    await createBookmarkBackup({
      source: options.safetyBackupSource || 'pre-restore',
      label: options.safetyBackupLabel || `Pre-restore ${formatBookmarkTimestamp()}`
    });
  }

  await restoreBookmarkSnapshot(backup.snapshot);
  return backup;
}

export function snapshotToBookmarkHtml(snapshot, options = {}) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const exportTitle = escapeHtml(options.title || 'Bookmarks');
  const topLevelNodes = normalizedSnapshot.containers.map((container) => ({
    title: container.title,
    children: container.children || []
  }));

  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n',
    `<TITLE>${exportTitle}</TITLE>\n`,
    `<H1>${exportTitle}</H1>\n`,
    '<DL><p>\n',
    buildHtmlForNodes(topLevelNodes, 1),
    '</DL><p>\n'
  ].join('');
}

export async function exportCurrentBookmarksAsHtml(options = {}) {
  const snapshot = await captureCurrentBookmarkSnapshot();
  return snapshotToBookmarkHtml(snapshot, options);
}

export function parseBookmarkHtml(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const rootList = doc.querySelector('DL');
  if (!rootList) {
    throw new Error('No bookmark list found in HTML');
  }

  const nodes = parseBookmarkHtmlList(rootList);
  if (!nodes.length) {
    throw new Error('No bookmarks found in HTML');
  }
  return nodes;
}

export async function importBookmarksFromHtml(htmlText, options = {}) {
  const nodes = parseBookmarkHtml(htmlText);
  const rootChildren = await getBookmarkRootChildren();
  const importTarget = findImportTargetContainer(rootChildren);

  if (!importTarget) {
    throw new Error('Bookmark toolbar is unavailable');
  }

  let backup = null;
  if (options.createSafetyBackup !== false) {
    backup = await createBookmarkBackup({
      source: options.safetyBackupSource || 'pre-import',
      label: options.safetyBackupLabel || `Pre-import ${formatBookmarkTimestamp()}`
    });
  }

  await setBookmarkImportState(true);

  try {
    let createdBookmarks = 0;
    let createdFolders = 0;
    const destinationTitles = new Set();

    for (const node of nodes) {
      const matchedRoot = findMatchingRootContainer(node, rootChildren);
      const parentId = matchedRoot?.id || importTarget.id;
      const targetNodes = matchedRoot ? (node.children || []) : [node];

      if (targetNodes.length === 0) {
        if (matchedRoot?.title) {
          destinationTitles.add(matchedRoot.title);
        }
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const createdCounts = await createNodesUnderParent(parentId, targetNodes);
      createdBookmarks += createdCounts.createdBookmarks;
      createdFolders += createdCounts.createdFolders;
      destinationTitles.add(matchedRoot?.title || importTarget.title || 'Bookmarks');
    }

    return {
      backup,
      folderId: importTarget.id,
      folderTitle: importTarget.title,
      importedBookmarks: createdBookmarks,
      importedFolders: createdFolders,
      destinationTitles: Array.from(destinationTitles)
    };
  } finally {
    await setBookmarkImportState(false);
  }
}
