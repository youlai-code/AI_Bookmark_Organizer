# AI书签整理 (AI Bookmark Organizer)

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=000)
![Chrome APIs](https://img.shields.io/badge/Chrome-APIs-4285F4?logo=googlechrome&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-DeepSeek%20%7C%20ChatGPT%20%7C%20Gemini-111827)
![i18n](https://img.shields.io/badge/i18n-zh--CN%20%7C%20en-6B7280)

一个基于 AI 的浏览器书签整理扩展。
它可以在你收藏网页时自动分析内容、推荐分类、支持批量整理，并提供书签备份、导入导出、历史记录和关于页等完整管理能力。

![扩展预览](icons/Preview.png)

## 项目地址

- GitHub: [youlai-code/AI_Bookmark_Organizer](https://github.com/youlai-code/AI_Bookmark_Organizer)
- Edge 下载: [Microsoft Edge 加载项 - AI书签整理](https://microsoftedge.microsoft.com/addons/detail/ai%E4%B9%A6%E7%AD%BE%E6%95%B4%E7%90%86/ahlcopkffkkiokidlkpcdlkcncgicecm)
- 如果这个项目对你有帮助，欢迎点个 Star 支持一下

## 功能特性

- AI 智能分类：分析网页标题、描述和正文内容，把书签归类到更合适的文件夹。
- 多模型支持：支持默认模型、DeepSeek、ChatGPT、Gemini。
- 智能重命名：可对收藏标题进行智能精简，并支持控制标题文本长度。
- 原生收藏接管：可选接管浏览器原生星标和 `Ctrl+D` 收藏行为。
- 书签备份：支持手动备份当前书签到扩展本地。
- HTML 导入导出：可导出为 HTML，也可从 HTML 导入书签。
- 历史记录：查看最近收藏记录，并支持一键取消收藏。
- 多语言界面：支持中文和英文切换。
- 关于页面：内置 GitHub 开源入口和赞赏支持区域。

## 快速开始

### 安装方式

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 打开右上角的“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前项目根目录，也就是包含 `manifest.json` 的目录

### 基本使用

1. 打开任意网页
2. 点击页面右下角悬浮按钮，或者点击浏览器工具栏中的扩展图标
3. 扩展会分析当前页面并自动保存到合适的书签文件夹

## 设置说明

扩展设置页目前主要包含以下部分：

- AI 模型配置：选择模型提供商、填写 API Key、设置 Model 或 Endpoint
- 偏好设置：控制 AI 是否创建新文件夹、是否启用智能重命名、是否显示悬浮按钮等
- 外观设置：切换主题
- 书签备份：创建本地备份、导出 HTML、导入 HTML、恢复或删除备份
- 关于页面：查看项目介绍、GitHub 链接和赞赏码

### 书签备份

- 可在批量操作前手动创建备份
- 备份数据直接保存在扩展本地
- 导入 HTML 时会先自动创建一份安全备份
- 支持从备份列表中恢复或删除历史备份

### 接管浏览器原生收藏事件

- 开启后，浏览器原生星标和 `Ctrl+D` 创建的书签也会参与智能分类
- 某些浏览器在自动同步书签时，可能重新触发原生收藏事件
- 如果没有明确需求，建议保持关闭

## 使用方式

### 方式一：悬浮按钮

- 在网页右下角显示悬浮收藏入口
- 点击后可直接对当前页面执行智能收藏
- 可在设置页中关闭悬浮按钮显示

### 方式二：扩展弹窗

- 点击浏览器工具栏中的扩展图标
- 通过弹窗触发当前页面的智能收藏

### 方式三：原生收藏接管

- 启用后，可接管浏览器原生收藏行为
- 适合希望统一使用 AI 自动归类的用户

## 权限与隐私

### 扩展权限

- `bookmarks`：创建、更新、移动和删除书签及文件夹
- `activeTab` / `scripting`：在你触发收藏时读取当前页面信息，用于 AI 分类
- `storage`：保存模型配置、偏好设置、备份记录和历史数据

### 隐私说明

- 扩展只会在你触发相关操作时处理当前页面内容
- API Key 等配置保存在浏览器本地，不会被项目作者服务器主动收集

## 常见问题

### 为什么分类不够准确？

- 尽量在正文完整、信息充分的页面上使用
- 调整“允许 AI 创建新文件夹”和对应策略
- 检查模型和 API 配置是否正确

### 为什么找不到刚收藏的书签？

- 可以到“书签树”或管理页中查看完整层级
- 也可以在“历史记录”里快速打开最近收藏项目

### 为什么悬浮按钮没有出现？

- 检查设置中是否开启了“显示悬浮智能收藏按钮”
- 某些网站可能已被加入隐藏列表

## 开发说明

### 架构概览

扩展的主流程围绕“触发 → 内容提取 → LLM 分类/重命名 → 写入书签 → 记录历史 → UI 反馈”展开：

- 触发入口
  - 弹窗触发：[popup/popup.js](popup/popup.js) 发送 `TRIGGER_CLASSIFICATION_FROM_POPUP` 给后台
  - 悬浮按钮触发：[content.js](content.js) 发送 `AI_BOOKMARK` 给后台
  - 原生收藏接管：[background.js](background.js) 监听 `chrome.bookmarks.onCreated`（需要在设置里开启）
- 后台编排：[background.js](background.js)
  - `extractContent()` 用 `chrome.scripting.executeScript` 在页面内提取 description/keywords/body（做超时保护）
  - `classify()` 调用 LLM 工具链生成 prompt、请求模型、解析结果
  - `save()` 通过书签工具创建/复用文件夹并移动/创建书签，同时写入历史
  - 反馈：向内容脚本发送 `SHOW_TOAST` 展示结果
- 关键“防重复/防误触发”机制
  - `recentlyProcessedUrls`：避免扩展自己创建的书签再次被 `onCreated` 处理
  - `bookmarkImportState`：导入 HTML/恢复备份时短时间抑制原生事件，避免破坏导入结构

### 目录结构

```text
AI_Bookmark_Organizer/
├─ manifest.json            # Chrome MV3 清单
├─ manifest.firefox.json    # Firefox 适配清单
├─ background.js            # Service Worker：流程编排与消息中枢
├─ content.js               # 内容脚本：悬浮按钮/Toast 与页面内交互
├─ content.css              # 内容脚本样式
├─ popup/                   # 工具栏弹窗：手动触发、快速查看历史/配额
├─ options/                 # 设置页：模型配置、偏好、备份、关于等
├─ manager/                 # 管理页：书签树浏览/搜索/批量分类/批量重命名
├─ utils/                   # 共享工具（书签、历史、i18n、LLM 等）
│  ├─ bookmark.js           # 书签文件夹路径枚举/按路径创建/移动书签
│  ├─ bookmark_backup.js    # 备份/恢复/HTML 导入导出与导入抑制状态
│  ├─ history.js            # 收藏历史（chrome.storage.local）
│  ├─ i18n.js               # 扩展页 i18n 初始化与文案替换
│  └─ llm/                  # LLM 工具链（prompt / providers / parsing / quota）
├─ config/                  # 运行时配置（默认模型日配额、官方代理）
└─ scripts/                 # 打包脚本（Chrome/Firefox）
```

### 模块职责

- 后台（消息与流程）：[background.js](background.js)
  - 统一接收触发请求（popup/content/onCreated），执行内容提取与智能分类，并写入书签/历史
- 内容脚本（页面入口）：[content.js](content.js)、[content.css](content.css)
  - 提供悬浮按钮与 Toast；通过消息调用后台；接受后台 `SHOW_TOAST` 进行反馈
- 弹窗页（轻量操作台）：[popup/popup.js](popup/popup.js)
  - 手动触发智能收藏；展示最近历史与默认模型日配额状态
- 设置页（配置中心）：[options/options.js](options/options.js)
  - 管理模型与偏好开关、隐藏站点、备份导入导出等
- 管理页（书签树与批处理）：[manager/main.js](manager/main.js)
  - 书签树渲染/搜索/拖拽；批量分类与批量重命名（使用同一套 LLM 工具链）

### LLM 工具链

LLM 相关逻辑集中在 [utils/llm](utils/llm)：

- 入口聚合：[utils/llm.js](utils/llm.js)
- 主流程：[utils/llm/core.js](utils/llm/core.js)
  - `classifyWithLLM()`：单条分类/可选重命名
  - `classifyBatchWithLLM()`：批量分类
  - `renameBatchWithLLM()`：批量重命名
- Prompt 构造：[utils/llm/prompt.js](utils/llm/prompt.js)
- Provider 适配：[utils/llm/providers](utils/llm/providers)
  - 通过统一分发层调用不同模型（DeepSeek/ChatGPT/Gemini/豆包/Ollama/智谱等）
- 响应解析：[utils/llm/parsing.js](utils/llm/parsing.js)
  - 支持从文本中提取 JSON；批量时支持按 `index` 映射或按顺序回填
- 配额控制：[utils/llm/quota.js](utils/llm/quota.js)
  - 默认模型（`llmProvider=default`）会消耗本地日配额；其它 provider 由各自平台配额控制

### 消息协议（前端页 ↔ 后台 ↔ 内容脚本）

- popup → background：`TRIGGER_CLASSIFICATION_FROM_POPUP`
  - 请求字段：`tabId/url/title`
- content → background：`AI_BOOKMARK`
  - 请求字段：`data: { title, url, content }`
- background → content：`SHOW_TOAST`
  - 字段：`message/status`

对应实现见：[background.js](background.js)、[popup/popup.js](popup/popup.js)、[content.js](content.js)。

### 存储约定（核心键）

- chrome.storage.sync（同步配置，跨设备）
  - `llmProvider/apiKey/model/ollamaHost/baseUrl/language`
  - `allowNewFolders/folderCreationLevel/enableSmartRename/renameMaxLength`
  - `captureNativeBookmarkEvents/showFloatingButton/disabledDomains` 等偏好项
- chrome.storage.local（本地数据）
  - `history`：最近收藏记录（默认保留 100 条）[utils/history.js](utils/history.js)
  - `bookmarkBackups`：书签备份列表 [utils/bookmark_backup.js](utils/bookmark_backup.js)
  - `bookmarkImportState`：导入/恢复期间的抑制状态（防止原生 onCreated 自动分类）[utils/bookmark_backup.js](utils/bookmark_backup.js)
  - `llmDailyUsage`：默认模型日配额计数 [utils/llm/quota.js](utils/llm/quota.js)

### 打包发布

- Windows 一键打包入口：`scripts/package.cmd`（Chrome）、`scripts/package-firefox.cmd`（Firefox）
- PowerShell 细节与 ZIP 产物： [scripts/package.ps1](scripts/package.ps1)
- Firefox 上架/打包注意事项： [FIREFOX_PACKAGING.md](FIREFOX_PACKAGING.md)

### 技术栈

- Manifest V3
- JavaScript (ES6+)
- Chrome Extension APIs

## 赞赏支持

如果这个项目帮到了你，欢迎通过微信赞赏支持继续迭代。

![微信赞赏码](icons/wechat.jpg)

[![Ko-Fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/C0C81W0Z58)

## 反馈与联系

- GitHub Issues: [提交问题或建议](https://github.com/youlai-code/AI_Bookmark_Organizer/issues)
- Email: `tenb68@126.com`

## License

本项目已开源，具体授权方式请以仓库中的 License 文件为准。
