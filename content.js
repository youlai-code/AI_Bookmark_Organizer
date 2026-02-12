// I18n Helper for Content Script
const I18n = {
    lang: 'zh_CN',
    messages: null,
    async init() {
        const data = await chrome.storage.sync.get('language');
        this.lang = data.language || 'zh_CN';
        await this.loadMessages();
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.language) {
                this.lang = changes.language.newValue;
                this.loadMessages().then(() => this.updateUI());
            }
        });
    },
    async loadMessages() {
        try {
            const url = chrome.runtime.getURL(`_locales/${this.lang}/messages.json`);
            const res = await fetch(url);
            this.messages = await res.json();
        } catch (e) {
            // fallback
            if (this.lang !== 'zh_CN') {
                 try {
                    const url = chrome.runtime.getURL(`_locales/zh_CN/messages.json`);
                    const res = await fetch(url);
                    this.messages = await res.json();
                 } catch(e2) {}
            }
        }
    },
    t(key, replacements) {
        if (!this.messages || !this.messages[key]) return key;
        let msg = this.messages[key].message;
        if (replacements) {
             msg = msg.replace(/\$([a-zA-Z0-9_]+)\$/g, (m, k) => replacements[k.toLowerCase()] || m);
        }
        return msg;
    },
    updateUI() {
        const btn = document.getElementById('aibook-floating-btn');
        if (btn) btn.title = this.t('floatingBtnTitle');
    }
};

// 创建悬浮按钮 (小巧、右下角、可拖动、右键屏蔽)
async function createFloatingButton() {
  if (document.getElementById('aibook-floating-btn')) return;

  // 1. Check global setting
  const { showFloatingButton } = await chrome.storage.sync.get({ showFloatingButton: true });
  if (!showFloatingButton) return;

  // 检查是否在此域名禁用
  const hostname = window.location.hostname;
  const { disabledDomains } = await chrome.storage.sync.get({ disabledDomains: [] });
  if (disabledDomains.includes(hostname)) {
    return;
  }

  const btn = document.createElement('div');
  btn.id = 'aibook-floating-btn';
  btn.title = I18n.t('floatingBtnTitle');
  
  // 极简风格的图标 (PNG)
  const iconUrl = chrome.runtime.getURL('icons/icon128.png');
  btn.innerHTML = `
    <img src="${iconUrl}" draggable="false" alt="AI Bookmark" />
  `;
  
  // 绑定事件
  btn.addEventListener('click', (e) => {
    // 如果是拖动结束的点击，不触发收藏
    if (btn.dataset.isDragging === 'true') {
        btn.dataset.isDragging = 'false';
        return;
    }
    handleBookmark();
  });

  // 添加右键菜单
  btn.addEventListener('contextmenu', handleContextMenu);

  document.body.appendChild(btn);

  // 启用拖动
  makeDraggable(btn);
  
  // Apply auto theme
  applyAutoTheme(btn);
}

// Auto Theme Detection and Application
function applyAutoTheme(btn) {
  const updateTheme = () => {
    // Check for dark mode
    // 1. Media Query
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // 2. Computed background color brightness (simplified check)
    // Get body background color
    let isDarkBg = false;
    try {
        const bgColor = window.getComputedStyle(document.body).backgroundColor;
        const rgb = bgColor.match(/\d+/g);
        if (rgb) {
            const brightness = Math.round(((parseInt(rgb[0]) * 299) + (parseInt(rgb[1]) * 587) + (parseInt(rgb[2]) * 114)) / 1000);
            if (brightness < 128) { // Standard threshold is 128
                isDarkBg = true;
            }
        }
    } catch(e) {}
    
    // Determine final theme: prefer computed bg, fallback to media query
    const isDark = isDarkBg || prefersDark;
    
    if (isDark) {
        btn.classList.add('aibook-dark-mode');
    } else {
        btn.classList.remove('aibook-dark-mode');
    }
  };
  
  // Initial check
  updateTheme();
  
  // Listen for changes
  if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
  }
  
  // Observer for body class changes (often used by sites to toggle theme)
  const observer = new MutationObserver(updateTheme);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
}

// 拖动逻辑
function makeDraggable(element) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    let hasMoved = false;

    element.addEventListener('mousedown', dragStart);
    
    // 触摸屏支持
    element.addEventListener('touchstart', dragStart, { passive: false });

    function dragStart(e) {
        if (e.type === 'mousedown' && e.button !== 0) return; // 只允许左键拖动

        const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
        const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;

        isDragging = true;
        hasMoved = false;
        startX = clientX;
        startY = clientY;

        const rect = element.getBoundingClientRect();
        // 转换为 fixed 定位的 top/left
        initialLeft = rect.left;
        initialTop = rect.top;

        // 移除 bottom/right 属性，改用 top/left 定位以支持自由移动
        element.style.bottom = 'auto';
        element.style.right = 'auto';
        element.style.left = `${initialLeft}px`;
        element.style.top = `${initialTop}px`;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
        const clientY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;

        const dx = clientX - startX;
        const dy = clientY - startY;

        // 只有移动超过一定距离才算拖动，避免微小抖动影响点击
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasMoved = true;
            element.dataset.isDragging = 'true'; // 标记正在拖动
        }

        element.style.left = `${initialLeft + dx}px`;
        element.style.top = `${initialTop + dy}px`;
    }

    function dragEnd() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('touchend', dragEnd);

        // 如果没有移动，清除拖动标记，允许 click 事件触发
        if (!hasMoved) {
            element.dataset.isDragging = 'false';
        }
    }
}

// 处理右键菜单
function handleContextMenu(e) {
    e.preventDefault();
    
    // 使用原生 confirm 确保 UI 绝对可用
    if (confirm(I18n.t('confirmHideFloatingBtn'))) {
        disableOnCurrentDomain();
    }
}

async function disableOnCurrentDomain() {
    const hostname = window.location.hostname;
    const { disabledDomains } = await chrome.storage.sync.get({ disabledDomains: [] });
    
    if (!disabledDomains.includes(hostname)) {
        disabledDomains.push(hostname);
        await chrome.storage.sync.set({ disabledDomains });
        showToast(I18n.t('hideSuccess'), 'info');
        const btn = document.getElementById('aibook-floating-btn');
        if (btn) btn.remove();
    }
}


// 创建 Toast 提示元素
function createToast() {
  if (document.getElementById('aibook-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'aibook-toast';
  document.body.appendChild(toast);
}

// 显示 Toast
function showToast(message, type = 'info') {
  createToast(); // 确保存在
  const toast = document.getElementById('aibook-toast');
  const btn = document.getElementById('aibook-floating-btn');
  
  // 重置位置样式
  toast.style.top = 'auto';
  toast.style.bottom = 'auto';
  toast.style.left = 'auto';
  toast.style.right = 'auto';

  // 动态计算位置
  if (btn && btn.offsetParent !== null) { // 按钮存在且可见
      const rect = btn.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // 垂直定位：如果按钮在下半屏，Toast 在上方；如果在上半屏，Toast 在下方
      if (rect.top > viewportHeight / 2) {
          toast.style.bottom = `${viewportHeight - rect.top + 12}px`;
      } else {
          toast.style.top = `${rect.bottom + 12}px`;
      }

      // 水平定位：尽量靠右对齐按钮，防止溢出
      if (rect.left > viewportWidth / 2) {
          // 按钮在右侧，Toast 右对齐按钮右边缘
          toast.style.right = `${viewportWidth - rect.right}px`;
      } else {
          // 按钮在左侧，Toast 左对齐按钮左边缘
          toast.style.left = `${rect.left}px`;
      }
  } else {
      // 默认位置：右上角
      toast.style.top = '20px';
      toast.style.right = '20px';
  }
  
  toast.textContent = message;
  toast.className = type; // success, error, or info
  
  // 强制重绘以应用位置变化
  void toast.offsetWidth;

  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// 处理收藏点击
async function handleBookmark() {
  const btn = document.getElementById('aibook-floating-btn');
  
  if (btn.dataset.loading === 'true') return;
  
  // 动画状态
  btn.dataset.loading = 'true';
  btn.classList.add('aibook-loading');
  
  try {
    const pageInfo = {
      title: document.title,
      url: window.location.href,
      content: {
        description: document.querySelector('meta[name="description"]')?.content || '',
        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
        body: document.body.innerText.substring(0, 1000).replace(/\s+/g, ' ')
      }
    };
    
    // 发送消息给 background
    let response;
    try {
        response = await chrome.runtime.sendMessage({
            type: 'AI_BOOKMARK',
            data: pageInfo
        });
    } catch (e) {
        if (e.message.includes('Extension context invalidated')) {
            throw new Error('插件已更新，请刷新页面后重试');
        }
        throw e;
    }
    
    if (response && response.success) {
      showToast(I18n.t('bookmarkedSuccess', { category: response.category }), 'success');
      // 成功后按钮变绿
      btn.classList.add('aibook-success');
      setTimeout(() => { 
          btn.classList.remove('aibook-success');
      }, 2000);
    } else {
      throw new Error(response.error || '未知错误');
    }
    
  } catch (error) {
    console.error('AI Bookmark Error:', error);
    showToast(I18n.t('failedPrefix') + error.message, 'error');
  } finally {
    // 恢复状态
    btn.dataset.loading = 'false';
    btn.classList.remove('aibook-loading');
  }
}

// 监听来自 Background 的消息 (主要用于快捷键触发后的反馈)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SHOW_TOAST') {
        showToast(request.message, request.status);
    }
});

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.showFloatingButton) {
            if (changes.showFloatingButton.newValue) {
                createFloatingButton();
            } else {
                const btn = document.getElementById('aibook-floating-btn');
                if (btn) btn.remove();
            }
        }
        
        if (changes.disabledDomains) {
            const hostname = window.location.hostname;
            const isDisabled = changes.disabledDomains.newValue.includes(hostname);
            const btn = document.getElementById('aibook-floating-btn');
            
            if (isDisabled && btn) {
                btn.remove();
            } else if (!isDisabled && !btn) {
                createFloatingButton();
            }
        }
    }
});

// 初始化
if (window.self === window.top) { // 只在顶层窗口显示
    I18n.init().then(() => {
        createFloatingButton();
        createToast();
    });
}
