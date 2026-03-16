const BOOKMARKS_BAR_ID = '1';
const ROOT_FOLDER_ALIASES = new Set([
  '收藏夹栏',
  '书签栏',
  '书签工具栏',
  '收藏栏',
  '收藏栏夹',
  'bookmarkbar',
  'bookmarks bar',
  'bookmarksbar',
  'toolbar',
  'bookmarks toolbar'
]);

function normalizeFolderTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeAliasCandidate(value) {
  return normalizeFolderTitle(value).toLowerCase().replace(/\s+/g, '');
}

function isRootFolderAlias(value) {
  if (!value) return false;
  const normalized = normalizeAliasCandidate(value);
  for (const alias of ROOT_FOLDER_ALIASES) {
    if (normalized === normalizeAliasCandidate(alias)) return true;
  }
  return false;
}

function normalizeFolderPath(path) {
  if (!path) return [];
  return path
    .split(/[\\/／]/)
    .map(part => normalizeFolderTitle(part))
    .filter(Boolean);
}

function collectFolderPaths(nodes, parentPath, output) {
  nodes.forEach(node => {
    if (node.url) return;
    const title = normalizeFolderTitle(node.title);
    if (!title) return;
    const currentPath = parentPath ? `${parentPath}/${title}` : title;
    output.push(currentPath);
    if (node.children && node.children.length > 0) {
      collectFolderPaths(node.children, currentPath, output);
    }
  });
}

function collectFoldersByTitle(nodes, title, output) {
  const normalizedTarget = normalizeFolderTitle(title);
  nodes.forEach(node => {
    if (node.url) return;
    if (normalizeFolderTitle(node.title) === normalizedTarget) {
      output.push(node);
    }
    if (node.children && node.children.length > 0) {
      collectFoldersByTitle(node.children, title, output);
    }
  });
}

function findByPath(nodes, parts, depth = 0) {
  if (depth >= parts.length) return null;
  const expected = normalizeFolderTitle(parts[depth]);
  const current = nodes.find(node => !node.url && normalizeFolderTitle(node.title) === expected);
  if (!current) return null;
  if (depth === parts.length - 1) return current;
  if (!current.children || current.children.length === 0) return null;
  return findByPath(current.children, parts, depth + 1);
}

const segmentCreationLocks = new Map();

async function getOrCreateFolderSegment(parentId, title) {
  const normalizedTitle = normalizeFolderTitle(title);
  const key = `${parentId}|${normalizedTitle}`;
  if (segmentCreationLocks.has(key)) {
    return await segmentCreationLocks.get(key);
  }

  const task = (async () => {
    const children = await chrome.bookmarks.getChildren(parentId);
    const found = children.find(node => !node.url && normalizeFolderTitle(node.title) === normalizedTitle);
    if (found) return found.id;
    const created = await chrome.bookmarks.create({
      parentId,
      title: normalizedTitle
    });
    return created.id;
  })().finally(() => {
    segmentCreationLocks.delete(key);
  });

  segmentCreationLocks.set(key, task);
  return await task;
}

export async function getExistingFolderNames() {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0].children.find(n => n.id === BOOKMARKS_BAR_ID);

  if (!bookmarksBar || !bookmarksBar.children) {
    return [];
  }

  const folderPaths = [];
  for (const child of bookmarksBar.children) {
    if (child?.url) continue;
    if (isRootFolderAlias(child.title)) {
      if (child.children && child.children.length > 0) {
        collectFolderPaths(child.children, '', folderPaths);
      }
      continue;
    }
    collectFolderPaths([child], '', folderPaths);
  }
  return [...new Set(folderPaths)];
}

export async function createOrGetFolder(folderName) {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0].children.find(n => n.id === BOOKMARKS_BAR_ID);
  if (!bookmarksBar) {
    throw new Error('Bookmarks bar not found');
  }

  const parts = normalizeFolderPath(folderName);
  while (parts.length > 0 && isRootFolderAlias(parts[0])) {
    parts.shift();
  }
  if (parts.length === 0) {
    return bookmarksBar.id || BOOKMARKS_BAR_ID;
  }

  // 1) Exact path match (supports nested folders like "Programming/C#")
  const existingByPath = findByPath(bookmarksBar.children || [], parts);
  if (existingByPath) {
    return existingByPath.id;
  }

  // 2) Backward compatibility: single folder name and unique nested match
  if (parts.length === 1) {
    const title = parts[0];
    const topLevel = (bookmarksBar.children || []).find(n => !n.url && normalizeFolderTitle(n.title) === normalizeFolderTitle(title));
    if (topLevel) return topLevel.id;

    const matches = [];
    collectFoldersByTitle(bookmarksBar.children || [], title, matches);
    if (matches.length === 1) {
      return matches[0].id;
    }
  }

  // 3) Create missing path segments from bookmarks bar downward
  let parentId = bookmarksBar.id || BOOKMARKS_BAR_ID;
  for (const part of parts) {
    parentId = await getOrCreateFolderSegment(parentId, part);
  }

  return parentId;
}

export async function moveBookmark(bookmarkId, folderId) {
  await chrome.bookmarks.move(bookmarkId, { parentId: folderId });
}
