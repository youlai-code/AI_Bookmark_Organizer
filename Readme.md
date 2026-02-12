# AI书签整理 (AI Bookmark Organizer)

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=000)
![Chrome APIs](https://img.shields.io/badge/Chrome-APIs-4285F4?logo=googlechrome&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-DeepSeek%20%7C%20ChatGPT%20%7C%20Gemini-111827)
![i18n](https://img.shields.io/badge/i18n-zh--CN%20%7C%20en-6B7280)

![alt text](icons/Preview.png)

## 快速开始

### 安装（本地加载）
1. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
2. 开启右上角的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择本项目根目录（包含 `manifest.json` 的文件夹）。

### 一键使用
1. 打开任意网页。
2. 点击页面右下角悬浮按钮，或点击工具栏扩展图标后选择“智能收藏此页面”。
3. 扩展会分析页面并将书签保存到合适的文件夹。

## 简介
这是一个浏览器插件，利用 AI/大语言模型（LLM）的能力，在您添加书签时自动分析网页内容，并将其归类到合适的文件夹中，帮助您持续保持书签结构清爽可用。

## 功能特点
- **AI 智能分类**：自动提取网页标题、描述和正文，利用 LLM 进行分类。
- **多模型支持**：支持默认模型（免费/无需配置）、DeepSeek、ChatGPT、Gemini。
- **自动整理**：可选择是否允许 AI 自动创建文件夹，并设置创建策略（保守/平衡/激进）。
- **收藏夹树管理**：提供独立的“收藏夹树”页面，用于预览与管理书签结构。
- **悬浮按钮与快捷触发**：页面内快捷入口，支持拖动；也可通过弹窗触发收藏。
- **收藏记录**：可查看近期收藏记录，并支持直接打开与取消收藏。
- **多语言 UI**：支持中英文切换。

## 配置指南
1. 安装完成后，点击浏览器工具栏的插件图标。
2. 在弹出窗口中进行如下配置：
   - **LLM 提供商**：选择默认模型 / DeepSeek / ChatGPT / Gemini。
   - **API Key**：填写对应平台的密钥（默认模型不需要）。
   - **Model / Endpoint ID**：按提示填写或使用默认值。
   - **允许 AI 自动创建文件夹**：开启后 AI 可以在需要时新建更合适的文件夹；关闭则只会从现有文件夹中选择。
   - **AI 创建文件夹分类标准**：保守/平衡/激进（鼠标悬浮可查看说明）。
3. 设置为自动保存，无需手动点击保存按钮。

## 使用说明

### 方式一：悬浮按钮
- 在网页右下角显示悬浮按钮，点击即可对当前页面执行“智能收藏”。
- 悬浮按钮支持拖动位置；如不需要，可在设置页关闭。

### 方式二：弹窗
- 点击浏览器工具栏的扩展图标。
- 点击“智能收藏此页面”。

### 收藏夹树（管理与预览）
- 在弹窗中点击“收藏夹树”入口，查看完整书签层级。
- 支持右键编辑与删除，便于批量整理。

### 收藏记录
- 在弹窗与设置页可查看近期收藏记录。
- 支持点击记录直接打开链接，并可一键取消收藏。

## 权限与隐私

### 权限说明
- `bookmarks`：创建/移动/更新书签与文件夹（扩展的核心功能）。
- `activeTab` / `scripting`：在你触发收藏时读取当前页面标题与内容，用于 AI 分类。
- `storage`：在本地保存你的设置（模型选择、API Key、策略、语言等）。

### 隐私说明
- 扩展仅在你触发“智能收藏”时处理当前页面信息，用于分类与保存。
- 你的模型配置与 API Key 存储在本地浏览器中；不会被作者服务端收集。

## 常见问题（FAQ）

### 为什么分类不准确？
- 建议选择内容更完整的页面（正文越完整越好）。
- 可在设置中调整“允许新建文件夹”与分类策略（保守/平衡/激进）。
- 如使用自定义模型，请确认 API Key 与 Model/Endpoint 配置正确。

### 悬浮按钮不显示/想在某些网站隐藏？
- 请在设置中确认“显示悬浮智能收藏按钮”已开启。
- 你也可以针对当前网站隐藏悬浮按钮，并在设置页恢复显示。

### 收藏后找不到书签放到哪里了？
- 打开“收藏夹树”页面查看完整层级。
- 也可在“收藏记录”中点击条目跳转并定位。

## 反馈与支持
- 反馈邮箱：tenb68@126.com

---

<details>
<summary>开发者信息（项目结构 / 技术栈）</summary>

### 项目结构
```text
AI Bookmark Organizer (repo root)/
├── archive/            # 归档：上架素材/部署脚本/测试脚本（非扩展运行时）
├── manifest.json       # 插件配置文件
├── background.js       # 后台服务（监听书签事件、提取内容）
├── popup/              # 弹窗入口
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/            # 设置页
├── manager/            # 收藏夹树（预览与管理）
└── utils/              # 工具函数（i18n、LLM、书签/历史等）
```

### 技术栈
- **Manifest V3**：Chrome 扩展开发的最新标准。
- **JavaScript (ES6+)**：核心逻辑实现。
- **Chrome APIs**：`bookmarks` / `scripting` / `storage`。

</details>

## 美术风格与设计规范 (Design System)
本项目采用现代简约的浅色主题设计 (Light Mode)，注重沉浸式体验与高效信息展示。

### 1. 配色方案 (Color Palette)
- **背景色体系**: 
  - 页面背景: `#ffffff` (Pure White)
  - 组件/菜单背景: `#f8f9fa` (Light Gray)
  - 悬停交互: `#e8eaed`
- **文字颜色**:
  - 主标题/正文: `#202124` (Dark Text)
  - 次要信息: `#5f6368` (Secondary Grey)
- **功能色**:
  - 品牌蓝: `#1a73e8` (链接/主操作)
  - 成功绿: `#188038` (保存成功/确认)
  - 警示红: `#d93025` (删除/危险操作)

### 2. 图标系统 (Iconography)
- **风格**: 统一采用 SVG 中空线条风格 (Outline Style)。
- **视觉统一**: 图标线条宽度一致，尺寸规范（如 16px/24px），在深色背景下保持清晰锐利。

### 3. 布局与交互 (Layout & UX)
- **极简卡片**: 移除多余的边框和阴影，内容区块扁平化，减少视觉噪点。
- **全页滚动**: 摒弃局部滚动条，采用整页滚动设计，提升浏览流畅度。
- **CLI 风格收藏夹树**: 
  - 采用类似命令行工具的树状结构展示。
  - 使用 ASCII 风格连接符 (`│`, `└─`) 配合文件夹/文件图标，清晰展示层级关系。
- **自定义交互**:
  - **右键菜单**: 浅色风格的自定义上下文菜单 (Context Menu)。
  - **模态框**: 居中悬浮的编辑窗口，支持文件夹选择与信息修改。

## 项目结构
```text
AI Bookmark Organizer (repo root)/
├── archive/            # 归档：上架素材/部署脚本/测试脚本（非扩展运行时）
├── manifest.json       # 插件配置文件
├── background.js       # 后台服务（监听书签事件、提取内容）
├── popup/              # 弹窗入口
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/            # 设置页
├── manager/            # 收藏夹树（预览与管理）
└── utils/              # 工具函数（i18n、LLM、书签/历史等）
```

## 技术栈
- **Manifest V3**：Chrome 扩展开发的最新标准。
- **JavaScript (ES6+)**：核心逻辑实现。
- **Chrome APIs**：
  - `bookmarks`: 监听和移动书签。
  - `scripting`: 动态提取当前标签页的元数据。
  - `storage`: 安全存储 API Key 等配置。
