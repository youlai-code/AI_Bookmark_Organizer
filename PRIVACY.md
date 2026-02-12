# Privacy Policy / 隐私政策

**Last Updated / 最后更新日期**: 2026-02-12

---

## English

**AI Bookmark Organizer / AI书签整理** ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how this Chrome extension handles your data.

### 1. Data Collection and Usage
This extension can process web page information in order to classify bookmarks. Depending on your chosen AI provider, some data may be sent to third-party services.

**What we process**
- **Page data (for classification)**: the current page URL, page title, and limited extracted text (e.g., meta description/keywords and a truncated portion of page body text).
- **Bookmark actions**: bookmark title/URL you create or modify, and the selected category folder name.

**Where processing happens**
- **Local-only features**: UI rendering, bookmark moving/renaming, history display, and language switching run in your browser.
- **AI classification**:
  - If you select an external provider (e.g., DeepSeek / OpenAI / Google Gemini), the extension sends the page data and your prompt to that provider’s API.
  - If you select the **Default Model (free/no configuration)**, the extension sends the same request to our proxy endpoint (currently `https://youlainote.cloud`) which forwards the request to an AI model. Your request still leaves your device.

**What we do NOT do**
- We do not sell your data.
- We do not include analytics or advertising SDKs in the extension.

### 2. Data Storage
The extension stores the following data using Chrome storage:
- **Settings** (`chrome.storage.sync`): selected AI provider, optional API keys, model identifiers, proxy/base URL, and feature toggles.
- **History** (`chrome.storage.local`): recent classification results (title, url, category, timestamp) for your convenience.

We do not operate a separate user account system.

### 3. Permissions
We request the minimum permissions necessary for the extension to function:

- **`bookmarks`**: create/move/update bookmarks and folders.
- **`activeTab`**: access the currently active tab when you manually trigger classification.
- **`scripting`**: extract limited page metadata/text for classification.
- **`storage`**: save settings and history.
- **Host permissions (`<all_urls>`)**: allow the extension to run on pages you visit and extract page information when needed.

### 4. Third-Party Services
If you choose an external AI provider, your requests are subject to that provider’s privacy policy and data handling practices.

Potential third parties include:
- DeepSeek API
- OpenAI API (ChatGPT)
- Google Gemini API
- Our proxy endpoint for the Default Model (`https://youlainote.cloud`) which forwards requests to an AI model

We recommend reviewing the selected provider’s policy before enabling it.

### 5. Security Notes
- API keys are stored in Chrome storage and are not embedded in the extension package.
- Network requests are made over HTTPS.
- You can remove stored data at any time by uninstalling the extension and/or clearing extension storage.

### 6. Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be posted on this page.

### 7. Contact Us
If you have any questions about this Privacy Policy, please contact us via the Chrome Web Store support page.

---

## 中文 (Chinese)

**AI书签整理 / AI Bookmark Organizer**（“我们”）非常重视您的隐私。本隐私政策旨在说明本 Chrome 扩展程序如何处理您的数据。

### 1. 数据收集与使用
本扩展会为“AI 自动分类书签”处理网页信息。根据你选择的 AI 提供商，部分数据可能会发送到第三方服务。

**我们会处理什么**
- **网页数据（用于分类）**：当前页面 URL、页面标题、以及有限的页面文本（例如 description/keywords，以及截断后的部分正文文本）。
- **书签操作数据**：你创建/更新的书签标题与 URL、以及分类目标文件夹名。

**数据在哪里处理**
- **仅本地处理的功能**：界面展示、移动/重命名书签、历史记录展示、语言切换等都在你的浏览器中完成。
- **AI 分类**：
  - 若选择外部提供商（如 DeepSeek / OpenAI / Google Gemini），扩展会将上述网页数据与提示词发送到对应 API。
  - 若选择 **默认模型（免费/无需配置）**，扩展会把请求发送到我们的代理地址（当前为 `https://youlainote.cloud`）进行转发；你的请求仍然会离开本地设备。

**我们不会做什么**
- 我们不会出售你的数据。
- 扩展中不包含统计分析或广告 SDK。

### 2. 数据存储
扩展会通过 Chrome 存储保存以下信息：
- **设置项**（`chrome.storage.sync`）：AI 提供商选择、可选的 API Key、模型/端点、代理/基础地址、功能开关等。
- **历史记录**（`chrome.storage.local`）：最近的分类结果（标题、链接、分类、时间），便于你回看。

我们不提供独立的用户账号体系。

### 3. 权限说明
我们仅申请扩展正常运行所需的最小权限：

- **`bookmarks`（书签）**：创建/移动/更新书签与文件夹。
- **`activeTab`（当前标签页）**：在你手动触发分类时访问当前标签页。
- **`scripting`（脚本注入）**：提取有限的页面元数据/文本用于分类。
- **`storage`（存储）**：保存设置与历史记录。
- **主机权限（`<all_urls>`）**：允许扩展在你访问的页面上运行，并在需要时提取页面信息。

### 4. 第三方服务
当你选择外部 AI 提供商时，请求会受到该提供商隐私政策与数据处理方式的约束。

可能涉及的第三方包括：
- DeepSeek API
- OpenAI API（ChatGPT）
- Google Gemini API
- 默认模型的代理服务（`https://youlainote.cloud`，作者免费提供的 DeepSeek 中转/加速通道，用于转发到 DeepSeek 模型）

建议你在启用前阅读所选提供商的隐私政策。

### 5. 安全说明
- API Key 存储在 Chrome 扩展存储中，不会打包进扩展发布文件。
- 网络请求使用 HTTPS。
- 你可随时卸载扩展并/或清理扩展存储以删除本地数据。

### 6. 政策变更
我们可能会不时更新本隐私政策。任何变更都将发布在此页面上。

### 7. 联系我们
如果您对本隐私政策有任何疑问，请通过 Chrome 应用商店的支持页面与我们联系。
