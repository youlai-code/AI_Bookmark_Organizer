import { translations } from './locales.js';

const OFFICIAL_PROXY = 'https://aibookmark.tenb68.workers.dev';

export async function classifyWithLLM(title, url, content, existingFolders = [], allowNewFolders = true, enableRename = false) {
  const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'model', 'ollamaHost', 'baseUrl', 'language']);
  
  // Determine language
  let lang = config.language || 'zh-CN';
  if (!translations[lang]) {
      const prefix = lang.split('-')[0];
      lang = translations[prefix] ? prefix : 'zh-CN';
  }
  const t = translations[lang] || translations['zh-CN'];
  const defaultFolder = t.folder_default || 'Default Bookmark';

  const foldersStr = existingFolders.length > 0 ? existingFolders.join(', ') : 'None';
  
  let prompt = `Analyze the following web page information and return a suitable bookmark folder name.

Target Language: ${lang} (${t.prompt_lang_instruction || 'Respond in this language'})

Existing Folders: ${foldersStr}
Allow New Folders: ${allowNewFolders ? 'Yes' : 'No'}

Page Info:
Title: ${title}
URL: ${url}
Description: ${content.description || ''}
Keywords: ${content.keywords || ''}

Rules:
1. Prioritize selecting the best match from "Existing Folders".
2. If no match in existing folders:
   - If "Allow New Folders" is Yes: Create a new, short (2-4 words) category name in the Target Language.
   - If "Allow New Folders" is No: Forcefully select the closest match from the list. If absolutely no relation, return "${defaultFolder}".`;

  if (enableRename) {
    prompt += `
3. Also generate a simplified title for the bookmark (remove irrelevant suffixes, keep core content).
4. You MUST return JSON format as follows:
{"category": "Folder Name", "title": "Simplified Title"}
Do not include markdown code block markers, just the raw JSON string.`;
  } else {
    prompt += `
3. Return ONLY the folder name. Do not include any explanation or other text.`;
  }

  console.log('=== LLM Request Prompt ===\n', prompt);

  let resultText;
  
  try {
    if (config.llmProvider === 'default') {
       // 使用默认代理 (DeepSeek via Worker)
       resultText = await callDeepSeek(prompt, '', config.model, OFFICIAL_PROXY);
    } else if (config.llmProvider === 'deepseek') {
      // 用户界面已隐藏 Base URL，强制使用官方默认地址 (避免读取到其他 Provider 设置的 Base URL)
      resultText = await callDeepSeek(prompt, config.apiKey, config.model, null);
    } else if (config.llmProvider === 'chatgpt') {
      resultText = await callChatGPT(prompt, config.apiKey, config.model, config.baseUrl);
    } else if (config.llmProvider === 'gemini') {
      resultText = await callGemini(prompt, config.apiKey, config.model);
    } else if (config.llmProvider === 'chrome_builtin') {
      resultText = await callChromeBuiltInAI(prompt);
    } else if (config.llmProvider === 'ollama') {
      resultText = await callOllama(prompt, config.model, config.ollamaHost);
    } else if (config.llmProvider === 'doubao') {
      resultText = await callDoubao(prompt, config.apiKey, config.model);
    } else {
      // Fallback or error
      if (!config.llmProvider) {
          // 如果未配置，默认尝试使用 Default
          resultText = await callDeepSeek(prompt, '', config.model, OFFICIAL_PROXY);
      } else {
          throw new Error('未配置有效的 LLM 提供商');
      }
    }
  } catch (error) {
    console.error('LLM调用失败:', error);
    throw error;
  }

  console.log('=== LLM Response ===\n', resultText);

  // 解析结果
  let category = defaultFolder;
  let newTitle = title;

  try {
    // 尝试解析 JSON
    // 有时候 LLM 会用 ```json ... ``` 包裹
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const jsonObj = JSON.parse(jsonStr);
      if (jsonObj.category) category = jsonObj.category;
      if (jsonObj.title) newTitle = jsonObj.title;
    } else {
      // 如果不是 JSON，假设是纯文本分类名 (旧逻辑兼容)
      category = resultText.replace(/["'。]/g, '').trim();
    }
  } catch (e) {
    console.warn('解析LLM响应失败，使用原始内容作为分类:', e);
    category = resultText.replace(/["'。]/g, '').trim();
  }

  // 如果没有启用重命名，强制使用原标题
  if (!enableRename) {
    newTitle = title;
  }

  return { category, title: newTitle };
}

async function callDeepSeek(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'deepseek-chat';
  // Use custom Base URL if provided, otherwise default to official API
  const apiEndpoint = baseUrl ? baseUrl : 'https://api.deepseek.com/chat/completions';
  
  // If baseUrl is just the host (e.g. https://api.deepseek.com), append path
  const finalUrl = apiEndpoint.endsWith('/chat/completions') 
    ? apiEndpoint 
    : (apiEndpoint.endsWith('/') ? apiEndpoint + 'chat/completions' : apiEndpoint + '/chat/completions');

  console.log('Calling DeepSeek API at:', finalUrl);

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callChatGPT(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'gpt-4o-mini';
  const apiEndpoint = baseUrl ? baseUrl : 'https://api.openai.com/v1/chat/completions';
  
  const finalUrl = apiEndpoint.endsWith('/chat/completions') 
    ? apiEndpoint 
    : (apiEndpoint.endsWith('/') ? apiEndpoint + 'chat/completions' : apiEndpoint + '/chat/completions');

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ChatGPT API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callGemini(prompt, apiKey, model) {
  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  // Gemini response structure: candidates[0].content.parts[0].text
  if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text.trim();
  } else {
      throw new Error('Gemini API returned unexpected format');
  }
}

async function callDoubao(prompt, apiKey, model) {
  if (!model) {
      throw new Error('使用豆包需要配置 Model (Endpoint ID)');
  }

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Doubao API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callOllama(prompt, model, host) {
  const modelName = model || 'llama3';
  const apiHost = host || 'http://localhost:11434';
  
  // Ollama generate API
  const response = await fetch(`${apiHost}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      prompt: prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama Error: ${response.status}`);
  }

  const data = await response.json();
  return data.response.trim();
}

// Offscreen Document Management for Chrome Built-in AI
let creatingOffscreen;
const OFFSCREEN_PATH = 'offscreen/offscreen.html';

async function setupOffscreenDocument() {
  // Check if offscreen document exists
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });

  if (contexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['DOM_PARSER'],
      justification: 'Running AI prompt in window context'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

async function callChromeBuiltInAI(prompt) {
  try {
    await setupOffscreenDocument();
    
    const response = await chrome.runtime.sendMessage({
      type: 'PROMPT_AI',
      target: 'offscreen',
      prompt: prompt
    });

    if (response && response.error) {
      throw new Error(response.error);
    }
    
    if (response && response.result) {
      return response.result.trim();
    }
    
    throw new Error('Unknown error from Chrome AI');
  } catch (e) {
    console.error('Chrome AI Call Failed:', e);
    throw new Error('Chrome Built-in AI 调用失败，请确保浏览器版本支持并已开启相关功能: ' + e.message);
  }
}
