import { classifyWithLLM } from './utils/llm.js';
import { createOrGetFolder, moveBookmark, getExistingFolderNames } from './utils/bookmark.js';
import { addHistoryItem } from './utils/history.js';
import { initI18n, t } from './utils/i18n.js';

// Initialize i18n
await initI18n();

// 记录最近由插件自动创建的书签URL，避免onCreated重复处理
const recentlyProcessedUrls = new Set();

// 监听书签创建事件 (原生收藏)
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (!bookmark.url) return;
  
  // 如果是刚刚由插件处理过的，跳过
  if (recentlyProcessedUrls.has(bookmark.url)) {
      recentlyProcessedUrls.delete(bookmark.url);
      return;
  }
  
  try {
    console.log(`正在处理原生书签: ${bookmark.title}`);
    const pageContent = await extractPageContent(bookmark.url);
    await processBookmarkClassification(id, bookmark.title, bookmark.url, pageContent);
  } catch (error) {
    console.error('自动分类失败:', error);
  }
});

// 监听键盘快捷键
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'trigger_smart_bookmark') {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab) {
        console.log('通过快捷键触发智能收藏:', tab.title);
        
        // 发送“开始处理”的提示（可选，先给用户一个反馈）
        chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_TOAST',
            message: t('toastAnalyzing'),
            status: 'info'
        }).catch(() => {});

        await handleManualTrigger(tab.id, tab.url, tab.title);
      }
    } catch (error) {
      console.error('快捷键处理失败:', error);
    }
  }
});

// 监听消息 (Popup 或 Content Script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 来自 Popup 的主动收藏请求
    if (request.type === 'TRIGGER_CLASSIFICATION_FROM_POPUP') {
        handleManualTrigger(request.tabId, request.url, request.title)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // 异步响应
    }

    // 来自 Content Script 的消息 (保留接口，目前主要用Popup)
    if (request.type === 'AI_BOOKMARK') {
        const tabId = sender.tab ? sender.tab.id : null;
        handleAiBookmarkRequest(request.data, tabId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// 处理 Popup 手动触发
async function handleManualTrigger(tabId, url, title) {
    try {
        console.log('收到手动收藏请求:', title);
        
        // 1. 提取内容 (需要指定 tabId)
        let content = { description: '', keywords: '' };
        if (tabId) {
            content = await extractPageContentFromTab(tabId);
        } else {
             // 如果没有 tabId (极少情况)，尝试仅根据 URL 提取或跳过
             console.warn('未提供 tabId，无法提取页面内容');
        }
        
        // 2. LLM 分类
        let category;
        let newTitle = title;
        
        try {
            // 获取设置和现有文件夹
            const { allowNewFolders, enableSmartRename } = await chrome.storage.sync.get({ 
                allowNewFolders: true, 
                enableSmartRename: false 
            });
            const existingFolders = await getExistingFolderNames();
            
            const result = await classifyWithLLM(title, url, content, existingFolders, allowNewFolders, enableSmartRename);
            category = result.category;
            newTitle = result.title;
            
        } catch (error) {
            console.warn('LLM分类失败，使用默认分类:', error);
            category = t('defaultFolder');
        }
        
        // 3. 执行收藏逻辑
        const folderId = await createOrGetFolder(category);
        const existing = await findBookmarkByUrl(url);
        
        if (existing) {
            // 移动现有书签
            await moveBookmark(existing.id, folderId);
            // 如果标题有变化，更新标题
            if (newTitle && newTitle !== existing.title) {
                await chrome.bookmarks.update(existing.id, { title: newTitle });
            }
        } else {
            recentlyProcessedUrls.add(url);
            await chrome.bookmarks.create({
                parentId: folderId,
                title: newTitle || title,
                url: url
            });
            setTimeout(() => recentlyProcessedUrls.delete(url), 10000);
        }
        
        // 4. 发送 Toast 消息给页面 (反馈给用户)
        if (tabId) {
            chrome.tabs.sendMessage(tabId, {
                type: 'SHOW_TOAST',
                message: t('bookmarkedSuccess', { category }),
                status: 'success'
            }).catch(() => {}); // 忽略错误（如果页面未加载完成）
        }
        
        // 5. 记录历史
        await addHistoryItem({ title: newTitle || title, url, category });

        return { success: true, category };
        
    } catch (error) {
        console.error('手动处理失败:', error);
        // 发送错误提示
        if (tabId) {
             chrome.tabs.sendMessage(tabId, {
                type: 'SHOW_TOAST',
                message: t('failedPrefix') + error.message,
                status: 'error'
            }).catch(() => {});
        }
        return { success: false, error: error.message };
    }
}

// 处理悬浮球请求 (保留逻辑)
async function handleAiBookmarkRequest(data, tabId) {
    // ... (逻辑同上，只是入口参数不同)
    // 为简化代码，这里不再赘述，实际上 Popup 触发是目前主要方式
    return handleManualTrigger(tabId, data.url, data.title); 
}

// 通用分类逻辑 (用于原生监听)
async function processBookmarkClassification(bookmarkId, title, url, pageContent) {
    let category;
    let newTitle = title;

    try {
        const { allowNewFolders, enableSmartRename } = await chrome.storage.sync.get({ 
            allowNewFolders: true, 
            enableSmartRename: false 
        });
        const existingFolders = await getExistingFolderNames();
        
        const result = await classifyWithLLM(title, url, pageContent, existingFolders, allowNewFolders, enableSmartRename);
        category = result.category;
        newTitle = result.title;
    } catch (error) {
        console.warn('LLM分类失败，使用默认分类:', error);
        category = t('defaultFolder');
    }
    console.log(`分类结果: ${category}, 新标题: ${newTitle}`);
    
    if (category) {
        const folderId = await createOrGetFolder(category);
        await moveBookmark(bookmarkId, folderId);
        
        // 如果标题改变了，更新书签
        if (newTitle && newTitle !== title) {
            await chrome.bookmarks.update(bookmarkId, { title: newTitle });
        }
        
        // 记录历史
        await addHistoryItem({ title: newTitle || title, url, category });

        // 尝试发送 Toast 通知
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].url === url) {
                 chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SHOW_TOAST',
                    message: t('toastAutoBookmarked', { category }),
                    status: 'success'
                });
            }
        } catch (e) {}
    }
}

// 从指定标签页提取内容
async function extractPageContentFromTab(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                const description = document.querySelector('meta[name="description"]')?.content || '';
                const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
                const body = document.body.innerText.substring(0, 500).replace(/\s+/g, ' ');
                return { description, keywords, body };
            }
        });
        
        if (results && results[0] && results[0].result) {
            return results[0].result;
        }
    } catch (e) {
        console.warn('无法提取内容:', e);
    }
    return { description: '', keywords: '' };
}

// 查找匹配 URL 的内容 (用于 onCreated)
async function extractPageContent(url) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    
    // 简单匹配
    if (tab && (tab.url === url || tab.url.startsWith(url) || url.startsWith(tab.url))) {
        return await extractPageContentFromTab(tab.id);
    }
  } catch (e) {
      console.warn('无法从标签页提取内容:', e);
  }
  return { description: '', keywords: '' };
}

async function findBookmarkByUrl(url) {
    const results = await chrome.bookmarks.search({ url });
    return results.length > 0 ? results[0] : null;
}
