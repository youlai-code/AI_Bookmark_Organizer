import { classifyWithLLM } from './utils/llm.js';
import { createOrGetFolder, moveBookmark, getExistingFolderNames } from './utils/bookmark.js';
import { addHistoryItem } from './utils/history.js';
import { initI18n, t } from './utils/i18n.js';
import { log, warn, error } from './utils/logger.js';

log('[Background] Service Worker Initializing...');

// Initialize i18n asynchronously - DO NOT await at top level
initI18n().then(() => {
    log('[Background] I18n Initialized');
}).catch(err => {
    error('[Background] I18n Init Failed:', err);
});

// ==========================================
// Smart Bookmarker Controller
// ==========================================
class SmartBookmarker {
  constructor() {
    this.recentlyProcessedUrls = new Set();
    this.processingQueue = new Set(); // Prevent double processing
  }

  // Check if URL is supported for content extraction
  isSupportedUrl(url) {
    return url && (url.startsWith('http://') || url.startsWith('https://'));
  }

  // Main entry point for bookmarking logic
  async process({ tabId, url, title, bookmarkId = null, isManual = false }) {
    const processId = url; // Simple lock key
    
    if (this.processingQueue.has(processId) && !isManual) {
      log('Skipping duplicate processing for:', url);
      return;
    }

    this.processingQueue.add(processId);
    if (isManual) this.notifyStatus(tabId, 'analyzing');

    try {
      // 1. Extract Content
      const content = await this.extractContent(tabId, url);
      
      // 2. Classify
      const classification = await this.classify(title, url, content);
      
      // 3. Save/Update Bookmark
      await this.save(classification, url, title, bookmarkId);

      // 4. Notify User
      if (isManual && tabId) {
        this.notifyStatus(tabId, 'success', classification.category);
      } else if (!isManual) {
        // For auto-processing, try to find active tab to notify
        this.notifyActiveTab(url, 'auto_success', classification.category);
      }

      return { success: true, category: classification.category };

    } catch (error) {
      error('[SmartBookmarker] Failed:', error);
      if (isManual && tabId) {
        this.notifyStatus(tabId, 'error', error.message);
      }
      return { success: false, error: error.message };

    } finally {
      this.processingQueue.delete(processId);
    }
  }

  // Extract content safely
  async extractContent(tabId, url) {
    // If no tabId provided (e.g. background bookmark creation), try to find a matching tab
    if (!tabId) {
      tabId = await this.findTabByUrl(url);
    }

    if (!tabId || !this.isSupportedUrl(url)) {
      log('[SmartBookmarker] Skipping content extraction (No tab or unsupported URL)');
      return { description: '', keywords: '', body: '' };
    }

    try {
      // Inject script with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Content extraction timed out')), 5000)
      );

      const executionPromise = chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const description = document.querySelector('meta[name="description"]')?.content || '';
          const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
          // Limit body text to avoid token limits
          const body = document.body ? document.body.innerText.substring(0, 1000).replace(/\s+/g, ' ') : ''; 
          return { description, keywords, body };
        }
      });

      const results = await Promise.race([executionPromise, timeoutPromise]);
      
      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    } catch (error) {
      warn('[SmartBookmarker] Content extraction warning:', error.message);
      // Fail gracefully - continue without content
    }

    return { description: '', keywords: '', body: '' };
  }

  // LLM Classification
  async classify(title, url, content) {
    try {
      let { allowNewFolders, folderCreationLevel, enableSmartRename } = await chrome.storage.sync.get({ 
        allowNewFolders: true, 
        folderCreationLevel: 'weak',
        enableSmartRename: false 
      });
      
      // Legacy migration logic (same as options.js to ensure consistency)
      let finalLevel = 'weak';

      if (typeof allowNewFolders === 'string') {
          // Legacy: was string "off", "weak", "medium", "strong"
          if (allowNewFolders === 'off') {
            finalLevel = 'off';
          } else {
            finalLevel = allowNewFolders;
          }
      } else if (typeof allowNewFolders === 'boolean') {
          // Current: boolean
          if (!allowNewFolders) {
            finalLevel = 'off';
          } else {
            // Use the separate level setting, or default to weak
            finalLevel = folderCreationLevel || 'weak'; 
          }
      }

      // Ensure 'off' is respected
      if (finalLevel !== 'off' && !['weak', 'medium', 'strong'].includes(finalLevel)) {
          finalLevel = 'medium';
      }

      const existingFolders = await getExistingFolderNames();
      
      const result = await classifyWithLLM(title, url, content, existingFolders, finalLevel, enableSmartRename);
      return result;
    } catch (error) {
      // If critical timeout, rethrow to stop process or handle specifically
      if (error.message.includes('timeout')) throw error;
      
      warn('[SmartBookmarker] LLM failed, using default:', error);
      return { category: t('defaultFolder') || 'Read Later', title: title };
    }
  }

  // Save to bookmarks
  async save(classification, url, originalTitle, bookmarkId) {
    const { category, title: newTitle } = classification;
    const folderId = await createOrGetFolder(category);

    // If updating an existing bookmark object (from onCreated)
    if (bookmarkId) {
      await moveBookmark(bookmarkId, folderId);
      if (newTitle && newTitle !== originalTitle) {
        await chrome.bookmarks.update(bookmarkId, { title: newTitle });
      }
    } else {
      // Creating a new one (Manual trigger)
      // Check if already exists to avoid duplicates
      const existing = await this.findBookmarkByUrl(url);
      if (existing) {
        await moveBookmark(existing.id, folderId);
        if (newTitle && newTitle !== existing.title) {
          await chrome.bookmarks.update(existing.id, { title: newTitle });
        }
      } else {
        // Mark as recently processed to avoid onCreated loop
        this.recentlyProcessedUrls.add(url);
        await chrome.bookmarks.create({
          parentId: folderId,
          title: newTitle || originalTitle,
          url: url
        });
        // Cleanup cache after 10s
        setTimeout(() => this.recentlyProcessedUrls.delete(url), 10000);
      }
    }

    // Add to history
    await addHistoryItem({ 
      title: newTitle || originalTitle, 
      url, 
      category 
    });
  }

  // Helpers
  async findTabByUrl(url) {
    try {
      const tabs = await chrome.tabs.query({ url: url });
      if (tabs && tabs.length > 0) return tabs[0].id;
      
      // Fallback: active tab?
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0 && activeTabs[0].url === url) return activeTabs[0].id;
    } catch (e) { /* ignore */ }
    return null;
  }

  async findBookmarkByUrl(url) {
    const results = await chrome.bookmarks.search({ url });
    return results.length > 0 ? results[0] : null;
  }

  notifyStatus(tabId, status, messageOrCategory) {
    if (!tabId) return;
    
    let msg = '';
    let type = 'info';

    switch (status) {
      case 'analyzing':
        msg = t('toastAnalyzing') || 'Analyzing...';
        type = 'info';
        break;
      case 'success':
        msg = t('bookmarkedSuccess', { category: messageOrCategory });
        type = 'success';
        break;
      case 'error':
        msg = (t('failedPrefix') || 'Failed: ') + messageOrCategory;
        type = 'error';
        break;
    }

    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_TOAST',
      message: msg,
      status: type
    }).catch(() => {}); // Ignore if content script not ready
  }

  async notifyActiveTab(url, type, category) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url === url) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SHOW_TOAST',
          message: t('toastAutoBookmarked', { category }),
          status: 'success'
        }).catch(() => {});
      }
    } catch (e) {}
  }
}

const bookmarker = new SmartBookmarker();

// ==========================================
// Event Listeners
// ==========================================

// 1. Native Bookmark Creation
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (!bookmark.url) return; // Folder
  if (bookmarker.recentlyProcessedUrls.has(bookmark.url)) return; // Created by us
  if (!bookmarker.isSupportedUrl(bookmark.url)) return; // Local file or chrome://

  await bookmarker.process({
    tabId: null, // Will try to find tab
    url: bookmark.url,
    title: bookmark.title,
    bookmarkId: id,
    isManual: false
  });
});

// 2. Keyboard Shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'trigger_smart_bookmark') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab && bookmarker.isSupportedUrl(tab.url)) {
      await bookmarker.process({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        isManual: true
      });
    }
  }
});

// 3. Message Passing (Popup & Content Script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Case A: Popup Trigger
  if (request.type === 'TRIGGER_CLASSIFICATION_FROM_POPUP') {
    bookmarker.process({
      tabId: request.tabId,
      url: request.url,
      title: request.title,
      isManual: true
    }).then(result => sendResponse(result));
    return true; // Keep channel open
  }

  // Case B: Content Script Floating Button Trigger
  if (request.type === 'AI_BOOKMARK') {
    const tabId = sender.tab ? sender.tab.id : null;
    bookmarker.process({
      tabId: tabId,
      url: request.data.url,
      title: request.data.title,
      isManual: true // Floating button is considered manual trigger
    }).then(result => sendResponse(result));
    return true; // Keep channel open
  }
});
