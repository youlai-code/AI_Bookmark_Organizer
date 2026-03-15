function normalizeFolderPath(path) {
  if (!path) return [];
  return path
    .split(/[\\/]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function collectFolderPaths(nodes, parentPath, output) {
  nodes.forEach(node => {
    if (node.url) return;
    const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;
    output.push(currentPath);
    if (node.children && node.children.length > 0) {
      collectFolderPaths(node.children, currentPath, output);
    }
  });
}

function collectFoldersByTitle(nodes, title, output) {
  nodes.forEach(node => {
    if (node.url) return;
    if (node.title === title) {
      output.push(node);
    }
    if (node.children && node.children.length > 0) {
      collectFoldersByTitle(node.children, title, output);
    }
  });
}

function findByPath(nodes, parts, depth = 0) {
  if (depth >= parts.length) return null;
  const current = nodes.find(node => !node.url && node.title === parts[depth]);
  if (!current) return null;
  if (depth === parts.length - 1) return current;
  if (!current.children || current.children.length === 0) return null;
  return findByPath(current.children, parts, depth + 1);
}

export async function getExistingFolderNames() {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0].children.find(n => n.id === '1');

  if (!bookmarksBar || !bookmarksBar.children) {
    return [];
  }

  const folderPaths = [];
  collectFolderPaths(bookmarksBar.children, '收藏夹栏', folderPaths);
  return [...new Set(folderPaths)];
}

export async function createOrGetFolder(folderName) {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0].children.find(n => n.id === '1');
  if (!bookmarksBar) {
    throw new Error('Bookmarks bar not found');
  }

  const parts = normalizeFolderPath(folderName);
  if (parts.length === 0) {
    throw new Error('Invalid folder name');
  }

  // 1) Exact path match (supports nested folders like "Programming/C#")
  const existingByPath = findByPath(bookmarksBar.children || [], parts);
  if (existingByPath) {
    return existingByPath.id;
  }

  // 2) Backward compatibility: single folder name and unique nested match
  if (parts.length === 1) {
    const title = parts[0];
    const topLevel = (bookmarksBar.children || []).find(n => !n.url && n.title === title);
    if (topLevel) return topLevel.id;

    const matches = [];
    collectFoldersByTitle(bookmarksBar.children || [], title, matches);
    if (matches.length === 1) {
      return matches[0].id;
    }
  }

  // 3) Create missing path segments from bookmarks bar downward
  let parentId = bookmarksBar.id || '1';
  for (const part of parts) {
    const children = await chrome.bookmarks.getChildren(parentId);
    const found = children.find(node => !node.url && node.title === part);
    if (found) {
      parentId = found.id;
      continue;
    }

    const created = await chrome.bookmarks.create({
      parentId,
      title: part
    });
    parentId = created.id;
  }

  return parentId;
}

export async function moveBookmark(bookmarkId, folderId) {
  await chrome.bookmarks.move(bookmarkId, { parentId: folderId });
}
