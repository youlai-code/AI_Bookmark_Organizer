# Store Listing / 商店页面介绍

## Chinese (Simplified) - 中文（简体）

### 标题
AI书签整理 - 智能分类您的网络收藏

### 短介绍 (Short Description)
利用 AI 技术自动整理您的浏览器书签。一键智能分类，告别杂乱无章，支持 DeepSeek、ChatGPT 等多种模型，让知识管理更高效。

### 长介绍 (Long Description)
告别书签混乱，拥抱智能整理！

您是否收藏了无数网页却再也找不到？“AI书签整理”是您的私人书签管家，利用先进的大语言模型（LLM）技术，自动分析网页内容并将书签归类到最合适的文件夹中。无论您是需要整理学习资料、工作文档还是日常兴趣，它都能帮您保持收藏夹的井井有条。

核心功能：

- AI 智能分类：不仅仅依赖标题，更能深度分析网页的描述与正文内容，精准理解网页主旨并进行归类。
- 多模型支持：内置免费默认模型，同时全面支持 DeepSeek、ChatGPT (OpenAI)、Google Gemini 等主流大模型。您可以根据需要配置自己的 API Key，享受更强大的推理能力。
- 灵活的整理策略：
  - 保守模式：仅归类到您现有的文件夹中，保持原有结构。
  - 平衡/激进模式：允许 AI 根据内容自动创建新的文件夹，为您构建更科学的知识体系。
- 专业的收藏夹管理：提供独有的“收藏夹树”管理页面，以清晰的层级结构（CLI 风格）展示所有书签，支持拖拽、编辑和批量管理，让您对数千个书签也能了如指掌。
- 隐私与安全：我们重视您的隐私。您的 API Key 和配置信息仅存储在您的本地浏览器中，不会上传至任何无关服务器。

使用场景：

- 学习研究：自动将各种论文、教程、参考资料归类到对应的学科或项目目录下。
- 开发设计：自动区分前端、后端、设计素材、工具文档，查找资源快人一步。
- 日常浏览：购物链接、新闻资讯、娱乐视频自动分流，保持收藏夹清爽。

立即安装，体验 AI 带来的整洁与高效，让您的浏览器书签成为真正的知识宝库！

反馈邮箱：tenb68@126.com

---

## English

### Title
AI Bookmark Organizer - Smarten Up Your Bookmarks

### Short Description
Automatically organize your browser bookmarks using AI. Smart categorization powered by DeepSeek, ChatGPT, and Gemini to keep your knowledge base clean and tidy.

### Long Description
Say Goodbye to Bookmark Chaos!

Is your bookmark bar a mess of unorganized links? Do you save pages "for later" and never find them again? "AI Bookmark Organizer" is your personal bookmark assistant. Leveraging the power of Large Language Models (LLMs), it automatically analyzes web page content and files your bookmarks into the most appropriate folders.

Key Features:

- AI Smart Classification: Goes beyond just titles. It analyzes page descriptions and content to accurately understand context and categorize links effectively.
- Multi-Model Support: Includes a free default model and supports popular LLMs like DeepSeek, ChatGPT (OpenAI), and Google Gemini. Bring your own API Key for enhanced performance.
- Flexible Organization Strategies:
  - Conservative Mode: Sorts bookmarks only into your existing folders.
  - Balanced/Aggressive Mode: Empowers AI to create new folders and subfolders, building a better structure for you.
- Bookmark Tree Manager: A dedicated CLI-style tree view lets you visualize and manage your entire bookmark hierarchy with ease. Perfect for managing thousands of links without getting lost.
- Privacy First: We respect your data. Your API keys and settings are stored securely in your local browser storage.

Perfect For:

- Researchers & Students: Automatically sort papers, tutorials, and references into subject-specific folders.
- Developers & Designers: Keep documentation, assets, and tools neatly organized by technology or category.
- Power Users: Effortlessly manage a massive collection of links without manual sorting.

Install now and experience the power of AI-driven organization. Turn your messy bookmarks into an organized knowledge base!

Feedback Email: tenb68@126.com

---

## 认证说明 / Certification Description (For Reviewers)

### 中文 (Chinese)

尊敬的审核团队：

本扩展“AI书签整理”旨在利用AI技术自动将用户当前浏览的网页归类并保存到合适的书签文件夹中。

**测试指南：**

1.  **无需登录/无需账户**：
    本扩展完全运行在本地，不需要用户注册或登录任何账户。

2.  **AI模型测试（重要）**：
    扩展内置了“默认模型（Default Model）”，**无需配置API Key即可直接使用**。
    - 请在设置页确认“LLM 提供商”选择为“默认模型”即可开始测试。
    - 我们也支持 DeepSeek/ChatGPT 等自定义 Key，但在审核测试时，使用默认模型是最便捷的方式。

3.  **核心功能测试步骤**：
    - **步骤 1**：安装扩展后，打开任意一个内容丰富的网页（如新闻文章、技术博客、维基百科等）。
    - **步骤 2**：点击页面右下角的蓝色悬浮按钮（或点击浏览器工具栏扩展图标，在弹出层中点击“智能收藏”）。
    - **步骤 3**：观察扩展会自动分析页面内容，并将其添加到浏览器书签栏的合适文件夹中（如果文件夹不存在，AI可能会根据策略自动创建（需要在设置中开启“允许新建文件夹”）。
    - **步骤 4**：点击扩展图标 -> “收藏夹树”，可以查看和管理所有书签。

4.  **权限说明**：
    - `bookmarks`: 核心功能，用于创建、移动和组织书签。
    - `activeTab` / `scripting`: 用于提取当前用户正在浏览的网页标题和正文内容，以便AI进行分类分析。
    - `storage`: 用于保存用户的偏好设置（如选择的模型、是否自动新建文件夹等）。

感谢您的审核！

### English

Dear Review Team,

This extension "AI Bookmark Organizer" is designed to use AI technology to automatically categorize and save the web page currently being viewed by the user into the appropriate bookmark folder.

**Testing Guide:**

1.  **No Login Required**:
    This extension runs entirely locally and does not require the user to register or log in to any account.

2.  **AI Model Testing (Important)**:
    The extension has a built-in "Default Model" that **can be used directly without configuring an API Key**.
    - Please confirm that "Default Model" is selected in the "LLM Provider" settings to start testing.
    - We also support custom Keys for DeepSeek/ChatGPT, etc., but using the Default Model is the most convenient way for review.

3.  **Core Feature Testing Steps**:
    - **Step 1**: After installing the extension, open any content-rich web page (such as a news article, technical blog, Wikipedia, etc.).
    - **Step 2**: Click the blue floating button in the bottom right corner of the page (or click the extension icon in the toolbar and click "Smart Bookmark" in the popup).
    - **Step 3**: Observe that the extension automatically analyzes the page content and adds it to the appropriate folder in the browser bookmarks bar (if the folder does not exist, AI may automatically create it based on the strategy)(Note: You need to enable "Allow New Folders" in the settings to allow AI to create new folders).
    - **Step 4**: Click the extension icon -> "Bookmark Tree" to view and manage all bookmarks.

4.  **Permissions Explanation**:
    - `bookmarks`: Core feature, used to create, move, and organize bookmarks.
    - `activeTab` / `scripting`: Used to extract the title and body content of the web page the user is currently browsing, so that AI can perform classification analysis.
    - `storage`: Used to save user preferences (such as the selected model, whether to automatically create new folders, etc.).

Thank you for your review!
