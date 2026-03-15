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

const LLM_CONFIG_ERROR_CODE = 'MODEL_NOT_CONFIGURED';

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
const FLOATING_BTN_MARGIN = 8;
const DRAG_TRIGGER_DISTANCE = 4;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function updatePeekOffset(element) {
    const peekOffset = Math.round(element.offsetWidth / 2);
    element.style.setProperty('--aibook-peek-offset', `${peekOffset}px`);
}

function placeButtonAt(element, left, top) {
    const maxLeft = Math.max(window.innerWidth - element.offsetWidth, 0);
    const maxTop = Math.max(window.innerHeight - element.offsetHeight, 0);

    const safeLeft = clamp(left, 0, maxLeft);
    const safeTop = clamp(top, 0, maxTop);

    element.style.left = `${safeLeft}px`;
    element.style.top = `${safeTop}px`;
}

function setDockedEdge(element, edge) {
    if (edge) {
        element.dataset.docked = edge;
    } else {
        delete element.dataset.docked;
    }
}

function getCurrentButtonPosition(element) {
    const styleLeft = Number.parseFloat(element.style.left);
    const styleTop = Number.parseFloat(element.style.top);

    if (Number.isFinite(styleLeft) && Number.isFinite(styleTop)) {
        return { left: styleLeft, top: styleTop };
    }

    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
}

function snapToEdge(element, preferredEdge = null) {
    updatePeekOffset(element);

    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const maxLeft = Math.max(window.innerWidth - width, 0);
    const maxTop = Math.max(window.innerHeight - height, 0);

    const position = getCurrentButtonPosition(element);
    let left = clamp(position.left, 0, maxLeft);
    let top = clamp(position.top, 0, maxTop);

    const distances = {
        left,
        right: Math.max(maxLeft - left, 0),
        top,
        bottom: Math.max(maxTop - top, 0)
    };

    const edge = preferredEdge || Object.keys(distances).reduce((nearest, candidate) => {
        return distances[candidate] < distances[nearest] ? candidate : nearest;
    }, 'left');

    if (edge === 'left') {
        left = FLOATING_BTN_MARGIN;
    } else if (edge === 'right') {
        left = Math.max(maxLeft - FLOATING_BTN_MARGIN, 0);
    } else if (edge === 'top') {
        top = FLOATING_BTN_MARGIN;
    } else if (edge === 'bottom') {
        top = Math.max(maxTop - FLOATING_BTN_MARGIN, 0);
    }

    placeButtonAt(element, left, top);
    setDockedEdge(element, edge);
}

function makeDraggable(element) {
    const dragState = {
        isDragging: false,
        hasMoved: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        initialLeft: 0,
        initialTop: 0,
        previousDock: null,
        pendingLeft: null,
        pendingTop: null,
        frameId: 0
    };

    element.dataset.isDragging = 'false';
    placeButtonAt(
        element,
        Math.max(window.innerWidth - element.offsetWidth - FLOATING_BTN_MARGIN, 0),
        Math.max(window.innerHeight - element.offsetHeight - 20, 0)
    );
    snapToEdge(element, 'right');

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('resize', () => {
        if (dragState.isDragging) return;
        const preferredEdge = element.dataset.docked || null;
        snapToEdge(element, preferredEdge);
    });

    function queueMove(left, top) {
        dragState.pendingLeft = left;
        dragState.pendingTop = top;

        if (dragState.frameId) return;

        dragState.frameId = window.requestAnimationFrame(() => {
            placeButtonAt(element, dragState.pendingLeft, dragState.pendingTop);
            dragState.frameId = 0;
        });
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        const currentPosition = getCurrentButtonPosition(element);

        dragState.isDragging = true;
        dragState.hasMoved = false;
        dragState.pointerId = e.pointerId;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        dragState.initialLeft = currentPosition.left;
        dragState.initialTop = currentPosition.top;
        dragState.previousDock = element.dataset.docked || null;

        element.classList.add('aibook-dragging');
        setDockedEdge(element, null);
        element.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        if (!dragState.isDragging || e.pointerId !== dragState.pointerId) return;

        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        if (Math.abs(dx) > DRAG_TRIGGER_DISTANCE || Math.abs(dy) > DRAG_TRIGGER_DISTANCE) {
            dragState.hasMoved = true;
            element.dataset.isDragging = 'true';
        }

        queueMove(dragState.initialLeft + dx, dragState.initialTop + dy);
        e.preventDefault();
    }

    function onPointerUp(e) {
        if (!dragState.isDragging || e.pointerId !== dragState.pointerId) return;

        dragState.isDragging = false;
        element.classList.remove('aibook-dragging');

        if (dragState.frameId) {
            window.cancelAnimationFrame(dragState.frameId);
            placeButtonAt(element, dragState.pendingLeft, dragState.pendingTop);
            dragState.frameId = 0;
        }

        if (dragState.hasMoved) {
            snapToEdge(element);
        } else {
            if (dragState.previousDock) {
                snapToEdge(element, dragState.previousDock);
            }
            element.dataset.isDragging = 'false';
        }

        if (element.hasPointerCapture(e.pointerId)) {
            element.releasePointerCapture(e.pointerId);
        }

        dragState.pointerId = null;
        dragState.previousDock = null;
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
      if (response?.errorCode === LLM_CONFIG_ERROR_CODE) {
        alert(response.error || I18n.t('errorModelNotConfigured') || 'AI model is not configured.');
      }
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

// 监听来自 Background 的消息 (用于插件显式触发后的反馈)
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
