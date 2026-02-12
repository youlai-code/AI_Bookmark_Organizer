import { t } from './i18n.js';

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
      if (attempt > 0) console.log(`Retry attempt ${attempt}/${retries}...`);
      const response = await fetchWithTimeout(resource, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      console.warn(`Request failed (attempt ${attempt + 1}):`, error.message);
      if (attempt < retries) await sleep(RETRY_DELAY * (attempt + 1));
    }
  }
  throw lastError;
}

// === Prompt Engineering ===

function generatePrompt(lang, title, url, content, existingFolders, allowNewFolders, enableRename) {
  const foldersStr = existingFolders.length > 0 ? existingFolders.join(', ') : (lang === 'en' ? 'None' : '无');
  const description = content.description || '';
  const keywords = content.keywords || '';
  
  const baseInfo = `
Page Title: ${title}
URL: ${url}
Description: ${description}
Keywords: ${keywords}
Existing Folders: ${foldersStr}
Allow New Folders: ${allowNewFolders ? 'Yes' : 'No'}
`;

  if (lang === 'en') {
    return `Analyze the web page info and categorize it.
${baseInfo}

Rules:
1. Best Match: Choose the most appropriate folder from "Existing Folders".
2. New Folder: If no match and allowed, create a short (1-3 words) English category (e.g., Tech, News).
3. Fallback: If not allowed to create new, force pick closest existing or "Default".
${enableRename ? `4. JSON Output ONLY: {"category": "Name", "title": "Simplified Title"}` : `4. Output ONLY the category name.`}`;
  } else {
    return `请分析网页信息并进行书签分类。
${baseInfo}

规则：
1. 优先匹配：从“Existing Folders”中选择最合适的。
2. 新建分类：如无匹配且允许新建，返回简短中文分类（如：技术文档、新闻）。
3. 兜底：若不允许新建，强制选最接近的现有分类，或返回“默认收藏”。
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
    console.warn('JSON parse failed, using raw text:', e);
    category = text.replace(/["'。]/g, '').trim();
  }

  return { category, title: enableRename ? title : originalTitle };
}

// === Main Classification Entry ===

export async function classifyWithLLM(title, url, content, existingFolders = [], allowNewFolders = true, enableRename = false) {
  const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'model', 'ollamaHost', 'baseUrl', 'language']);
  const lang = config.language || 'zh_CN';
  
  const prompt = generatePrompt(lang, title, url, content, existingFolders, allowNewFolders, enableRename);
  console.log('[LLM] Prompt generated for:', config.llmProvider || 'default');

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
      case 'chrome_builtin':
        resultText = await callChromeBuiltInAI(prompt);
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
    console.error('[LLM] Provider call failed:', error);
    throw error;
  }

  console.log('[LLM] Raw Response:', resultText);
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

// === Chrome Built-in AI ===

async function callChromeBuiltInAI(prompt) {
  try {
    await setupOffscreenDocument();
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Chrome AI timed out')), 60000)
    );
    
    const requestPromise = chrome.runtime.sendMessage({
      type: 'PROMPT_AI',
      target: 'offscreen',
      prompt: prompt
    });
    
    const response = await Promise.race([requestPromise, timeoutPromise]);
    if (response?.error) throw new Error(response.error);
    if (response?.result) return response.result;
    throw new Error('Unknown Chrome AI error');
  } catch (e) {
    if (e.message.includes('timed out')) throw e;
    throw new Error('Chrome AI failed: ' + e.message);
  }
}

// === Helpers ===

function resolveEndpoint(base, suffix) {
  let url = base;
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (!url.endsWith(suffix)) url += suffix;
  return url;
}

async function postJson(url, headers, body) {
  console.log(`[POST] ${url}`);
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return await response.json();
}

// Offscreen Management
let creatingOffscreen;
const OFFSCREEN_PATH = 'offscreen/offscreen.html';

async function setupOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });
  if (contexts.length > 0) return;

  if (creatingOffscreen) await creatingOffscreen;
  else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['DOM_PARSER'],
      justification: 'AI Prompt'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}
