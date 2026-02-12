import { t } from './i18n.js';
import { log, warn, error } from './logger.js';

const OFFICIAL_PROXY = 'https://youlainote.cloud';
const DEFAULT_TIMEOUT = 20000; // 20 seconds
const MAX_RETRIES = 1; 
const RETRY_DELAY = 1000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === Network Utilities ===

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = DEFAULT_TIMEOUT } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(t('errorTimeout') || 'Request timed out');
    }
    throw error;
  }
}

async function fetchWithRetry(resource, options = {}, retries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) log(`Retry attempt ${attempt}/${retries}...`);
      const response = await fetchWithTimeout(resource, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      warn(`Request failed (attempt ${attempt + 1}):`, error.message);
      if (attempt < retries) await sleep(RETRY_DELAY * (attempt + 1));
    }
  }
  throw lastError;
}

// === Prompt Engineering ===

function generatePrompt(lang, title, url, content, existingFolders, folderCreationLevel, enableRename) {
  // Backwards compatibility for boolean
  if (typeof folderCreationLevel === 'boolean') {
    folderCreationLevel = folderCreationLevel ? 'medium' : 'off';
  }
  // Default fallback
  if (!['off', 'weak', 'medium', 'strong'].includes(folderCreationLevel)) {
    folderCreationLevel = 'medium';
  }

  const foldersStr = existingFolders.length > 0 ? existingFolders.join(', ') : (lang === 'en' ? 'None' : '无');
  const description = content.description || '';
  const keywords = content.keywords || '';

  let strategyEn = '';
  let strategyZh = '';

  switch (folderCreationLevel) {
    case 'off':
      strategyEn = 'Strictly choose from "Existing Folders". Do NOT create new folders.';
      strategyZh = '严格从“Existing Folders”中选择。禁止新建文件夹。';
      break;
    case 'weak':
      strategyEn = 'Prioritize "Existing Folders". Only create a new folder if the content is completely unrelated to any existing ones.';
      strategyZh = '优先使用现有文件夹。只有在内容与现有文件夹完全无关时才新建。';
      break;
    case 'strong':
      strategyEn = 'Create a new specific folder if the existing ones are not a perfect fit. Prioritize accuracy.';
      strategyZh = '如果现有文件夹不够精准，请积极新建文件夹。优先保证分类准确性。';
      break;
    case 'medium':
    default:
      strategyEn = 'Choose an existing folder if it fits well. Otherwise, create a new relevant folder.';
      strategyZh = '如果现有文件夹合适则使用，否则新建一个相关文件夹。';
      break;
  }
  
  const baseInfo = `
Page Title: ${title}
URL: ${url}
Description: ${description}
Keywords: ${keywords}
Existing Folders: ${foldersStr}
Folder Creation Strategy: ${folderCreationLevel}
`;

  if (lang === 'en') {
    return `Analyze the web page info and categorize it.
${baseInfo}

Rules:
1. Strategy: ${strategyEn}
2. If creating new: use a short (1-3 words) English category (e.g., Tech, News).
3. Fallback: If not allowed to create new or unsure, pick closest existing or "Default".
${enableRename ? `4. JSON Output ONLY: {"category": "Name", "title": "Simplified Title"}` : `4. Output ONLY the category name.`}`;
  } else {
    return `请分析网页信息并进行书签分类。
${baseInfo}

规则：
1. 策略：${strategyZh}
2. 新建分类：如需新建，返回简短中文分类（如：技术文档、新闻）。
3. 兜底：若不满足新建条件，强制选最接近的现有分类，或返回“默认收藏”。
${enableRename ? `4. 必须返回JSON格式：{"category": "分类名", "title": "简化标题"}` : `4. 仅返回分类名称，无其他废话。`}`;
  }
}

// === Parsing Logic ===

function parseResponse(text, originalTitle, enableRename) {
  let category = 'Default';
  let title = originalTitle;

  try {
    // Try finding JSON object first
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.category) category = obj.category;
      if (obj.title && enableRename) title = obj.title;
    } else {
      // Clean up raw text
      category = text.replace(/["'。]/g, '').trim();
    }
  } catch (e) {
    warn('JSON parse failed, using raw text:', e);
    category = text.replace(/["'。]/g, '').trim();
  }

  return { category, title: enableRename ? title : originalTitle };
}

// === Main Classification Entry ===

export async function classifyWithLLM(title, url, content, existingFolders = [], allowNewFolders = true, enableRename = false) {
  const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'model', 'ollamaHost', 'baseUrl', 'language']);
  const lang = config.language || 'zh_CN';
  
  const prompt = generatePrompt(lang, title, url, content, existingFolders, allowNewFolders, enableRename);
  log('[LLM] Prompt generated for:', config.llmProvider || 'default');

  let resultText;
  try {
    switch (config.llmProvider) {
      case 'deepseek':
        resultText = await callDeepSeek(prompt, config.apiKey, config.model, config.baseUrl);
        break;
      case 'chatgpt':
        resultText = await callChatGPT(prompt, config.apiKey, config.model, config.baseUrl);
        break;
      case 'gemini':
        resultText = await callGemini(prompt, config.apiKey, config.model);
        break;
      case 'ollama':
        resultText = await callOllama(prompt, config.model, config.ollamaHost);
        break;
      case 'doubao':
        resultText = await callDoubao(prompt, config.apiKey, config.model);
        break;
      case 'default':
      default:
        resultText = await callDeepSeek(prompt, '', config.model, OFFICIAL_PROXY);
        break;
    }
  } catch (error) {
    error('[LLM] Provider call failed:', error);
    throw error;
  }

  log('[LLM] Raw Response:', resultText);
  return parseResponse(resultText, title, enableRename);
}

// === Provider Implementations ===

async function callDeepSeek(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'deepseek-chat';
  const endpoint = resolveEndpoint(baseUrl || 'https://api.deepseek.com', '/chat/completions');
  
  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const data = await postJson(endpoint, headers, body);
  return data.choices[0].message.content;
}

async function callChatGPT(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'gpt-4o-mini';
  const endpoint = resolveEndpoint(baseUrl || 'https://api.openai.com/v1', '/chat/completions');
  
  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  };

  const data = await postJson(endpoint, {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }, body);
  
  return data.choices[0].message.content;
}

async function callGemini(prompt, apiKey, model) {
  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const data = await postJson(url, { 'Content-Type': 'application/json' }, {
    contents: [{ parts: [{ text: prompt }] }]
  });
  
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Unexpected Gemini response format');
}

async function callDoubao(prompt, apiKey, model) {
  if (!model) throw new Error('Model (Endpoint ID) required for Doubao');
  
  const data = await postJson('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }, {
    model: model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  });
  
  return data.choices[0].message.content;
}

async function callOllama(prompt, model, host) {
  const endpoint = (host || 'http://localhost:11434').replace(/\/$/, '') + '/api/generate';
  const data = await postJson(endpoint, { 'Content-Type': 'application/json' }, {
    model: model || 'llama3',
    prompt: prompt,
    stream: false
  });
  return data.response;
}

// === Helpers ===

function resolveEndpoint(base, suffix) {
  let url = base;
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (!url.endsWith(suffix)) url += suffix;
  return url;
}

async function postJson(url, headers, body) {
  log(`[POST] ${url}`);
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return await response.json();
}
