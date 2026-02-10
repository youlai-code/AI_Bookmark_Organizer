export async function getExistingFolderNames() {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0].children.find(n => n.id === '1');
  
  if (!bookmarksBar || !bookmarksBar.children) {
    return [];
  }
  
  // 筛选出所有文件夹的名称
  const folders = bookmarksBar.children
    .filter(n => !n.url) // 没有 url 的节点通常是文件夹
    .map(n => n.title);
    
  return folders;
}

export async function createOrGetFolder(folderName) {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0].children.find(n => n.id === '1');
  
  // 查找是否已存在该文件夹
  const existing = bookmarksBar.children.find(
    n => n.title === folderName && !n.url
  );
  
  if (existing) {
    return existing.id;
  }
  
  // 创建新文件夹
  const folder = await chrome.bookmarks.create({
    parentId: '1',
    title: folderName
  });
  
  return folder.id;
}

export async function moveBookmark(bookmarkId, folderId) {
  await chrome.bookmarks.move(bookmarkId, { parentId: folderId });
}
