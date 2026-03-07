# AI 索引规则文件（AIBook）

## 1. 文件目的
本文件用于帮助 AI 在本仓库中快速定位核心代码、理解模块职责，并按优先级建立索引。

适用范围：
- 浏览器扩展主功能分析
- 缺陷定位与功能改动
- 新功能接入时的影响面评估

---

## 2. 项目定位（先读）
这是一个基于 **Chrome Manifest V3** 的浏览器扩展项目，名称为 **AI 书签整理（AI Bookmark Organizer）**。  
核心能力是：在用户触发收藏时，提取当前网页信息，调用 LLM 进行分类，然后自动创建/移动书签到对应文件夹，并记录历史。

触发方式：
- 网页悬浮按钮
- 扩展弹窗按钮
- 快捷键（`Alt+Shift+S`）
- 原生书签创建事件（自动归类）

---

## 3. 核心执行链路（索引主线）
1. 入口触发：`content.js` / `popup/popup.js` / `chrome.commands`
2. 消息汇总：`background.js`
3. 页面信息提取：`background.js`（`chrome.scripting.executeScript`）
4. LLM 分类：`utils/llm.js`
5. 书签写入与移动：`utils/bookmark.js`
6. 历史记录：`utils/history.js`
7. UI 展示与配置：`popup/*`、`options/*`、`manager/*`

---

## 4. 关键代码索引（按优先级）

### P0（必须优先索引）
| 路径 | 用途 | 关键点 |
|---|---|---|
| `manifest.json` | 扩展总配置 | 权限、入口、content scripts、快捷键、i18n |
| `background.js` | 核心编排器 | 触发处理、内容提取、调用分类、保存书签、消息通知 |
| `utils/llm.js` | LLM 调用层 | 多模型适配、超时与重试、Prompt 构造、结果解析 |
| `utils/bookmark.js` | 书签读写封装 | 文件夹查找/创建、书签移动 |
| `utils/history.js` | 历史记录存储 | 收藏历史追加、上限控制、读取/清空 |

### P1（高频关联）
| 路径 | 用途 | 关键点 |
|---|---|---|
| `content.js` | 页面内交互入口 | 悬浮按钮、拖拽、右键隐藏、发消息到 background |
| `content.css` | 页面注入样式 | 悬浮按钮和 Toast 视觉样式 |
| `popup/popup.js` | 弹窗行为逻辑 | 手动触发收藏、历史列表展示、打开管理页/设置页 |
| `popup/popup.html` | 弹窗结构 | 主入口 UI |
| `options/options.js` | 设置页核心逻辑 | 模型配置、策略配置、自动保存、屏蔽域名、历史管理 |
| `options/options.html` | 设置页结构 | 配置入口 UI |
| `manager/main.js` | 收藏夹树管理 | 树渲染、右键菜单、编辑/删除/搜索 |
| `manager/index.html` | 管理页结构 | 收藏夹树页面容器 |

### P2（支撑与配置）
| 路径 | 用途 | 关键点 |
|---|---|---|
| `utils/i18n.js` | 国际化工具 | 文案加载与替换 |
| `utils/logger.js` | 日志封装 | 统一日志输出 |
| `_locales/zh_CN/messages.json` | 中文文案 | UI 文案、错误消息、提示词 |
| `_locales/en/messages.json` | 英文文案 | 英文界面与提示 |
| `manifest.firefox.json` | Firefox 适配清单 | 跨浏览器兼容配置 |

---

## 5. 非运行时目录（低优先级索引）
以下内容不属于扩展运行时核心逻辑，通常在排查主流程时可后置读取：
- `archive/`：归档资料、上架素材、历史脚本
- `scripts/`：打包与发布脚本
- `icons/`：图标与宣传图

---

## 6. 功能改动时的快速定位规则
- 改“分类不准/模型切换/请求超时”：优先看 `utils/llm.js` + `background.js`
- 改“收藏后放错位置/重复收藏”：优先看 `background.js` + `utils/bookmark.js`
- 改“悬浮按钮显示/交互异常”：优先看 `content.js` + `content.css` + `options/options.js`
- 改“历史记录显示或取消收藏”：优先看 `popup/popup.js` + `options/options.js` + `utils/history.js`
- 改“权限、注入范围、快捷键”：优先看 `manifest.json`
- 改“文案、语言切换”：优先看 `_locales/*/messages.json` + `utils/i18n.js`

---

## 7. 索引建议（给 AI Agent）
- 首轮读取顺序建议：`manifest.json` -> `background.js` -> `utils/llm.js` -> `content.js` -> `popup/popup.js` -> `options/options.js` -> `manager/main.js`
- 先确认“触发入口”和“消息流向”，再定位具体模块。
- 涉及行为回归时，优先检查 `background.js` 是否改动，因为它是主流程汇聚点。
- 若仅是 UI 文案问题，避免深入业务层，直接索引 `_locales` 与对应页面脚本。
